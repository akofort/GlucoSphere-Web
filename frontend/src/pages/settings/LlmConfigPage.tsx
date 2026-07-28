import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type ProviderInfo, type Settings } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";

const KEY_FIELD: Record<string, keyof Settings> = {
  GEMINI: "geminiApiKey",
  CLAUDE: "claudeApiKey",
  OPENAI: "openAiApiKey",
  DEEPSEEK: "deepseekApiKey",
  ONEPROVIDER_FREE: "oneProviderApiKey",
};
const MODEL_FIELD: Record<string, keyof Settings> = {
  GEMINI: "geminiModel",
  CLAUDE: "claudeModel",
  OPENAI: "openAiModel",
  DEEPSEEK: "deepseekModel",
  ONEPROVIDER_FREE: "oneProviderModel",
};
// Only these two providers support a custom endpoint (OpenAI-compatible APIs like OpenRouter or
// a local Ollama, and Anthropic-compatible proxies) -- GEMINI/DEEPSEEK/ONEPROVIDER_FREE always use
// their fixed backend default, see model_catalog.py.
const BASE_URL_FIELD: Partial<Record<string, keyof Settings>> = {
  CLAUDE: "claudeBaseUrl",
  OPENAI: "openAiBaseUrl",
};
const DEFAULT_BASE_URL: Record<string, string> = {
  CLAUDE: "https://api.anthropic.com/v1",
  OPENAI: "https://api.openai.com/v1",
};

export default function LlmConfigPage() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("auto");
  const [baseUrl, setBaseUrl] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listProviders().then((r) => setProviders(r.providers));
    api.getSettings().then((s) => {
      setSettings(s);
      setApiKey(String(s[KEY_FIELD[s.llmProviderType]] ?? ""));
      setModel(String(s[MODEL_FIELD[s.llmProviderType]] ?? "auto"));
      const urlField = BASE_URL_FIELD[s.llmProviderType];
      setBaseUrl(urlField ? String(s[urlField] ?? "") : "");
    });
  }, []);

  const selectProvider = (type: string) => {
    if (!settings) return;
    setSettings({ ...settings, llmProviderType: type as Settings["llmProviderType"] });
    setApiKey(String(settings[KEY_FIELD[type]] ?? ""));
    setModel(String(settings[MODEL_FIELD[type]] ?? "auto"));
    const urlField = BASE_URL_FIELD[type];
    setBaseUrl(urlField ? String(settings[urlField] ?? "") : "");
    setTestResult(null);
  };

  const test = async () => {
    if (!settings) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testLlmConnection({
        providerType: settings.llmProviderType,
        apiKey,
        model,
        baseUrl: baseUrl.trim() || undefined,
      });
      setTestResult({ ok: res.success, message: res.message });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        llmProviderType: settings.llmProviderType,
        [KEY_FIELD[settings.llmProviderType]]: apiKey,
        [MODEL_FIELD[settings.llmProviderType]]: model,
      };
      const urlField = BASE_URL_FIELD[settings.llmProviderType];
      if (urlField) patch[urlField] = baseUrl.trim();
      const updated = await api.updateSettings(patch as Partial<Settings>);
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <SettingsScaffold title={t.llmConfigTitle}>{t.loading}</SettingsScaffold>;

  const activeProvider = providers.find((p) => p.type === settings.llmProviderType);
  const baseUrlField = BASE_URL_FIELD[settings.llmProviderType];
  const canSave = apiKey.trim() === "" || (testResult?.ok ?? false) || settings.llmProviderType === "ONEPROVIDER_FREE";

  return (
    <SettingsScaffold title={t.llmConfigTitle}>
      <div className="card">
        <h2>{t.llmConfigProviderSection}</h2>
        {providers.map((p) => (
          <label key={p.type} className="radio-row" style={{ cursor: "pointer" }}>
            <input
              type="radio"
              checked={settings.llmProviderType === p.type}
              onChange={() => selectProvider(p.type)}
            />
            <div>
              <div className="label">{p.label}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="card">
        <div className="field">
          <label>{settings.llmProviderType === "ONEPROVIDER_FREE" ? t.llmConfigApiKeyOptional : t.llmConfigApiKeyLabel}</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestResult(null);
            }}
            placeholder={t.llmConfigApiKeyPlaceholder}
          />
        </div>
        {baseUrlField && (
          <div className="field">
            <label>{t.llmConfigBaseUrlLabel}</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setTestResult(null);
              }}
              placeholder={DEFAULT_BASE_URL[settings.llmProviderType]}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.llmConfigBaseUrlHint}</p>
            {baseUrl.trim() !== "" && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setBaseUrl("");
                  setTestResult(null);
                }}
              >
                {t.llmConfigBaseUrlReset}
              </button>
            )}
          </div>
        )}
        <div className="field">
          <label>{t.llmConfigModelLabel}</label>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setTestResult(null);
            }}
          >
            <option value="auto">{t.llmConfigModelAuto}</option>
            {activeProvider?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} {m.priceTier}
              </option>
            ))}
          </select>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.ok ? "ok" : "error"}`}>{testResult.message}</div>
        )}

        <div className="btn-row">
          <button className="btn" onClick={test} disabled={testing || (apiKey.trim() === "" && settings.llmProviderType !== "ONEPROVIDER_FREE")}>
            {testing ? t.genericTesting : t.genericTest}
          </button>
          <button className="btn primary" onClick={save} disabled={saving || !canSave}>
            {saving ? t.genericSaving : t.genericSave}
          </button>
        </div>
        {!canSave && <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.llmConfigNotTested}</p>}
      </div>
    </SettingsScaffold>
  );
}
