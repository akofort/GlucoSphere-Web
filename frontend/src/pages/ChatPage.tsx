import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ChatMessage, type ChatSession, type SourceOption } from "../lib/api";
import { ClockIcon, DocumentIcon, LogoutIcon, PencilIcon, SpeakerIcon, StopIcon, TrashIcon } from "../components/Icons";
import MarkdownAnswer from "../components/MarkdownAnswer";
import NoticeList from "../components/NoticeList";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";
import { attributionHtml, escapeHtml, noticesHtml, patientHeaderHtml, printAsPdf } from "../lib/pdfExport";
import { PROVIDER_SHORT_LABELS, providerLabel } from "../lib/providerLabels";
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
  const [pendingSourceChoice, setPendingSourceChoice] = useState<{ content: string; question: string; options: SourceOption[] } | null>(null);
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

  const send = async (rawContent: string, targetSessionId: string | null, selectedSourceIds?: string[]) => {
    const content = rawContent.trim();
    if (!content || !targetSessionId || sending) return;
    // A retry call (selectedSourceIds set, from pickSource() below) answers the SAME question
    // already shown as a user bubble from the original call -- don't clear the input or push a
    // second, duplicate bubble for it.
    if (!selectedSourceIds) {
      setInput("");
      setMessages((prev) => [
        ...prev,
        { id: -1, sessionId: targetSessionId, role: "user", content, createdAt: Date.now() },
      ]);
    }
    setError(null);
    setLastToolActivity([]);
    setPendingSourceChoice(null);
    setSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await api.sendMessage(targetSessionId, content, controller.signal, selectedSourceIds);
      if (result.sourceChoiceRequired && result.question && result.options) {
        setPendingSourceChoice({ content, question: result.question, options: result.options });
        return;
      }
      setLastToolActivity((result.toolActivity ?? []).map((t) => t.name));
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

  /** Item 4's "Interaktive Rückfrage": [id] null picks "Alle Quellen" (every candidate this
   * question was ambiguous between); otherwise re-sends the same question narrowed to exactly
   * that one source. */
  const pickSource = (id: string | null) => {
    if (!pendingSourceChoice) return;
    const ids = id ? [id] : pendingSourceChoice.options.map((o) => o.id);
    send(pendingSourceChoice.content, sessionId, ids);
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
      ${attributionHtml(message.provider, message.model, message.sources, t, providerLabel)}
      ${noticesHtml(message.notices)}
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
            <TrashIcon />
          </button>
          <button onClick={() => setShowHistory((v) => !v)} title={t.chatHistory}>
            <ClockIcon />
          </button>
          <button onClick={() => logout()} title={t.accountLogout}>
            <LogoutIcon />
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
                      <PencilIcon width={16} height={16} />
                    </button>
                    <button onClick={(e) => removeSession(s.id, e)}>
                      <TrashIcon width={16} height={16} />
                    </button>
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
                    {/* Suggested questions in the answer ("Was kann ich dich fragen?") are
                        clickable and get sent straight into this chat -- see MarkdownAnswer. */}
                    <MarkdownAnswer
                      content={m.content}
                      onAskQuestion={sending ? null : (question) => send(question, sessionId)}
                    />
                  </div>
                ) : (
                  m.content
                )}
              </div>
              {m.role === "assistant" && m.notices && m.notices.length > 0 && (
                <NoticeList notices={m.notices} />
              )}
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
              {/* Same attribution as the Übersicht: which model answered, and directly below it
                  which data sources were actually queried for this answer. */}
              {m.role === "assistant" && (m.provider || (m.sources?.length ?? 0) > 0) && (
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {m.provider && m.model && (
                    <>
                      {t.overviewAnalyzedWith(PROVIDER_SHORT_LABELS[m.provider] ?? m.provider, m.model)}
                      {(m.sources?.length ?? 0) > 0 && <br />}
                    </>
                  )}
                  {(m.sources?.length ?? 0) > 0 && t.analyzedSources(m.sources!.join(", "))}
                </div>
              )}
              {m.role === "assistant" && m.id !== -1 && (
                <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: "0.75rem" }}>
                  <button
                    onClick={() => exportPdf(m, i)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0,
                    }}
                  >
                    <DocumentIcon width={15} height={15} /> {t.chatExportPdf}
                  </button>
                  {ttsSupported && (
                    <button
                      onClick={() => toggleReadAloud(m)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0,
                      }}
                    >
                      {speakingId === m.id ? <StopIcon width={15} height={15} /> : <SpeakerIcon width={15} height={15} />}
                      {speakingId === m.id ? t.chatStopReading : t.chatReadAloud}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {sending && <div className="chat-bubble assistant">{t.chatComposing}</div>}
          {pendingSourceChoice && (
            <div className="card source-choice-card">
              <p style={{ margin: "0 0 10px" }}>{pendingSourceChoice.question}</p>
              <div className="range-chips">
                {pendingSourceChoice.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="chip source-choice-btn"
                    style={{
                      borderColor: o.isRestApi ? "var(--rest-api-color)" : "var(--mcp-color)",
                      color: o.isRestApi ? "var(--rest-api-color)" : "var(--mcp-color)",
                    }}
                    onClick={() => pickSource(o.id)}
                  >
                    {o.name}
                  </button>
                ))}
                <button type="button" className="chip" onClick={() => pickSource(null)}>
                  {t.chatSourceChoiceAll}
                </button>
              </div>
            </div>
          )}
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
          <button
            type="button" onClick={stopGenerating} className="chat-stop-btn" title={t.chatStop}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <StopIcon width={16} height={16} /> {t.chatStop}
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
