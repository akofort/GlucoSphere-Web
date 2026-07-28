import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ProviderInfo, type Settings } from "../../lib/api";
import { useLanguage } from "../../lib/LanguageContext";
import { useAuth } from "../../lib/AuthContext";

const PROVIDER_KEY_FIELD: Record<string, keyof Settings> = {
  GEMINI: "geminiApiKey",
  CLAUDE: "claudeApiKey",
  OPENAI: "openAiApiKey",
  DEEPSEEK: "deepseekApiKey",
  ONEPROVIDER_FREE: "oneProviderApiKey",
};

export default function SettingsOverviewPage() {
  const { t, language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getSettings().then(setSettings);
    api.listProviders().then((r) => setProviders(r.providers));
  }, [isAdmin]);

  const roleLabels: Record<string, string> = {
    DIABETIKER: t.roleDiabetiker,
    FACHPERSONAL: t.roleFachpersonal,
    ANGEHOERIGE: t.roleAngehoerige,
  };

  const llmSubtitle = (() => {
    if (!settings) return "";
    const providerLabel = providers.find((p) => p.type === settings.llmProviderType)?.label ?? settings.llmProviderType;
    if (settings.llmProviderType === "ONEPROVIDER_FREE") return providerLabel;
    const key = settings[PROVIDER_KEY_FIELD[settings.llmProviderType]];
    return key ? t.settingsProviderActive(providerLabel) : t.settingsNoApiKey;
  })();

  const dataSourcesSubtitle = settings?.nightscoutApiUrl
    ? settings.nightscoutApiEnabled
      ? t.settingsNightscoutConfigured
      : t.settingsNightscoutDisabled
    : t.settingsNoDataSource;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link to="/" className="back-link">
            ←
          </Link>
          <h1>{t.settingsTitle}</h1>
        </div>
      </div>
      <div className="content">
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4 }}>
            {t.settingsLanguage}
          </label>
          <div className="range-chips">
            <button className={`chip ${language === "DE" ? "selected" : ""}`} onClick={() => setLanguage("DE")}>
              Deutsch
            </button>
            <button className={`chip ${language === "EN" ? "selected" : ""}`} onClick={() => setLanguage("EN")}>
              English
            </button>
          </div>
        </div>

        <div className="settings-menu">
          <Link to="/settings/profile">
            <div>
              <div className="title">{t.settingsProfile}</div>
              <div className="subtitle">{user ? roleLabels[user.userRole] : ""}</div>
            </div>
            <div className="arrow">›</div>
          </Link>
          {isAdmin && (
            <>
              <Link to="/settings/llm">
                <div>
                  <div className="title">{t.settingsLlmConfig}</div>
                  <div className="subtitle">{llmSubtitle}</div>
                </div>
                <div className="arrow">›</div>
              </Link>
              <Link to="/settings/data-sources">
                <div>
                  <div className="title">{t.settingsDataSources}</div>
                  <div className="subtitle">{dataSourcesSubtitle}</div>
                </div>
                <div className="arrow">›</div>
              </Link>
              <Link to="/settings/tips">
                <div>
                  <div className="title">{t.settingsTips}</div>
                  <div className="subtitle">{t.settingsTipsSubtitle}</div>
                </div>
                <div className="arrow">›</div>
              </Link>
              <Link to="/settings/system-prompt">
                <div>
                  <div className="title">{t.settingsSystemPrompt}</div>
                  <div className="subtitle">{t.settingsSystemPromptSubtitle}</div>
                </div>
                <div className="arrow">›</div>
              </Link>
              <Link to="/settings/backup">
                <div>
                  <div className="title">{t.settingsBackup}</div>
                  <div className="subtitle">{t.settingsBackupSubtitle}</div>
                </div>
                <div className="arrow">›</div>
              </Link>
              <Link to="/settings/performance-log">
                <div>
                  <div className="title">{t.settingsPerformanceLog}</div>
                  <div className="subtitle">{t.settingsPerformanceLogSubtitle}</div>
                </div>
                <div className="arrow">›</div>
              </Link>
              <Link to="/settings/users">
                <div>
                  <div className="title">{t.settingsUsers}</div>
                  <div className="subtitle">{t.settingsUsersSubtitle}</div>
                </div>
                <div className="arrow">›</div>
              </Link>
            </>
          )}
          <Link to="/settings/account">
            <div>
              <div className="title">{t.settingsAccount}</div>
              <div className="subtitle">{t.settingsAccountSubtitle}</div>
            </div>
            <div className="arrow">›</div>
          </Link>
          <Link to="/settings/about">
            <div>
              <div className="title">{t.settingsAbout}</div>
              <div className="subtitle">{t.settingsAboutSubtitle}</div>
            </div>
            <div className="arrow">›</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
