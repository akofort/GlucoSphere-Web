import { NavLink } from "react-router-dom";
import { useLanguage } from "../lib/LanguageContext";

export default function BottomNav() {
  const { t } = useLanguage();
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        {t.navOverview}
      </NavLink>
      <NavLink to="/chat" className={({ isActive }) => (isActive ? "active" : "")}>
        {t.navChat}
      </NavLink>
    </nav>
  );
}
