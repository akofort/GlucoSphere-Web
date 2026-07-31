import { Link } from "react-router-dom";
import SettingsScaffold from "../../components/SettingsScaffold";
import { useLanguage } from "../../lib/LanguageContext";

/** Hub for everything log-shaped (Einstellungen -> Logging). The Performance-Log used to sit
 * directly in the settings menu; it lives here now, next to the token/cost counters and the usage
 * log, so the top-level menu stays short as more log views get added. */
export default function LoggingPage() {
  const { t } = useLanguage();

  const entries = [
    { to: "/settings/performance-log", title: t.settingsPerformanceLog, subtitle: t.settingsPerformanceLogSubtitle },
    { to: "/settings/token-usage", title: t.settingsTokenUsage, subtitle: t.settingsTokenUsageSubtitle },
    { to: "/settings/usage-log", title: t.settingsUsageLog, subtitle: t.settingsUsageLogSubtitle },
  ];

  return (
    <SettingsScaffold title={t.loggingTitle}>
      <div className="card">
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>{t.loggingHint}</p>
      </div>
      <div className="settings-menu">
        {entries.map((entry) => (
          <Link to={entry.to} key={entry.to}>
            <div>
              <div className="title">{entry.title}</div>
              <div className="subtitle">{entry.subtitle}</div>
            </div>
            <div className="arrow">›</div>
          </Link>
        ))}
      </div>
    </SettingsScaffold>
  );
}
