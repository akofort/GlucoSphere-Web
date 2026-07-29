import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ChatMessage, type ChatSession } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";
import { escapeHtml, patientHeaderHtml, printAsPdf } from "../lib/pdfExport";
import { stripMarkdownForSpeech, ttsSupported } from "../lib/tts";

function markdownToHtml(content: string): string {
  return renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>);
}

function formatTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

function defaultChatTitle(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Chat-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ChatPage() {
  const { t, language } = useLanguage();
  const locale = language === "DE" ? "de-DE" : "en-US";
  const { user, patientProfile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastToolActivity, setLastToolActivity] = useState<string[]>([]);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadSessions = async () => {
    const { sessions: list } = await api.listSessions();
    setSessions(list);
    return list;
  };

  const openSession = async (id: string) => {
    setSessionId(id);
    setShowHistory(false);
    const { messages: msgs } = await api.getMessages(id);
    setMessages(msgs);
  };

  useEffect(() => {
    (async () => {
      const list = await loadSessions();
      let id = list[0]?.id;
      if (!id) {
        const created = await api.createSession(defaultChatTitle());
        id = created.id;
        await loadSessions();
      }
      await openSession(id);
      const autoSend = (location.state as { autoSend?: string } | null)?.autoSend;
      if (autoSend) {
        navigate(location.pathname, { replace: true, state: {} });
        await send(autoSend, id);
      }
    })();
    return () => {
      if (ttsSupported) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow the textarea with content, up to a max height, then scroll internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const send = async (rawContent: string, targetSessionId: string | null) => {
    const content = rawContent.trim();
    if (!content || !targetSessionId || sending) return;
    setInput("");
    setError(null);
    setLastToolActivity([]);
    setSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setMessages((prev) => [
      ...prev,
      { id: -1, sessionId: targetSessionId, role: "user", content, createdAt: Date.now() },
    ]);
    try {
      const { toolActivity } = await api.sendMessage(targetSessionId, content, controller.signal);
      setLastToolActivity(toolActivity.map((t) => t.name));
      const { messages: msgs } = await api.getMessages(targetSessionId);
      setMessages(msgs);
    } catch (err) {
      // Aborted by the user via the stop button -- not a real error, the backend call (and any
      // partial assistant work behind it) was cut off; nothing new to show, just stop "loading".
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSending(false);
      abortControllerRef.current = null;
    }
  };

  const stopGenerating = () => {
    abortControllerRef.current?.abort();
  };

  const startNewChat = async () => {
    const created = await api.createSession(defaultChatTitle());
    await loadSessions();
    await openSession(created.id);
  };

  const startRename = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(s.id);
    setRenamingValue(s.title || defaultChatTitle());
  };

  const commitRename = async () => {
    const id = renamingId;
    const title = renamingValue.trim();
    setRenamingId(null);
    if (!id || !title) return;
    await api.renameSession(id, title);
    await loadSessions();
  };

  const removeSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.deleteSession(id);
    const list = await loadSessions();
    if (id === sessionId) {
      if (list.length > 0) {
        await openSession(list[0].id);
      } else {
        await startNewChat();
      }
    }
  };

  const clearHistory = async () => {
    if (!sessionId) return;
    if (!window.confirm(t.chatDeleteHistoryText)) return;
    await api.clearMessages(sessionId);
    setMessages([]);
  };

  const toggleReadAloud = (message: ChatMessage) => {
    if (!ttsSupported) return;
    if (speakingId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(message.content));
    utterance.lang = language === "DE" ? "de-DE" : "en-US";
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utterance);
    setSpeakingId(message.id);
  };

  const exportPdf = (message: ChatMessage, index: number) => {
    const question = index > 0 ? messages[index - 1] : null;
    const body = `
      ${patientHeaderHtml(user, patientProfile, t)}
      ${question?.role === "user" ? `<h2>${t.navChat}</h2><p><strong>${escapeHtml(question.content)}</strong></p>` : ""}
      <div class="markdown">${markdownToHtml(message.content)}</div>
    `;
    printAsPdf("GlucoSphere - " + t.navChat, body);
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1>{t.navChat}</h1>
        </div>
        <div className="topbar-actions">
          <button onClick={clearHistory} title={t.chatDeleteHistory} disabled={messages.length === 0}>
            🗑️
          </button>
          <button onClick={() => setShowHistory((v) => !v)} title={t.chatHistory}>
            🕐
          </button>
          <Link to="/settings">
            <button>⚙️</button>
          </Link>
          <button onClick={() => logout()} title={t.accountLogout}>
            🚪
          </button>
        </div>

        {showHistory && (
          <div className="chat-history-panel">
            <div className="session-row" onClick={startNewChat} style={{ fontWeight: 600 }}>
              {t.chatNewChat}
            </div>
            {sessions.length === 0 && <div style={{ padding: 14, color: "var(--text-muted)", fontSize: "0.85rem" }}>{t.chatNoSessions}</div>}
            {sessions.map((s) =>
              renamingId === s.id ? (
                <div key={s.id} className="session-row" style={{ gap: 6 }}>
                  <input
                    autoFocus
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={commitRename}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              ) : (
                <div
                  key={s.id}
                  className={`session-row ${s.id === sessionId ? "active" : ""}`}
                  onClick={() => openSession(s.id)}
                >
                  <span>{s.title || t.chatUntitled}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button onClick={(e) => startRename(s, e)} title={t.chatRename}>
                      ✏️
                    </button>
                    <button onClick={(e) => removeSession(s.id, e)}>🗑️</button>
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>
      <div className="content chat-content">
        {messages.length === 0 && <div className="empty-state">{t.chatEmptyState}</div>}
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={m.id}>
              {i === messages.length - 1 && m.role === "assistant" && lastToolActivity.length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                  🔧 {lastToolActivity.join(", ")}
                </div>
              )}
              <div
                className={`chat-bubble ${m.role}`}
                style={m.success === false ? { border: "1px solid var(--red-text)" } : undefined}
              >
                {m.role === "assistant" ? (
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: m.success === false ? "var(--red-text)" : "var(--text-muted)",
                  textAlign: m.role === "user" ? "right" : "left",
                  marginTop: 2,
                }}
              >
                {formatTime(m.createdAt, locale)}
                {m.role === "assistant" && m.durationMs != null && ` · ⚡ ${(m.durationMs / 1000).toFixed(1)}s`}
                {m.success === false && ` · ⚠️ ${t.chatFailed}`}
              </div>
              {m.role === "assistant" && m.id !== -1 && (
                <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: "0.75rem" }}>
                  <button
                    onClick={() => exportPdf(m, i)}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                  >
                    📄 {t.chatExportPdf}
                  </button>
                  {ttsSupported && (
                    <button
                      onClick={() => toggleReadAloud(m)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                    >
                      {speakingId === m.id ? `⏹ ${t.chatStopReading}` : `🔊 ${t.chatReadAloud}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {sending && <div className="chat-bubble assistant">{t.chatComposing}</div>}
        </div>
        {error && <div className="test-result error">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <button type="button" onClick={startNewChat} title={t.chatNewChat} className="chat-new-btn">
          +
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input, sessionId);
            }
          }}
          placeholder={t.chatPlaceholder}
          disabled={sending}
        />
        {sending ? (
          <button type="button" onClick={stopGenerating} className="chat-stop-btn" title={t.chatStop}>
            ⏹ {t.chatStop}
          </button>
        ) : (
          <button type="button" onClick={() => send(input, sessionId)} disabled={!input.trim()}>
            {t.chatSend}
          </button>
        )}
      </div>
    </div>
  );
}
