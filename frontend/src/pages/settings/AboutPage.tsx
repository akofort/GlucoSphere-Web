import SettingsScaffold from "../../components/SettingsScaffold";
import { useLanguage } from "../../lib/LanguageContext";

interface LicenseEntry {
  name: string;
  license: string;
  url: string;
}

const LICENSES: LicenseEntry[] = [
  { name: "React / React DOM", license: "MIT", url: "https://github.com/facebook/react" },
  { name: "React Router", license: "MIT", url: "https://github.com/remix-run/react-router" },
  { name: "react-markdown", license: "MIT", url: "https://github.com/remarkjs/react-markdown" },
  { name: "remark-gfm", license: "MIT", url: "https://github.com/remarkjs/remark-gfm" },
  { name: "Vite", license: "MIT", url: "https://github.com/vitejs/vite" },
  { name: "TypeScript", license: "Apache-2.0", url: "https://github.com/microsoft/TypeScript" },
  { name: "FastAPI", license: "MIT", url: "https://github.com/tiangolo/fastapi" },
  { name: "Uvicorn", license: "BSD-3-Clause", url: "https://github.com/encode/uvicorn" },
  { name: "httpx", license: "BSD-3-Clause", url: "https://github.com/encode/httpx" },
  { name: "Pydantic", license: "MIT", url: "https://github.com/pydantic/pydantic" },
  { name: "cryptography (pyca)", license: "Apache-2.0 / BSD-3-Clause", url: "https://github.com/pyca/cryptography" },
  { name: "nginx", license: "BSD-2-Clause", url: "https://nginx.org/" },
];

export default function AboutPage() {
  const { t, language } = useLanguage();
  const locale = language === "DE" ? "de-DE" : "en-US";
  const buildTime = __BUILD_TIME__
    ? new Date(__BUILD_TIME__).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
    : "-";

  return (
    <SettingsScaffold title={t.settingsAbout}>
      <div style={{ display: "flex", justifyContent: "center", padding: "1rem 0" }}>
        <img src="/about-logo.jpg" alt="GlucoSphere" style={{ width: "100%", maxWidth: 260, height: "auto", borderRadius: 16 }} />
      </div>

      <div className="card">
        <h2>{t.aboutVersion}</h2>
        <p>
          <a href="https://github.com/akofort/GlucoSphere-Web" target="_blank" rel="noreferrer">
            {t.aboutRepo}
          </a>
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {t.aboutBuildLabel}: {__BUILD_SHA__}
          <br />
          {t.aboutBuildDateLabel}: {buildTime}
        </p>
      </div>

      <div className="card">
        <h2>{t.aboutDisclaimerTitle}</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>{t.aboutDisclaimerText}</p>
      </div>

      <div className="card">
        <h2>{t.aboutPrivacyTitle}</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>{t.aboutPrivacyText}</p>
      </div>

      <div className="card">
        <h2>{t.aboutLicensesTitle}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t.aboutLicensesHint}</p>
        <table className="metrics-table">
          <tbody>
            {LICENSES.map((entry) => (
              <tr key={entry.name}>
                <td>
                  <a href={entry.url} target="_blank" rel="noreferrer">
                    {entry.name}
                  </a>
                </td>
                <td>{entry.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>{t.aboutCopyright}</p>
    </SettingsScaffold>
  );
}
