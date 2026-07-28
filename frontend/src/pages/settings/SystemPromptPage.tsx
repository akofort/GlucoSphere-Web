import { useEffect, useState } from "react";
import SettingsScaffold from "../../components/SettingsScaffold";
import { api } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";

export default function SystemPromptPage() {
  const { t } = useLanguage();
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDefaultSystemPrompt(), api.getSettings()]).then(([d, s]) => {
      setDefaultPrompt(d.defaultPrompt);
      setUseCustom(s.systemPrompt !== null);
      setCustomPrompt(s.systemPrompt ?? d.defaultPrompt);
      setAdditionalInstructions(s.additionalInstructions);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings({
        systemPrompt: useCustom ? customPrompt : null,
        additionalInstructions,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsScaffold title={t.spTitle}>{t.loading}</SettingsScaffold>;

  return (
    <SettingsScaffold title={t.spTitle}>
      <div className="card">
        <h2>{t.spBaseSection}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.spBaseHint}</p>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className={`btn ${!useCustom ? "primary" : ""}`} onClick={() => setUseCustom(false)}>
            {t.spUseDefault}
          </button>
          <button className={`btn ${useCustom ? "primary" : ""}`} onClick={() => setUseCustom(true)}>
            {t.spUseCustom}
          </button>
        </div>

        {!useCustom && (
          <div className="field">
            <label>{t.spDefaultLabel}</label>
            <textarea value={defaultPrompt} readOnly style={{ minHeight: 300, fontFamily: "monospace", fontSize: "0.8rem" }} />
          </div>
        )}

        {useCustom && (
          <div className="field">
            <label>{t.spTitle}</label>
            <textarea
              value={customPrompt ?? ""}
              onChange={(e) => setCustomPrompt(e.target.value)}
              style={{ minHeight: 300, fontFamily: "monospace", fontSize: "0.8rem" }}
            />
            <div className="btn-row">
              <button className="btn" onClick={() => setCustomPrompt(defaultPrompt)}>
                {t.spResetToDefault}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>{t.spAdditionalSection}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.spAdditionalHint}</p>
        <div className="field">
          <textarea
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            placeholder={t.spAdditionalPlaceholder}
          />
        </div>
      </div>

      {saved && <div className="test-result ok">✅</div>}
      <button className="btn primary" onClick={save} disabled={saving}>
        {saving ? t.genericSaving : t.genericSave}
      </button>
    </SettingsScaffold>
  );
}
