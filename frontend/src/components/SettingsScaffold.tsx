import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export default function SettingsScaffold({ title, back = "/settings", children }: { title: string; back?: string; children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link to={back} className="back-link">
            ←
          </Link>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="content">{children}</div>
    </div>
  );
}
