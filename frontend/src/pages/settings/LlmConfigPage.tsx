import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type ProviderInfo, type Settings } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";

const KEY_FIELD: Record<string, keyof Settings> = {
  GEMINI: "geminiApiKey",
  CLAUDE: "claudeApiKey",
  OPENAI: "openAiApiKey",
  DEEPSEEK: "deepseekApiKey",
};
const MODEL_FIELD: Record<string, keyof Settings> = {
  GEMINI: "geminiModel",
  CLAUDE: "claudeModel",
  OPENAI: "openAiModel",
  DEEPSEEK: "deepseekModel",
};
// Only these two providers support a custom endpoint (OpenAI-compatible APIs like OpenRouter or
// a local Ollama, and Anthropic-compatible proxies) -- GEMINI/DEEPSEEK always use their fixed
// backend default, see model_catalog.py.
const BASE_URL_FIELD: Partial<Record<string, keyof Settings>> = {
  CLAUDE: "claudeBaseUrl",
  OPENAI: "openAiBaseUrl",
};
const DEFAULT_BASE_URL: Record<string, string> = {
  CLAUDE: "https://api.anthropic.com/v1",
  OPENAI: "https://api.openai.com/v1",
};

// Sentinel <option> value for "Manuelle Eingabe" -- never stored, it only switches the picker into
// free-text mode. The stored setting is always either "auto" or a literal model id, so the backend
// (model_catalog.resolve) needs no notion of "custom" at all.
const CUSTOM_MODEL_OPTION = "__custom__";

/** Whether a stored model id needs the free-text field rather than a catalog <option> -- i.e. it's
 * a real model id that this provider's built-in catalog doesn't list (a newer model, or an
 * arbitrary one served via OpenRouter/Ollama). Empty/"auto" both mean "Automatisch", never custom. */
function isCustomModelFor(providers: ProviderInfo[], providerType: string, modelId: string): boolean {
  if (!modelId || modelId === "auto") return false;
  const models = providers.find((p) => p.type === providerType)?.models ?? [];
  return !models.some((m) => m.id === modelId);
}

export default function LlmConfigPage() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("auto");
  // Explicit rather than derived from `model`: while typing a custom id that happens to pass
  // through a catalog id, a derived flag would snap the field shut mid-keystroke.
  const [customMode, setCustomMode] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; model?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Both together: deciding whether the stored model is a custom one needs the catalog, so
    // loading them independently would briefly mis-render the picker on first paint.
    Promise.all([api.listProviders(), api.getSettings()]).then(([providerResp, s]) => {
      setProviders(providerResp.providers);
      setSettings(s);
      setApiKey(String(s[KEY_FIELD[s.llmProviderType]] ?? ""));
      const storedModel = String(s[MODEL_FIELD[s.llmProviderType]] ?? "") || "auto";
      setModel(storedModel);
      setCustomMode(isCustomModelFor(providerResp.providers, s.llmProviderType, storedModel));
      const urlField = BASE_URL_FIELD[s.llmProviderType];
      setBaseUrl(urlField ? String(s[urlField] ?? "") : "");
    });
  }, []);

  const selectProvider = (type: string) => {
    if (!settings) return;
    setSettings({ ...settings, llmProviderType: type as Settings["llmProviderType"] });
    setApiKey(String(settings[KEY_FIELD[type]] ?? ""));
    const storedModel = String(settings[MODEL_FIELD[type]] ?? "") || "auto";
    setModel(storedModel);
    setCustomMode(isCustomModelFor(providers, type, storedModel));
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
        model: model.trim(),
        baseUrl: baseUrl.trim() || undefined,
      });
      setTestResult({ ok: res.success, message: res.message, model: res.model });
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
        [MODEL_FIELD[settings.llmProviderType]]: model.trim(),
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
  // "Manuelle Eingabe" selected but nothing typed yet -- there is no model to verify or store.
  const modelMissing = model.trim() === "";
  const canSave = !modelMissing && (apiKey.trim() === "" || (testResult?.ok ?? false));

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
          <label>{t.llmConfigApiKeyLabel}</label>
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
            value={customMode ? CUSTOM_MODEL_OPTION : model}
            onChange={(e) => {
              const value = e.target.value;
              setTestResult(null);
              if (value === CUSTOM_MODEL_OPTION) {
                setCustomMode(true);
                setModel("");
              } else {
                setCustomMode(false);
                setModel(value);
              }
            }}
          >
            <option value="auto">{t.llmConfigModelAuto}</option>
            {activeProvider?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} {m.priceTier}
              </option>
            ))}
            <option value={CUSTOM_MODEL_OPTION}>{t.llmConfigModelCustom}</option>
          </select>
        </div>

        {customMode && (
          <div className="field">
            <label>{t.llmConfigModelCustomLabel}</label>
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setTestResult(null);
              }}
              placeholder={t.llmConfigModelCustomPlaceholder}
              autoComplete="off"
              spellCheck={false}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.llmConfigModelCustomHint}</p>
          </div>
        )}

        {testResult && (
          <div className={`test-result ${testResult.ok ? "ok" : "error"}`}>
            {testResult.message}
            {testResult.ok && testResult.model && (
              <div style={{ fontSize: "0.8rem", marginTop: 4, opacity: 0.85 }}>
                {t.llmConfigModelVerified(testResult.model)}
              </div>
            )}
          </div>
        )}

        <div className="btn-row">
          <button className="btn" onClick={test} disabled={testing || apiKey.trim() === "" || modelMissing}>
            {testing ? t.genericTesting : t.genericTest}
          </button>
          <button className="btn primary" onClick={save} disabled={saving || !canSave}>
            {saving ? t.genericSaving : t.genericSave}
          </button>
        </div>
        {modelMissing ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.llmConfigModelRequired}</p>
        ) : (
          !canSave && <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.llmConfigNotTested}</p>
        )}
      </div>
    </SettingsScaffold>
  );
}
