import { useEffect, useMemo, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api, type ModelOption, type ProviderInfo, type Settings } from "../../lib/api";
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

// Below this many entries the list is short enough to just scan (the built-in catalog tops out at
// 3-4 per provider) -- the search box only earns its keep once a live refresh (esp. OpenRouter,
// hundreds of models) makes the plain <select> hard to scan.
const MODEL_SEARCH_THRESHOLD = 8;

function formatModelLabel(m: ModelOption, priceHint: (input: string, output: string) => string): string {
  if (m.outputPrice != null && m.outputPrice > 0) {
    const input = (m.inputPrice ?? 0).toFixed(2);
    const output = m.outputPrice.toFixed(2);
    return `${m.label} -- ${priceHint(input, output)}`;
  }
  return m.priceTier ? `${m.label} ${m.priceTier}` : m.label;
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
  const [modelSearch, setModelSearch] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; model?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
    setModelSearch("");
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

  /** Fetches this provider's live model list (see POST /api/providers/{type}/refresh). A stored
   * model that survives in the refreshed list stays selected; one that doesn't becomes a manual
   * entry rather than being silently swapped for something else. */
  const refreshModels = async (reset = false) => {
    if (!settings) return;
    const type = settings.llmProviderType;
    setRefreshing(true);
    setRefreshError(null);
    try {
      if (reset) {
        await api.resetProviderModels(type);
      } else {
        // Use what's currently in the form, not only what's stored -- so a freshly pasted key
        // works without saving first, same as "Testen".
        await api.refreshProviderModels(type, { apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined });
      }
      const { providers: updated } = await api.listProviders();
      setProviders(updated);
      setCustomMode(isCustomModelFor(updated, type, model));
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
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

  const activeProviderModels = useMemo(
    () => providers.find((p) => p.type === settings?.llmProviderType)?.models ?? [],
    [providers, settings]
  );
  const filteredModels = useMemo(() => {
    if (activeProviderModels.length <= MODEL_SEARCH_THRESHOLD || !modelSearch.trim()) return activeProviderModels;
    const q = modelSearch.trim().toLowerCase();
    // Never filter the currently selected model out of view -- otherwise typing a search term
    // makes the <select> silently lose its visible selection.
    return activeProviderModels.filter(
      (m) => m.id === model || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
    );
  }, [activeProviderModels, modelSearch, model]);

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
          {activeProviderModels.length > MODEL_SEARCH_THRESHOLD && (
            <input
              type="text"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder={t.llmConfigModelSearchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              style={{ marginBottom: 6 }}
            />
          )}
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
            size={activeProviderModels.length > MODEL_SEARCH_THRESHOLD ? 8 : undefined}
          >
            <option value="auto">{t.llmConfigModelAuto}</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>
                {formatModelLabel(m, t.llmConfigModelPriceHint)}
              </option>
            ))}
            <option value={CUSTOM_MODEL_OPTION}>{t.llmConfigModelCustom}</option>
          </select>
          {activeProviderModels.length > MODEL_SEARCH_THRESHOLD && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
              {t.llmConfigModelSearchCount(filteredModels.length, activeProviderModels.length)}
            </p>
          )}
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>
            {activeProvider?.source === "live" && activeProvider.fetchedAt
              ? t.llmConfigModelsLive(new Date(activeProvider.fetchedAt).toLocaleString())
              : t.llmConfigModelsBuiltin}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => refreshModels(false)}
              disabled={refreshing || apiKey.trim() === ""}
            >
              {refreshing ? t.llmConfigRefreshing : t.llmConfigRefreshModels}
            </button>
            {activeProvider?.source === "live" && (
              <button type="button" className="btn" onClick={() => refreshModels(true)} disabled={refreshing}>
                {t.llmConfigResetModels}
              </button>
            )}
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.llmConfigRefreshHint}</p>
          {refreshError && <div className="test-result error">{t.llmConfigRefreshFailed(refreshError)}</div>}
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
