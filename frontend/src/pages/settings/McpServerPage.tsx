import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type Settings, type SourceHealth } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";

/** Same GREEN/YELLOW/RED convention as DataSourcesPage.tsx's own HealthDot -- kept as a local
 * copy here since that one isn't exported, and this page only ever needs the 3 sources the MCP
 * tools actually query (nightscout, withings, google_health), not the full source list. */
function HealthDot({ health }: { health: SourceHealth | undefined }) {
  if (!health) return null;
  const icon = health.status === "GREEN" ? "🟢" : health.status === "YELLOW" ? "🟡" : "🔴";
  return <span title={health.message}>{icon}</span>;
}

const _MCP_TOOL_NAMES = [
  "get_raw_glucose_entries",
  "get_raw_device_events",
  "get_24h_traffic_light_status",
  "get_patient_clinical_profile",
  "get_combined_health_summary",
  "get_data_gap_report",
  "get_sleep_analysis",
  "get_workout_activity_log",
  "get_cardio_metrics",
];

const _HEALTH_SOURCES: { id: string; label: string }[] = [
  { id: "nightscout", label: "Nightscout" },
  { id: "withings", label: "Withings" },
  { id: "google_health", label: "Google Health" },
];

export default function McpServerPage() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Record<string, SourceHealth>>({});
  const [generating, setGenerating] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getDataSourcesHealth().then((r) => setHealth(r.sources));
  }, []);

  const endpoint = `${window.location.origin}/api/mcp`;
  const token = settings?.mcpServerToken ?? "";

  const generateToken = async () => {
    if (token && !window.confirm(t.mcpServerRegenerateWarning)) return;
    setGenerating(true);
    try {
      const res = await api.regenerateMcpServerToken();
      setSettings((prev) => (prev ? { ...prev, mcpServerToken: res.token } : prev));
      setTokenCopied(false);
    } finally {
      setGenerating(false);
    }
  };

  const copyText = async (text: string, marker: "token" | string, setter: (v: boolean) => void, groupSetter?: (v: string | null) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      groupSetter?.(marker);
      setTimeout(() => {
        setter(false);
        groupSetter?.(null);
      }, 2000);
    } catch {
      // clipboard API unavailable -- the field is still selectable/copyable manually
    }
  };

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        "glucosphere-web": {
          type: "streamable-http",
          url: endpoint,
          headers: { Authorization: `Bearer ${token || "<TOKEN>"}` },
        },
      },
    },
    null,
    2,
  );

  const openWebUiConfig = JSON.stringify(
    {
      url: endpoint,
      headers: { Authorization: `Bearer ${token || "<TOKEN>"}` },
    },
    null,
    2,
  );

  if (!settings) return <SettingsScaffold title={t.mcpServerPageTitle}>{t.loading}</SettingsScaffold>;

  return (
    <SettingsScaffold title={t.mcpServerPageTitle}>
      <details className="card" open>
        <summary>
          <h2>{t.mcpServerTokenSectionTitle}</h2>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.mcpServerTokenHint}</p>

        <div className="field">
          <label>{t.mcpServerEndpointLabel}</label>
          <input type="text" value={endpoint} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
        </div>

        <div className="field">
          <label>{t.mcpEditorToken}</label>
          <input
            type="text"
            value={token || t.mcpServerTokenNotGenerated}
            readOnly
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
        </div>

        <div className="btn-row">
          <button className="btn primary" onClick={generateToken} disabled={generating}>
            {generating ? t.genericSaving : token ? t.mcpServerRegenerateToken : t.mcpServerGenerateToken}
          </button>
          {token && (
            <button className="btn" onClick={() => copyText(token, "token", setTokenCopied)}>
              {tokenCopied ? t.genericCopied : t.mcpServerCopyToken}
            </button>
          )}
        </div>
      </details>

      <details className="card">
        <summary>
          <h2>{t.mcpServerToolsSectionTitle}</h2>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.mcpServerToolsHint}</p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.85rem" }}>
          {_MCP_TOOL_NAMES.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </details>

      <details className="card">
        <summary>
          <h2>{t.mcpServerConfigSectionTitle}</h2>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.mcpServerConfigHint}</p>
        {!token && <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.mcpServerConfigNoTokenHint}</p>}

        <div className="field">
          <label>{t.mcpServerConfigClaudeDesktopTitle}</label>
          <pre style={{ overflowX: "auto", fontSize: "0.8rem", background: "var(--surface-alt, rgba(128,128,128,0.08))", padding: 12, borderRadius: 8 }}>
            {claudeDesktopConfig}
          </pre>
          <button className="btn" onClick={() => copyText(claudeDesktopConfig, "claude", () => {}, setConfigCopied)}>
            {configCopied === "claude" ? t.genericCopied : t.genericCopy}
          </button>
        </div>

        <div className="field">
          <label>{t.mcpServerConfigOpenWebUiTitle}</label>
          <pre style={{ overflowX: "auto", fontSize: "0.8rem", background: "var(--surface-alt, rgba(128,128,128,0.08))", padding: 12, borderRadius: 8 }}>
            {openWebUiConfig}
          </pre>
          <button className="btn" onClick={() => copyText(openWebUiConfig, "openwebui", () => {}, setConfigCopied)}>
            {configCopied === "openwebui" ? t.genericCopied : t.genericCopy}
          </button>
        </div>
      </details>

      <details className="card">
        <summary>
          <h2>{t.mcpServerHealthSectionTitle}</h2>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.mcpServerHealthHint}</p>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: "0.9rem" }}>
          {_HEALTH_SOURCES.map((s) => (
            <li key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <HealthDot health={health[s.id]} />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </details>
    </SettingsScaffold>
  );
}
