import { NavLink } from "react-router-dom";
import { useLanguage } from "../lib/LanguageContext";
import { ChatIcon, OverviewIcon, SettingsIcon } from "./Icons";

export default function BottomNav() {
  const { t } = useLanguage();
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        <OverviewIcon />
        <span>{t.navOverview}</span>
      </NavLink>
      <NavLink to="/chat" className={({ isActive }) => (isActive ? "active" : "")}>
        <ChatIcon />
        <span>{t.navChat}</span>
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
        <SettingsIcon />
        <span>{t.navSettings}</span>
      </NavLink>
    </nav>
  );
}
