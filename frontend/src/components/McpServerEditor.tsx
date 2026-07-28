import { useState } from "react";
import { api, type McpServer } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";

export default function McpServerEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: McpServer;
  onSaved: (server: McpServer) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [transport, setTransport] = useState<string>(initial?.transport ?? "STREAMABLE_HTTP");
  const [authMethod, setAuthMethod] = useState<string>(initial?.authMethod ?? "NONE");
  const [token, setToken] = useState(initial?.token ?? "");
  const [category, setCategory] = useState(initial?.category ?? "OTHER");
  const [isRealtime, setIsRealtime] = useState(initial?.isRealtime ?? false);
  const [oauthClientId, setOauthClientId] = useState(initial?.oauthClientId ?? "");
  const [oauthClientSecret, setOauthClientSecret] = useState(initial?.oauthClientSecret ?? "");
  const [oauthAuthEndpoint, setOauthAuthEndpoint] = useState(initial?.oauthAuthEndpoint ?? "");
  const [oauthTokenEndpoint, setOauthTokenEndpoint] = useState(initial?.oauthTokenEndpoint ?? "");
  const [oauthScope, setOauthScope] = useState(initial?.oauthScope ?? "");
  const [oauthTokenAction, setOauthTokenAction] = useState(initial?.oauthTokenAction ?? "");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedServer, setSavedServer] = useState<McpServer | undefined>(initial);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthLoggingIn, setOauthLoggingIn] = useState(false);
  const [redirectUriCopied, setRedirectUriCopied] = useState(false);
  const redirectUri = `${window.location.origin}/api/mcp-servers/oauth/callback`;

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setRedirectUriCopied(true);
      setTimeout(() => setRedirectUriCopied(false), 2000);
    } catch {
      // clipboard API unavailable (e.g. insecure context) -- the field is still selectable/copyable manually
    }
  };

  const categoryLabels: Record<string, string> = {
    GLUCOSE_TREATMENTS: t.categoryGlucose,
    ACTIVITY: t.categoryActivity,
    BODY_METRICS: t.categoryBodyMetrics,
    OTHER: t.categoryOther,
  };
  const transportLabels: Record<string, string> = {
    STREAMABLE_HTTP: t.transportStreamable,
    SSE: t.transportSse,
    OPENAPI: t.transportOpenapi,
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testMcpServer({ url, transport, authMethod, token, serverId: savedServer?.id });
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
      const saved = await api.saveMcpServer({
        id: savedServer?.id,
        name,
        url,
        transport: transport as McpServer["transport"],
        authMethod: authMethod as McpServer["authMethod"],
        token,
        category,
        enabled: savedServer?.enabled ?? false,
        autoRunTools: savedServer?.autoRunTools ?? false,
        isRealtime,
        oauthClientId,
        oauthClientSecret,
        oauthAuthEndpoint,
        oauthTokenEndpoint,
        oauthScope,
        oauthTokenAction,
      });
      setSavedServer(saved);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  const loginWithProvider = async () => {
    setOauthError(null);
    if (!oauthClientId.trim() || !oauthAuthEndpoint.trim() || !oauthTokenEndpoint.trim()) {
      setOauthError(t.mcpEditorOAuthMissingFields);
      return;
    }
    if (!name.trim() || !url.trim()) {
      setOauthError(t.mcpEditorOAuthMissingFields);
      return;
    }
    setOauthLoggingIn(true);
    try {
      // Persist the current form (including any just-typed OAuth fields) before starting the
      // flow -- otherwise clicking "Login" without a prior "Speichern" silently authorizes
      // against whatever was saved before, which can be blank and fail with no visible feedback.
      const saved = await api.saveMcpServer({
        id: savedServer?.id,
        name, url, transport: transport as McpServer["transport"], authMethod: authMethod as McpServer["authMethod"],
        token, category, enabled: savedServer?.enabled ?? false, autoRunTools: savedServer?.autoRunTools ?? false,
        oauthClientId, oauthClientSecret, oauthAuthEndpoint, oauthTokenEndpoint, oauthScope, oauthTokenAction,
      });
      setSavedServer(saved);
      onSaved(saved);
      const { authorizeUrl } = await api.mcpOAuthAuthorize(saved.id, redirectUri);
      window.location.href = authorizeUrl;
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : String(err));
      setOauthLoggingIn(false);
    }
  };

  return (
    <div className="card">
      <h2>{initial ? t.mcpEditorEditTitle : t.mcpEditorAddTitle}</h2>
      <div className="field">
        <label>{t.mcpEditorName}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.mcpEditorNamePlaceholder} />
      </div>
      <div className="field">
        <label>{t.mcpEditorUrl}</label>
        <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setTestResult(null); }} placeholder="http://host:port/mcp" />
      </div>
      <div className="field">
        <label>{t.mcpEditorTransport}</label>
        <select value={transport} onChange={(e) => { setTransport(e.target.value); setTestResult(null); }}>
          {Object.entries(transportLabels).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t.mcpEditorCategory}</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(categoryLabels).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>
      {category === "GLUCOSE_TREATMENTS" && (
        <label className="radio-row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={isRealtime} onChange={(e) => setIsRealtime(e.target.checked)} />
          <div className="label">{t.mcpEditorIsRealtime}</div>
        </label>
      )}
      <div className="field">
        <label>{t.mcpEditorAuthType}</label>
        <select value={authMethod} onChange={(e) => { setAuthMethod(e.target.value); setTestResult(null); }}>
          <option value="NONE">{t.dataSourcesAuthNone}</option>
          <option value="BEARER_TOKEN">{t.dataSourcesAuthBearer}</option>
          <option value="API_SECRET_HEADER">{t.dataSourcesAuthApiSecret}</option>
          <option value="OAUTH2">{t.authOAuth2}</option>
        </select>
      </div>
      {authMethod !== "NONE" && authMethod !== "OAUTH2" && (
        <div className="field">
          <label>{t.mcpEditorToken}</label>
          <input type="password" value={token} onChange={(e) => { setToken(e.target.value); setTestResult(null); }} />
        </div>
      )}

      {authMethod === "OAUTH2" && (
        <>
          <div className="field">
            <label>{t.mcpEditorOAuthRedirectUriLabel}</label>
            <input type="text" value={redirectUri} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.mcpEditorOAuthRedirectUriHint}</p>
            <button type="button" className="btn" onClick={copyRedirectUri}>
              {redirectUriCopied ? t.genericCopied : t.genericCopy}
            </button>
          </div>
          <div className="field">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOauthAuthEndpoint("https://account.withings.com/oauth2_user/authorize2");
                setOauthTokenEndpoint("https://wbsapi.withings.net/v2/oauth2");
                setOauthScope("user.info,user.metrics,user.activity");
                setOauthTokenAction("requesttoken");
              }}
            >
              {t.mcpEditorWithingsPreset}
            </button>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.mcpEditorWithingsPresetHint}</p>
          </div>
          <div className="field">
            <label>{t.mcpEditorOAuthClientId}</label>
            <input type="text" value={oauthClientId} onChange={(e) => setOauthClientId(e.target.value)} />
          </div>
          <div className="field">
            <label>{t.mcpEditorOAuthClientSecret}</label>
            <input type="password" value={oauthClientSecret} onChange={(e) => setOauthClientSecret(e.target.value)} />
          </div>
          <div className="field">
            <label>{t.mcpEditorOAuthAuthEndpoint}</label>
            <input type="url" value={oauthAuthEndpoint} onChange={(e) => setOauthAuthEndpoint(e.target.value)} placeholder="https://provider.example.com/oauth2/authorize" />
          </div>
          <div className="field">
            <label>{t.mcpEditorOAuthTokenEndpoint}</label>
            <input type="url" value={oauthTokenEndpoint} onChange={(e) => setOauthTokenEndpoint(e.target.value)} placeholder="https://provider.example.com/oauth2/token" />
          </div>
          <div className="field">
            <label>{t.mcpEditorOAuthScopeOptional}</label>
            <input type="text" value={oauthScope} onChange={(e) => setOauthScope(e.target.value)} />
          </div>
          <div className="field">
            <label>{t.mcpEditorOAuthTokenActionOptional}</label>
            <input type="text" value={oauthTokenAction} onChange={(e) => setOauthTokenAction(e.target.value)} placeholder="requesttoken" />
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.mcpEditorOAuthTokenActionHint}</p>
          </div>
          <div className="field">
            <div style={{ fontSize: "0.85rem", marginBottom: 8 }}>
              {savedServer?.oauthLoggedIn ? `✅ ${t.mcpEditorOAuthLoggedIn}` : `⚪ ${t.mcpEditorOAuthNotLoggedIn}`}
            </div>
            <button type="button" className="btn" onClick={loginWithProvider} disabled={oauthLoggingIn}>
              {oauthLoggingIn ? t.genericSaving : savedServer?.oauthLoggedIn ? t.mcpEditorOAuthLoginAgain : t.mcpEditorOAuthLogin}
            </button>
            {oauthError && <div className="test-result error" style={{ marginTop: 8 }}>{oauthError}</div>}
          </div>
        </>
      )}

      {testResult && <div className={`test-result ${testResult.ok ? "ok" : "error"}`}>{testResult.message}</div>}

      <div className="btn-row">
        <button className="btn" onClick={test} disabled={testing || !url.trim()}>
          {testing ? t.genericTesting : t.dataSourcesTestConnection}
        </button>
        <button className="btn primary" onClick={save} disabled={saving || !name.trim() || !url.trim()}>
          {saving ? t.genericSaving : t.genericSave}
        </button>
        <button className="btn" onClick={onCancel}>
          {t.genericCancel}
        </button>
      </div>
    </div>
  );
}
