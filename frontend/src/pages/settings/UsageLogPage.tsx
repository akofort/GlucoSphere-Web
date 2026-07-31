import { useEffect, useMemo, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type UsageLogEntry } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";

const EVENTS = ["LOGIN", "LOGIN_FAILED", "LOGOUT", "CHAT", "TOOL", "DASHBOARD", "ACCESS"] as const;

// One accent per event kind so a long list is scannable without reading every label -- reuses the
// palette variables so it stays correct in all six color themes.
const EVENT_COLORS: Record<string, string> = {
  LOGIN: "var(--green-text)",
  LOGIN_FAILED: "var(--red-text)",
  LOGOUT: "var(--text-muted)",
  CHAT: "var(--accent)",
  TOOL: "var(--mcp-color)",
  DASHBOARD: "var(--rest-api-color)",
  ACCESS: "var(--text-muted)",
};

function formatTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale);
}

export default function UsageLogPage() {
  const { t, language } = useLanguage();
  const locale = language === "DE" ? "de-DE" : "en-US";
  const [entries, setEntries] = useState<UsageLogEntry[]>([]);
  const [accessLogEnabled, setAccessLogEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const result = await api.getUsageLog();
    setEntries(result.entries);
    setAccessLogEnabled(result.accessLogEnabled);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAccessLog = async () => {
    const next = !accessLogEnabled;
    setAccessLogEnabled(next);
    await api.updateSettings({ accessLogEnabled: next });
  };

  const clear = async () => {
    if (!window.confirm(t.usageLogClearConfirm)) return;
    await api.clearUsageLog();
    setEntries([]);
  };

  const usernames = useMemo(
    () => Array.from(new Set(entries.map((e) => e.username).filter(Boolean))).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (eventFilter && e.event !== eventFilter) return false;
      if (userFilter && e.username !== userFilter) return false;
      if (!needle) return true;
      return [e.detail, e.path, e.method, e.username, e.event].some((field) =>
        (field ?? "").toLowerCase().includes(needle),
      );
    });
  }, [entries, eventFilter, userFilter, search]);

  return (
    <SettingsScaffold title={t.usageLogTitle} back="/settings/logging">
      <div className="card">
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.usageLogHint}</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={accessLogEnabled} onChange={toggleAccessLog} />
          <span>{t.usageLogAccessToggle}</span>
        </label>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.usageLogAccessHint}</p>
        <div className="btn-row">
          <button className="btn" onClick={load}>
            ⟳ {t.overviewRefresh}
          </button>
          <button className="btn" onClick={clear} disabled={entries.length === 0}>
            {t.usageLogClear}
          </button>
        </div>
      </div>

      <div className="card">
        <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4 }}>
          {t.usageLogFilterEvent}
        </label>
        <div className="range-chips">
          <button className={`chip ${eventFilter === "" ? "selected" : ""}`} onClick={() => setEventFilter("")}>
            {t.usageLogAll}
          </button>
          {EVENTS.map((event) => (
            <button
              key={event}
              className={`chip ${eventFilter === event ? "selected" : ""}`}
              onClick={() => setEventFilter(event)}
            >
              {t.usageLogEventLabel(event)}
            </button>
          ))}
        </div>

        {usernames.length > 1 && (
          <>
            <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", margin: "12px 0 4px" }}>
              {t.usageLogFilterUser}
            </label>
            <div className="range-chips">
              <button className={`chip ${userFilter === "" ? "selected" : ""}`} onClick={() => setUserFilter("")}>
                {t.usageLogAll}
              </button>
              {usernames.map((name) => (
                <button
                  key={name}
                  className={`chip ${userFilter === name ? "selected" : ""}`}
                  onClick={() => setUserFilter(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}

        <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", margin: "12px 0 4px" }}>
          {t.usageLogSearch}
        </label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.usageLogSearchPlaceholder} />
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 0 }}>
          {t.usageLogCount(filtered.length, entries.length)}
        </p>
      </div>

      {loading && <div className="empty-state">{t.loading}</div>}
      {!loading && entries.length === 0 && <div className="empty-state">{t.usageLogEmpty}</div>}
      {!loading && entries.length > 0 && filtered.length === 0 && <div className="empty-state">{t.usageLogNoMatch}</div>}

      {filtered.map((e) => (
        <div key={e.id} className="card" style={{ marginBottom: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <span style={{ color: EVENT_COLORS[e.event] ?? "var(--text-muted)", fontWeight: 600 }}>
              {t.usageLogEventLabel(e.event)}
            </span>
            <span>{formatTime(e.createdAt, locale)}</span>
          </div>
          {e.username && <div style={{ fontSize: "0.9rem" }}>{e.username}</div>}
          {e.detail && (
            <div style={{ fontSize: "0.85rem", wordBreak: "break-word" }}>{e.detail}</div>
          )}
          {e.path && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", wordBreak: "break-all" }}>
              {e.method} {e.path}
              {e.status != null && ` · ${e.status}`}
              {e.durationMs != null && ` · ${e.durationMs}ms`}
            </div>
          )}
          {!e.path && e.durationMs != null && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>⚡ {(e.durationMs / 1000).toFixed(1)}s</div>
          )}
        </div>
      ))}
    </SettingsScaffold>
  );
}
