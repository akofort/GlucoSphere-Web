import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type LogEntry } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";

function formatTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale);
}

export default function PerformanceLogPage() {
  const { t, language } = useLanguage();
  const locale = language === "DE" ? "de-DE" : "en-US";
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getPerformanceLog().then((r) => {
      setEntries(r.entries);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const clear = async () => {
    await api.clearPerformanceLog();
    setEntries([]);
  };

  const shareText = () => {
    if (entries.length === 0) return `GlucoSphere -- ${t.perfLogTitle}: ${t.perfLogEmpty}`;
    const lines = entries.map((e) => {
      const tokens = e.promptTokens != null && e.completionTokens != null ? `${t.perfLogTokens(e.promptTokens, e.completionTokens)} · ` : "";
      const status = e.success ? t.perfLogOk : `${e.errorMessage}`;
      return `${formatTime(e.createdAt, locale)} | ${e.provider} · ${e.model} | ${e.purpose} | ${tokens}${e.durationMs}ms | ${status}`;
    });
    return `GlucoSphere -- ${t.perfLogTitle} (${entries.length})\n\n${lines.join("\n")}`;
  };

  const copyShareText = async () => {
    await navigator.clipboard.writeText(shareText());
  };

  return (
    <SettingsScaffold title={t.perfLogTitle}>
      <div className="card">
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.perfLogHint}</p>
        <div className="btn-row">
          <button className="btn" onClick={copyShareText} disabled={entries.length === 0}>
            {t.perfLogCopy}
          </button>
          <button className="btn" onClick={clear} disabled={entries.length === 0}>
            {t.perfLogClear}
          </button>
        </div>
      </div>

      {loading && <div className="empty-state">{t.loading}</div>}
      {!loading && entries.length === 0 && <div className="empty-state">{t.perfLogEmpty}</div>}

      {entries.map((e) => (
        <div key={e.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            <span>{formatTime(e.createdAt, locale)}</span>
            <span>{e.durationMs}ms</span>
          </div>
          <div style={{ fontWeight: 600 }}>
            {e.provider} · {e.model} ({e.purpose})
          </div>
          {e.promptTokens != null && e.completionTokens != null && (
            <div style={{ fontSize: "0.85rem" }}>{t.perfLogTokens(e.promptTokens, e.completionTokens)}</div>
          )}
          {e.success ? (
            <div style={{ color: "var(--green-text)", fontSize: "0.85rem" }}>{t.perfLogOk}</div>
          ) : (
            <div style={{ color: "var(--red-text)", fontSize: "0.85rem" }}>{e.errorMessage}</div>
          )}
        </div>
      ))}
    </SettingsScaffold>
  );
}
