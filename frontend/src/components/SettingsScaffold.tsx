import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { LogoutIcon } from "./Icons";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";

export default function SettingsScaffold({ title, back = "/settings", children }: { title: string; back?: string; children: ReactNode }) {
  const { t } = useLanguage();
  const { logout } = useAuth();
  return (
    <div className="app-shell">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link to={back} className="back-link">
            ←
          </Link>
          <h1>{title}</h1>
        </div>
        <div className="topbar-actions">
          <button onClick={() => logout()} title={t.accountLogout}>
            <LogoutIcon />
          </button>
        </div>
      </div>
      <div className="content">{children}</div>
    </div>
  );
}
