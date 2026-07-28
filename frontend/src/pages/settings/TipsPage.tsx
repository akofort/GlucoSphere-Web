import { useNavigate } from "react-router-dom";
import SettingsScaffold from "../../components/SettingsScaffold";
import { useLanguage } from "../../lib/LanguageContext";

interface McpSuggestion {
  title: string;
  description: string;
  url: string | null;
  extraLinks?: { label: string; url: string }[];
}

export default function TipsPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const askInChat = () => navigate("/chat", { state: { autoSend: t.tipsAskQuestion } });

  const suggestions: McpSuggestion[] = [
    { title: "Nightscout MCP", description: t.tipsNightscoutDesc, url: "https://github.com/adminpb/Nightscout-MCP" },
    { title: "Glooko MCP", description: t.tipsGlookoDesc, url: "https://github.com/rilhia/omni-endo-ai-mcp" },
    {
      title: "Withings MCP",
      description: t.tipsWithingsDesc,
      url: "https://github.com/akutishevsky/withings-mcp",
      extraLinks: [
        { label: "Schimmilab/withings-mcp-server", url: "https://github.com/Schimmilab/withings-mcp-server" },
        { label: "davidmosiah/withings-mcp", url: "https://github.com/davidmosiah/withings-mcp" },
        { label: "Offizielles OAuth2-Beispiel (withings-sas)", url: "https://github.com/withings-sas/api-oauth2-python" },
        { label: "Eigene OAuth2-App registrieren", url: "https://account.withings.com/partner/add_oauth2" },
        { label: "Withings Developer Portal", url: "https://developer.withings.com/" },
      ],
    },
    { title: "FeelFit", description: t.tipsFeelfitDesc, url: null },
    {
      title: "Google Health",
      description: t.tipsGoogleHealthDesc,
      url: "https://github.com/tachibanayu24/fitbit-googlehealth-mcp",
      extraLinks: [{ label: "davidmosiah/google-health-mcp", url: "https://github.com/davidmosiah/google-health-mcp" }],
    },
    {
      title: "Strava MCP",
      description: t.tipsStravaDesc,
      url: "https://github.com/r-huijts/strava-mcp",
      extraLinks: [
        { label: "eddmann/strava-mcp", url: "https://github.com/eddmann/strava-mcp" },
        { label: "Strava API-Einstellungen", url: "https://www.strava.com/settings/api" },
      ],
    },
  ];

  return (
    <SettingsScaffold title={t.tipsPageTitle}>
      <div className="card">
        <h2>{t.tipsAskTitle}</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{t.tipsAskDesc}</p>
        <p style={{ fontStyle: "italic" }}>"{t.tipsAskQuestion}"</p>
        <button className="btn primary" onClick={askInChat}>
          {t.tipsAskButton}
        </button>
      </div>

      <div className="card">
        <h2>{t.tipsModelTitle}</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{t.tipsModelDesc}</p>
      </div>

      <div className="card">
        <h2>{t.tipsGeminiTitle}</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-line" }}>{t.tipsGeminiSteps}</p>
        <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">
          <button className="btn">{t.tipsGeminiOpenLink}</button>
        </a>
      </div>

      <div className="card">
        <h2>{t.tipsMcpTitle}</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-line" }}>{t.tipsMcpText}</p>
      </div>

      {suggestions.map((s) => (
        <div className="card" key={s.title}>
          <h2 style={{ fontSize: "1rem" }}>{s.title}</h2>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{s.description}</p>
          <div className="btn-row" style={{ flexWrap: "wrap" }}>
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer">
                <button className="btn">{t.tipsOpenRepo}</button>
              </a>
            )}
            {s.extraLinks?.map((link) => (
              <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>
                <button className="btn">{link.label}</button>
              </a>
            ))}
          </div>
        </div>
      ))}
    </SettingsScaffold>
  );
}
