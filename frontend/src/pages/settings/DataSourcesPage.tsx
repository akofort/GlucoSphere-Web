import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SettingsScaffold from "../../components/SettingsScaffold";
import McpServerEditor from "../../components/McpServerEditor";
import { api, type McpServer, type McpTool, type Settings, type SourceHealth } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";
import type { Strings } from "../../lib/strings";

function categoryLabelsFor(t: Strings): Record<string, string> {
  return {
    GLUCOSE_TREATMENTS: t.categoryGlucose,
    ACTIVITY: t.categoryActivity,
    BODY_METRICS: t.categoryBodyMetrics,
    OTHER: t.categoryOther,
  };
}

// GREEN: reachable right now. YELLOW: unreachable now but reachable on some earlier check (a
// stale token or a temporary outage, not a dead source). RED: never successfully reached.
function HealthDot({ sourceId, health }: { sourceId: string; health: Record<string, SourceHealth> }) {
  const h = health[sourceId];
  if (!h) return null;
  const icon = h.status === "GREEN" ? "🟢" : h.status === "YELLOW" ? "🟡" : "🔴";
  return <span title={h.message}>{icon}</span>;
}

function McpServerRow({
  server, onChanged, t, health,
}: { server: McpServer; onChanged: () => void; t: Strings; health: Record<string, SourceHealth> }) {
  const [editing, setEditing] = useState(false);
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [loadingTools, setLoadingTools] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const categoryLabels = categoryLabelsFor(t);

  const toggleEnabled = async () => {
    await api.saveMcpServer({ ...server, enabled: !server.enabled });
    onChanged();
  };

  const remove = async () => {
    await api.deleteMcpServer(server.id);
    onChanged();
  };

  const loadTools = async () => {
    if (showTools) {
      setShowTools(false);
      return;
    }
    setShowTools(true);
    if (tools !== null) return;
    setLoadingTools(true);
    setToolsError(null);
    try {
      const res = await api.getMcpServerTools(server.id);
      setTools(res.tools);
    } catch (err) {
      setToolsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTools(false);
    }
  };

  if (editing) {
    return (
      <McpServerEditor
        initial={server}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <details className="card">
      <summary>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <HealthDot sourceId={server.id} health={health} />
          <h2 style={{ fontSize: "1rem" }}>{server.name}</h2>
          <span className="category-tag">{categoryLabels[server.category] ?? server.category}</span>
        </div>
        <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={server.enabled} onChange={toggleEnabled} />
          {server.enabled ? t.dataSourcesActive : t.dataSourcesInactive}
        </label>
      </summary>

      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{server.transport}</div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", wordBreak: "break-all" }}>{server.url}</div>

      <div className="btn-row">
        <button className="btn" onClick={loadTools}>
          {showTools ? t.dataSourcesHideTools : t.dataSourcesShowTools}
        </button>
        <button className="btn" onClick={() => setEditing(true)}>
          {t.genericEdit}
        </button>
        <button className="btn" onClick={remove}>
          {t.genericDelete}
        </button>
      </div>

      {showTools && (
        <div style={{ marginTop: 10 }}>
          {loadingTools && <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesExploring}</div>}
          {toolsError && <div className="test-result error">{toolsError}</div>}
          {tools && tools.length === 0 && <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesNoTools}</div>}
          {tools && tools.length > 0 && (
            <ul className="tips-list">
              {tools.map((tool) => (
                <li key={tool.name} style={{ fontSize: "0.85rem" }}>
                  <strong>{tool.name}</strong>
                  {tool.description ? ` -- ${tool.description}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}

export default function DataSourcesPage() {
  const { t } = useLanguage();
  const categoryLabels = categoryLabelsFor(t);
  const [searchParams, setSearchParams] = useSearchParams();
  const oauthResult = searchParams.get("oauth");
  const googleHealthResult = searchParams.get("googleHealth");
  const withingsResult = searchParams.get("withings");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [url, setUrl] = useState("");
  const [authMethod, setAuthMethod] = useState<Settings["nightscoutApiAuthMethod"]>("API_SECRET_HEADER");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [category, setCategory] = useState("GLUCOSE_TREATMENTS");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [feelfitEmail, setFeelfitEmail] = useState("");
  const [feelfitPassword, setFeelfitPassword] = useState("");
  const [feelfitEnabled, setFeelfitEnabled] = useState(true);
  const [feelfitCategory, setFeelfitCategory] = useState("BODY_METRICS");
  const [feelfitTestResult, setFeelfitTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [feelfitTesting, setFeelfitTesting] = useState(false);
  const [feelfitSaving, setFeelfitSaving] = useState(false);

  const [dexcomUsername, setDexcomUsername] = useState("");
  const [dexcomPassword, setDexcomPassword] = useState("");
  const [dexcomRegion, setDexcomRegion] = useState<Settings["dexcomRegion"]>("US");
  const [dexcomEnabled, setDexcomEnabled] = useState(true);
  const [dexcomCategory, setDexcomCategory] = useState("GLUCOSE_TREATMENTS");
  const [dexcomTestResult, setDexcomTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dexcomTesting, setDexcomTesting] = useState(false);
  const [dexcomSaving, setDexcomSaving] = useState(false);

  const [libreEmail, setLibreEmail] = useState("");
  const [librePassword, setLibrePassword] = useState("");
  const [libreEnabled, setLibreEnabled] = useState(true);
  const [libreCategory, setLibreCategory] = useState("GLUCOSE_TREATMENTS");
  const [libreTestResult, setLibreTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [libreTesting, setLibreTesting] = useState(false);
  const [libreSaving, setLibreSaving] = useState(false);

  const [glookoUsername, setGlookoUsername] = useState("");
  const [glookoPassword, setGlookoPassword] = useState("");
  const [glookoEnabled, setGlookoEnabled] = useState(true);
  const [glookoCategory, setGlookoCategory] = useState("GLUCOSE_TREATMENTS");
  const [glookoTestResult, setGlookoTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [glookoTesting, setGlookoTesting] = useState(false);
  const [glookoSaving, setGlookoSaving] = useState(false);

  const [health, setHealth] = useState<Record<string, SourceHealth>>({});

  const [googleHealthClientId, setGoogleHealthClientId] = useState("");
  const [googleHealthClientSecret, setGoogleHealthClientSecret] = useState("");
  const [googleHealthEnabled, setGoogleHealthEnabled] = useState(true);
  const [googleHealthCategory, setGoogleHealthCategory] = useState("ACTIVITY");
  const [googleHealthLoggedIn, setGoogleHealthLoggedIn] = useState(false);
  const [googleHealthTestResult, setGoogleHealthTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [googleHealthTesting, setGoogleHealthTesting] = useState(false);
  const [googleHealthSaving, setGoogleHealthSaving] = useState(false);
  const [googleHealthLoggingIn, setGoogleHealthLoggingIn] = useState(false);
  const [redirectUriCopied, setRedirectUriCopied] = useState(false);
  const googleHealthRedirectUri = `${window.location.origin}/api/google-health/oauth/callback`;

  const [withingsClientId, setWithingsClientId] = useState("");
  const [withingsClientSecret, setWithingsClientSecret] = useState("");
  const [withingsEnabled, setWithingsEnabled] = useState(true);
  const [withingsCategory, setWithingsCategory] = useState("BODY_METRICS");
  const [withingsLoggedIn, setWithingsLoggedIn] = useState(false);
  const [withingsTestResult, setWithingsTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [withingsTesting, setWithingsTesting] = useState(false);
  const [withingsSaving, setWithingsSaving] = useState(false);
  const [withingsLoggingIn, setWithingsLoggingIn] = useState(false);
  const [withingsRedirectUriCopied, setWithingsRedirectUriCopied] = useState(false);
  const withingsRedirectUri = `${window.location.origin}/api/withings/oauth/callback`;

  const [servers, setServers] = useState<McpServer[]>([]);
  const [addingServer, setAddingServer] = useState(false);

  const loadServers = () => {
    api.listMcpServers().then((r) => setServers(r.servers));
  };

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setUrl(s.nightscoutApiUrl);
      setAuthMethod(s.nightscoutApiAuthMethod);
      setToken(s.nightscoutApiSecret);
      setEnabled(s.nightscoutApiEnabled);
      setCategory(s.nightscoutCategory);
      setFeelfitEmail(s.feelfitEmail);
      setFeelfitPassword(s.feelfitPassword);
      setFeelfitEnabled(s.feelfitEnabled);
      setFeelfitCategory(s.feelfitCategory);
      setGoogleHealthClientId(s.googleHealthClientId);
      setGoogleHealthClientSecret(s.googleHealthClientSecret);
      setGoogleHealthEnabled(s.googleHealthEnabled);
      setGoogleHealthCategory(s.googleHealthCategory);
      setGoogleHealthLoggedIn(Boolean(s.googleHealthRefreshToken));
      setWithingsClientId(s.withingsClientId);
      setWithingsClientSecret(s.withingsClientSecret);
      setWithingsEnabled(s.withingsEnabled);
      setWithingsCategory(s.withingsCategory);
      setWithingsLoggedIn(Boolean(s.withingsRefreshToken));
      setDexcomUsername(s.dexcomUsername);
      setDexcomPassword(s.dexcomPassword);
      setDexcomRegion(s.dexcomRegion);
      setDexcomEnabled(s.dexcomEnabled);
      setDexcomCategory(s.dexcomCategory);
      setLibreEmail(s.libreEmail);
      setLibrePassword(s.librePassword);
      setLibreEnabled(s.libreEnabled);
      setLibreCategory(s.libreCategory);
      setGlookoUsername(s.glookoUsername);
      setGlookoPassword(s.glookoPassword);
      setGlookoEnabled(s.glookoEnabled);
      setGlookoCategory(s.glookoCategory);
    });
    // Auto health-check on page load: fires in parallel with the settings/servers fetches above,
    // and can take a while (it logs into every configured source) -- errors are caught inside
    // getDataSourcesHealth's own per-source handling on the backend, never surfaced here as a
    // page-level error, since an unreachable source is exactly what this is meant to show.
    api.getDataSourcesHealth().then((r) => setHealth(r.sources));
    loadServers();
  }, []);

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(googleHealthRedirectUri);
      setRedirectUriCopied(true);
      setTimeout(() => setRedirectUriCopied(false), 2000);
    } catch {
      // clipboard API unavailable -- the field is still selectable/copyable manually
    }
  };

  const saveGoogleHealth = async () => {
    setGoogleHealthSaving(true);
    try {
      const updated = await api.updateSettings({
        googleHealthClientId, googleHealthClientSecret, googleHealthEnabled, googleHealthCategory,
      });
      setSettings(updated);
    } finally {
      setGoogleHealthSaving(false);
    }
  };

  const toggleGoogleHealthEnabled = async () => {
    const next = !googleHealthEnabled;
    setGoogleHealthEnabled(next);
    await api.updateSettings({ googleHealthEnabled: next });
  };

  const testGoogleHealth = async () => {
    setGoogleHealthTesting(true);
    setGoogleHealthTestResult(null);
    try {
      const res = await api.testGoogleHealth();
      setGoogleHealthTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setGoogleHealthTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setGoogleHealthTesting(false);
    }
  };

  const loginWithGoogleHealth = async () => {
    if (!googleHealthClientId.trim() || !googleHealthClientSecret.trim()) return;
    setGoogleHealthLoggingIn(true);
    try {
      await api.updateSettings({ googleHealthClientId, googleHealthClientSecret, googleHealthEnabled, googleHealthCategory });
      const { authorizeUrl } = await api.googleHealthOAuthAuthorize(googleHealthRedirectUri);
      window.location.href = authorizeUrl;
    } finally {
      setGoogleHealthLoggingIn(false);
    }
  };

  const copyWithingsRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(withingsRedirectUri);
      setWithingsRedirectUriCopied(true);
      setTimeout(() => setWithingsRedirectUriCopied(false), 2000);
    } catch {
      // clipboard API unavailable -- the field is still selectable/copyable manually
    }
  };

  const saveWithings = async () => {
    setWithingsSaving(true);
    try {
      const updated = await api.updateSettings({
        withingsClientId, withingsClientSecret, withingsEnabled, withingsCategory,
      });
      setSettings(updated);
    } finally {
      setWithingsSaving(false);
    }
  };

  const toggleWithingsEnabled = async () => {
    const next = !withingsEnabled;
    setWithingsEnabled(next);
    await api.updateSettings({ withingsEnabled: next });
  };

  const testWithings = async () => {
    setWithingsTesting(true);
    setWithingsTestResult(null);
    try {
      const res = await api.testWithings();
      setWithingsTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setWithingsTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setWithingsTesting(false);
    }
  };

  const loginWithWithings = async () => {
    if (!withingsClientId.trim() || !withingsClientSecret.trim()) return;
    setWithingsLoggingIn(true);
    try {
      await api.updateSettings({ withingsClientId, withingsClientSecret, withingsEnabled, withingsCategory });
      const { authorizeUrl } = await api.withingsOAuthAuthorize(withingsRedirectUri);
      window.location.href = authorizeUrl;
    } finally {
      setWithingsLoggingIn(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testNightscout({ url, authMethod, token });
      setTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        nightscoutApiUrl: url,
        nightscoutApiAuthMethod: authMethod,
        nightscoutApiSecret: token,
        nightscoutApiEnabled: enabled,
        nightscoutCategory: category,
      });
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  // Quick-toggle handlers for the collapsed-state switch in each section's <summary> -- send only
  // the one changed field (updateSettings merges into the existing settings) so a quick toggle
  // never accidentally persists other fields the admin might be mid-editing but hasn't saved yet.
  const toggleNightscoutEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await api.updateSettings({ nightscoutApiEnabled: next });
  };

  const testFeelfit = async () => {
    setFeelfitTesting(true);
    setFeelfitTestResult(null);
    try {
      const res = await api.testFeelfit({ email: feelfitEmail, password: feelfitPassword });
      setFeelfitTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setFeelfitTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setFeelfitTesting(false);
    }
  };

  const saveFeelfit = async () => {
    setFeelfitSaving(true);
    try {
      const updated = await api.updateSettings({
        feelfitEmail, feelfitPassword, feelfitEnabled, feelfitCategory,
      });
      setSettings(updated);
    } finally {
      setFeelfitSaving(false);
    }
  };

  const toggleFeelfitEnabled = async () => {
    const next = !feelfitEnabled;
    setFeelfitEnabled(next);
    await api.updateSettings({ feelfitEnabled: next });
  };

  const testDexcom = async () => {
    setDexcomTesting(true);
    setDexcomTestResult(null);
    try {
      const res = await api.testDexcom({ username: dexcomUsername, password: dexcomPassword, region: dexcomRegion });
      setDexcomTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setDexcomTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setDexcomTesting(false);
    }
  };

  const saveDexcom = async () => {
    setDexcomSaving(true);
    try {
      const updated = await api.updateSettings({ dexcomUsername, dexcomPassword, dexcomRegion, dexcomEnabled, dexcomCategory });
      setSettings(updated);
    } finally {
      setDexcomSaving(false);
    }
  };

  const toggleDexcomEnabled = async () => {
    const next = !dexcomEnabled;
    setDexcomEnabled(next);
    await api.updateSettings({ dexcomEnabled: next });
  };

  const testLibre = async () => {
    setLibreTesting(true);
    setLibreTestResult(null);
    try {
      const res = await api.testLibreLinkUp({ email: libreEmail, password: librePassword, region: "US" });
      setLibreTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setLibreTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLibreTesting(false);
    }
  };

  const saveLibre = async () => {
    setLibreSaving(true);
    try {
      const updated = await api.updateSettings({ libreEmail, librePassword, libreEnabled, libreCategory });
      setSettings(updated);
    } finally {
      setLibreSaving(false);
    }
  };

  const toggleLibreEnabled = async () => {
    const next = !libreEnabled;
    setLibreEnabled(next);
    await api.updateSettings({ libreEnabled: next });
  };

  const testGlooko = async () => {
    setGlookoTesting(true);
    setGlookoTestResult(null);
    try {
      const res = await api.testGlooko({ username: glookoUsername, password: glookoPassword });
      setGlookoTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setGlookoTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setGlookoTesting(false);
    }
  };

  const saveGlooko = async () => {
    setGlookoSaving(true);
    try {
      const updated = await api.updateSettings({ glookoUsername, glookoPassword, glookoEnabled, glookoCategory });
      setSettings(updated);
    } finally {
      setGlookoSaving(false);
    }
  };

  const toggleGlookoEnabled = async () => {
    const next = !glookoEnabled;
    setGlookoEnabled(next);
    await api.updateSettings({ glookoEnabled: next });
  };

  if (!settings) return <SettingsScaffold title={t.dataSourcesTitle}>{t.loading}</SettingsScaffold>;

  return (
    <SettingsScaffold title={t.dataSourcesTitle}>
      {oauthResult && (
        <div className={`test-result ${oauthResult === "success" ? "ok" : "error"}`}>
          {oauthResult === "success"
            ? `✅ ${t.mcpEditorOAuthLoggedIn}`
            : `❌ ${searchParams.get("detail") ?? oauthResult}`}
          <button
            onClick={() => setSearchParams({})}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", marginLeft: 10 }}
          >
            {t.genericClose}
          </button>
        </div>
      )}
      {googleHealthResult && (
        <div className={`test-result ${googleHealthResult === "success" ? "ok" : "error"}`}>
          {googleHealthResult === "success"
            ? `✅ ${t.dataSourcesGoogleHealthLoggedIn}`
            : `❌ ${searchParams.get("detail") ?? googleHealthResult}`}
          <button
            onClick={() => setSearchParams({})}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", marginLeft: 10 }}
          >
            {t.genericClose}
          </button>
        </div>
      )}
      {withingsResult && (
        <div className={`test-result ${withingsResult === "success" ? "ok" : "error"}`}>
          {withingsResult === "success"
            ? `✅ ${t.dataSourcesWithingsLoggedIn}`
            : `❌ ${searchParams.get("detail") ?? withingsResult}`}
          <button
            onClick={() => setSearchParams({})}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", marginLeft: 10 }}
          >
            {t.genericClose}
          </button>
        </div>
      )}
      <details className="card">
        <summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HealthDot sourceId="nightscout" health={health} />
            <h2>{t.dataSourcesNightscoutTitle}</h2>
            <span className="category-tag">{categoryLabels[category] ?? category}</span>
          </div>
          <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={enabled} onChange={toggleNightscoutEnabled} />
            {enabled ? t.dataSourcesActive : t.dataSourcesInactive}
          </label>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesNightscoutHint}</p>
        <div className="field">
          <label>{t.dataSourcesUrl}</label>
          <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setTestResult(null); }} placeholder="https://meine-instanz.herokuapp.com" />
        </div>
        <div className="field">
          <label>{t.dataSourcesAuthType}</label>
          <select value={authMethod} onChange={(e) => setAuthMethod(e.target.value as Settings["nightscoutApiAuthMethod"])}>
            <option value="NONE">{t.dataSourcesAuthNone}</option>
            <option value="API_SECRET_HEADER">{t.dataSourcesAuthApiSecret}</option>
            <option value="BEARER_TOKEN">{t.dataSourcesAuthBearer}</option>
          </select>
        </div>
        <div className="field">
          <label>{t.dataSourcesToken}</label>
          <input type="password" value={token} onChange={(e) => { setToken(e.target.value); setTestResult(null); }} />
        </div>
        <div className="field">
          <label>{t.dataSourcesCategoryLabel}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(categoryLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        {testResult && <div className={`test-result ${testResult.ok ? "ok" : "error"}`}>{testResult.message}</div>}

        <div className="btn-row">
          <button className="btn" onClick={test} disabled={testing || !url.trim()}>
            {testing ? t.genericTesting : t.dataSourcesTestConnection}
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? t.genericSaving : t.genericSave}
          </button>
        </div>
      </details>

      <details className="card">
        <summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HealthDot sourceId="dexcom" health={health} />
            <h2>{t.dataSourcesDexcomTitle}</h2>
            <span className="category-tag">{categoryLabels[dexcomCategory] ?? dexcomCategory}</span>
          </div>
          <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={dexcomEnabled} onChange={toggleDexcomEnabled} />
            {dexcomEnabled ? t.dataSourcesActive : t.dataSourcesInactive}
          </label>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesDexcomHint}</p>
        <div className="field">
          <label>{t.dataSourcesDexcomUsername}</label>
          <input type="text" value={dexcomUsername} onChange={(e) => { setDexcomUsername(e.target.value); setDexcomTestResult(null); }} />
        </div>
        <div className="field">
          <label>{t.dataSourcesDexcomPassword}</label>
          <input type="password" value={dexcomPassword} onChange={(e) => { setDexcomPassword(e.target.value); setDexcomTestResult(null); }} />
        </div>
        <div className="field">
          <label>{t.dataSourcesDexcomRegion}</label>
          <select value={dexcomRegion} onChange={(e) => { setDexcomRegion(e.target.value as Settings["dexcomRegion"]); setDexcomTestResult(null); }}>
            <option value="US">{t.dataSourcesDexcomRegionUs}</option>
            <option value="OUS">{t.dataSourcesDexcomRegionOus}</option>
          </select>
        </div>
        <div className="field">
          <label>{t.dataSourcesCategoryLabel}</label>
          <select value={dexcomCategory} onChange={(e) => setDexcomCategory(e.target.value)}>
            {Object.entries(categoryLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        {dexcomTestResult && <div className={`test-result ${dexcomTestResult.ok ? "ok" : "error"}`}>{dexcomTestResult.message}</div>}

        <div className="btn-row">
          <button className="btn" onClick={testDexcom} disabled={dexcomTesting || !dexcomUsername.trim() || !dexcomPassword.trim()}>
            {dexcomTesting ? t.genericTesting : t.dataSourcesTestConnection}
          </button>
          <button className="btn primary" onClick={saveDexcom} disabled={dexcomSaving}>
            {dexcomSaving ? t.genericSaving : t.genericSave}
          </button>
        </div>
      </details>

      <details className="card">
        <summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HealthDot sourceId="librelinkup" health={health} />
            <h2>{t.dataSourcesLibreTitle}</h2>
            <span className="category-tag">{categoryLabels[libreCategory] ?? libreCategory}</span>
          </div>
          <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={libreEnabled} onChange={toggleLibreEnabled} />
            {libreEnabled ? t.dataSourcesActive : t.dataSourcesInactive}
          </label>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesLibreHint}</p>
        <div className="field">
          <label>{t.dataSourcesLibreEmail}</label>
          <input type="email" value={libreEmail} onChange={(e) => { setLibreEmail(e.target.value); setLibreTestResult(null); }} />
        </div>
        <div className="field">
          <label>{t.dataSourcesLibrePassword}</label>
          <input type="password" value={librePassword} onChange={(e) => { setLibrePassword(e.target.value); setLibreTestResult(null); }} />
        </div>
        <div className="field">
          <label>{t.dataSourcesCategoryLabel}</label>
          <select value={libreCategory} onChange={(e) => setLibreCategory(e.target.value)}>
            {Object.entries(categoryLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        {libreTestResult && <div className={`test-result ${libreTestResult.ok ? "ok" : "error"}`}>{libreTestResult.message}</div>}

        <div className="btn-row">
          <button className="btn" onClick={testLibre} disabled={libreTesting || !libreEmail.trim() || !librePassword.trim()}>
            {libreTesting ? t.genericTesting : t.dataSourcesTestConnection}
          </button>
          <button className="btn primary" onClick={saveLibre} disabled={libreSaving}>
            {libreSaving ? t.genericSaving : t.genericSave}
          </button>
        </div>
      </details>

      <details className="card">
        <summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HealthDot sourceId="feelfit" health={health} />
            <h2>{t.dataSourcesFeelfitTitle}</h2>
            <span className="category-tag">{categoryLabels[feelfitCategory] ?? feelfitCategory}</span>
          </div>
          <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={feelfitEnabled} onChange={toggleFeelfitEnabled} />
            {feelfitEnabled ? t.dataSourcesActive : t.dataSourcesInactive}
          </label>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesFeelfitHint}</p>
        <div className="field">
          <label>{t.dataSourcesFeelfitEmail}</label>
          <input
            type="email"
            value={feelfitEmail}
            onChange={(e) => { setFeelfitEmail(e.target.value); setFeelfitTestResult(null); }}
            placeholder="name@example.com"
          />
        </div>
        <div className="field">
          <label>{t.dataSourcesFeelfitPassword}</label>
          <input
            type="password"
            value={feelfitPassword}
            onChange={(e) => { setFeelfitPassword(e.target.value); setFeelfitTestResult(null); }}
          />
        </div>
        <div className="field">
          <label>{t.dataSourcesCategoryLabel}</label>
          <select value={feelfitCategory} onChange={(e) => setFeelfitCategory(e.target.value)}>
            {Object.entries(categoryLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        {feelfitTestResult && (
          <div className={`test-result ${feelfitTestResult.ok ? "ok" : "error"}`}>{feelfitTestResult.message}</div>
        )}

        <div className="btn-row">
          <button className="btn" onClick={testFeelfit} disabled={feelfitTesting || !feelfitEmail.trim() || !feelfitPassword.trim()}>
            {feelfitTesting ? t.genericTesting : t.dataSourcesTestConnection}
          </button>
          <button className="btn primary" onClick={saveFeelfit} disabled={feelfitSaving}>
            {feelfitSaving ? t.genericSaving : t.genericSave}
          </button>
        </div>
      </details>

      <details className="card">
        <summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HealthDot sourceId="google_health" health={health} />
            <h2>{t.dataSourcesGoogleHealthTitle}</h2>
            <span className="category-tag">{categoryLabels[googleHealthCategory] ?? googleHealthCategory}</span>
          </div>
          <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={googleHealthEnabled} onChange={toggleGoogleHealthEnabled} />
            {googleHealthEnabled ? t.dataSourcesActive : t.dataSourcesInactive}
          </label>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesGoogleHealthHint}</p>
        <div className="field">
          <label>{t.mcpEditorOAuthRedirectUriLabel}</label>
          <input type="text" value={googleHealthRedirectUri} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.mcpEditorOAuthRedirectUriHint}</p>
          <button type="button" className="btn" onClick={copyRedirectUri}>
            {redirectUriCopied ? t.genericCopied : t.genericCopy}
          </button>
        </div>
        <div className="field">
          <label>{t.dataSourcesGoogleHealthClientId}</label>
          <input type="text" value={googleHealthClientId} onChange={(e) => setGoogleHealthClientId(e.target.value)} />
        </div>
        <div className="field">
          <label>{t.dataSourcesGoogleHealthClientSecret}</label>
          <input type="password" value={googleHealthClientSecret} onChange={(e) => setGoogleHealthClientSecret(e.target.value)} />
        </div>
        <div className="field">
          <label>{t.dataSourcesCategoryLabel}</label>
          <select value={googleHealthCategory} onChange={(e) => setGoogleHealthCategory(e.target.value)}>
            {Object.entries(categoryLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: "0.85rem", margin: "8px 0" }}>
          {googleHealthLoggedIn ? `✅ ${t.dataSourcesGoogleHealthLoggedIn}` : `⚪ ${t.dataSourcesGoogleHealthNotLoggedIn}`}
        </div>

        {googleHealthTestResult && (
          <div className={`test-result ${googleHealthTestResult.ok ? "ok" : "error"}`}>{googleHealthTestResult.message}</div>
        )}

        <div className="btn-row">
          <button
            className="btn"
            onClick={loginWithGoogleHealth}
            disabled={googleHealthLoggingIn || !googleHealthClientId.trim() || !googleHealthClientSecret.trim()}
          >
            {googleHealthLoggingIn ? t.genericSaving : googleHealthLoggedIn ? t.dataSourcesGoogleHealthLoginAgain : t.dataSourcesGoogleHealthLogin}
          </button>
          <button className="btn" onClick={testGoogleHealth} disabled={googleHealthTesting || !googleHealthLoggedIn}>
            {googleHealthTesting ? t.genericTesting : t.dataSourcesTestConnection}
          </button>
          <button className="btn primary" onClick={saveGoogleHealth} disabled={googleHealthSaving}>
            {googleHealthSaving ? t.genericSaving : t.genericSave}
          </button>
        </div>
      </details>

      <details className="card" style={{ borderLeft: "3px solid var(--rest-api-color)" }}>
        <summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HealthDot sourceId="withings" health={health} />
            <h2>{t.dataSourcesWithingsTitle}</h2>
            <span className="category-tag">{categoryLabels[withingsCategory] ?? withingsCategory}</span>
            <span
              className="category-tag"
              style={{ color: "var(--rest-api-color)", borderColor: "var(--rest-api-color)" }}
              title={t.dsRestApiHint}
            >
              ⚡ {t.dsRestApiBadge}
            </span>
          </div>
          <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={withingsEnabled} onChange={toggleWithingsEnabled} />
            {withingsEnabled ? t.dataSourcesActive : t.dataSourcesInactive}
          </label>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesWithingsHint}</p>
        <div className="field">
          <label>{t.mcpEditorOAuthRedirectUriLabel}</label>
          <input type="text" value={withingsRedirectUri} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.mcpEditorOAuthRedirectUriHint}</p>
          <button type="button" className="btn" onClick={copyWithingsRedirectUri}>
            {withingsRedirectUriCopied ? t.genericCopied : t.genericCopy}
          </button>
        </div>
        <div className="field">
          <label>{t.dataSourcesWithingsClientId}</label>
          <input type="text" value={withingsClientId} onChange={(e) => setWithingsClientId(e.target.value)} />
        </div>
        <div className="field">
          <label>{t.dataSourcesWithingsClientSecret}</label>
          <input type="password" value={withingsClientSecret} onChange={(e) => setWithingsClientSecret(e.target.value)} />
        </div>
        <div className="field">
          <label>{t.dataSourcesCategoryLabel}</label>
          <select value={withingsCategory} onChange={(e) => setWithingsCategory(e.target.value)}>
            {Object.entries(categoryLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: "0.85rem", margin: "8px 0" }}>
          {withingsLoggedIn ? `✅ ${t.dataSourcesWithingsLoggedIn}` : `⚪ ${t.dataSourcesWithingsNotLoggedIn}`}
        </div>

        {withingsTestResult && (
          <div className={`test-result ${withingsTestResult.ok ? "ok" : "error"}`}>{withingsTestResult.message}</div>
        )}

        <div className="btn-row">
          <button
            className="btn"
            onClick={loginWithWithings}
            disabled={withingsLoggingIn || !withingsClientId.trim() || !withingsClientSecret.trim()}
          >
            {withingsLoggingIn ? t.genericSaving : withingsLoggedIn ? t.dataSourcesWithingsLoginAgain : t.dataSourcesWithingsLogin}
          </button>
          <button className="btn" onClick={testWithings} disabled={withingsTesting || !withingsLoggedIn}>
            {withingsTesting ? t.genericTesting : t.dataSourcesTestConnection}
          </button>
          <button className="btn primary" onClick={saveWithings} disabled={withingsSaving}>
            {withingsSaving ? t.genericSaving : t.genericSave}
          </button>
        </div>
      </details>

      <details className="card">
        <summary>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <HealthDot sourceId="glooko" health={health} />
            <h2>{t.dataSourcesGlookoTitle}</h2>
            <span className="category-tag">{categoryLabels[glookoCategory] ?? glookoCategory}</span>
          </div>
          <label className="inline-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={glookoEnabled} onChange={toggleGlookoEnabled} />
            {glookoEnabled ? t.dataSourcesActive : t.dataSourcesInactive}
          </label>
        </summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesGlookoHint}</p>
        <div className="field">
          <label>{t.dataSourcesGlookoUsername}</label>
          <input type="text" value={glookoUsername} onChange={(e) => { setGlookoUsername(e.target.value); setGlookoTestResult(null); }} />
        </div>
        <div className="field">
          <label>{t.dataSourcesGlookoPassword}</label>
          <input type="password" value={glookoPassword} onChange={(e) => { setGlookoPassword(e.target.value); setGlookoTestResult(null); }} />
        </div>
        <div className="field">
          <label>{t.dataSourcesCategoryLabel}</label>
          <select value={glookoCategory} onChange={(e) => setGlookoCategory(e.target.value)}>
            {Object.entries(categoryLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        {glookoTestResult && <div className={`test-result ${glookoTestResult.ok ? "ok" : "error"}`}>{glookoTestResult.message}</div>}

        <div className="btn-row">
          <button className="btn" onClick={testGlooko} disabled={glookoTesting || !glookoUsername.trim() || !glookoPassword.trim()}>
            {glookoTesting ? t.genericTesting : t.dataSourcesTestConnection}
          </button>
          <button className="btn primary" onClick={saveGlooko} disabled={glookoSaving}>
            {glookoSaving ? t.genericSaving : t.genericSave}
          </button>
        </div>
      </details>

      <details className="card">
        <summary><h2>{t.dataSourcesMcpTitle(servers.length)}</h2></summary>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.dataSourcesMcpHint}</p>
        {!addingServer && (
          <button className="btn" onClick={() => setAddingServer(true)}>
            {t.dataSourcesAddServer}
          </button>
        )}

        {addingServer && (
          <McpServerEditor
            onSaved={() => {
              setAddingServer(false);
              loadServers();
            }}
            onCancel={() => setAddingServer(false)}
          />
        )}

        {servers.map((s) => (
          <McpServerRow key={s.id} server={s} onChanged={loadServers} t={t} health={health} />
        ))}
      </details>
    </SettingsScaffold>
  );
}
