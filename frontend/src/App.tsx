import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import type { ReactNode } from "react";
import OverviewPage from "./pages/OverviewPage";
import ChatPage from "./pages/ChatPage";
import LoginPage from "./pages/LoginPage";
import SettingsOverviewPage from "./pages/settings/SettingsOverviewPage";
import LlmConfigPage from "./pages/settings/LlmConfigPage";
import DataSourcesPage from "./pages/settings/DataSourcesPage";
import McpServerPage from "./pages/settings/McpServerPage";
import ProfilePage from "./pages/settings/ProfilePage";
import AccountPage from "./pages/settings/AccountPage";
import BackupPage from "./pages/settings/BackupPage";
import PerformanceLogPage from "./pages/settings/PerformanceLogPage";
import UsersPage from "./pages/settings/UsersPage";
import SystemPromptPage from "./pages/settings/SystemPromptPage";
import AboutPage from "./pages/settings/AboutPage";
import TipsPage from "./pages/settings/TipsPage";
import BottomNav from "./components/BottomNav";
import DisclaimerGate from "./components/DisclaimerGate";
import { useAuth } from "./lib/AuthContext";
import { LanguageProvider } from "./lib/LanguageContext";

/** Defense-in-depth for MEMBER accounts navigating straight to an admin-only URL -- the backend
 * already 403s the underlying API calls (see main.py's `require_admin`), this just avoids a page
 * full of error toasts and bounces back to the settings hub instead. */
function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/settings" replace />;
  return <>{children}</>;
}

export default function App() {
  const { status, user } = useAuth();

  // "Einstellungen -> Erscheinungsbild" -- applies the logged-in user's own color theme by
  // setting the `data-theme` attribute the 6 palettes in index.css key off of. Runs here (not
  // inside AuthContext itself) so it stays a pure DOM side effect next to the rest of the app's
  // top-level rendering, not mixed into the auth state machine.
  useEffect(() => {
    document.documentElement.dataset.theme = user?.colorTheme ?? "MEDICAL_BLUE";
  }, [user?.colorTheme]);

  if (status === "loading") {
    return <div className="empty-state">…</div>;
  }
  if (status === "unauthenticated") {
    return <LoginPage />;
  }

  return (
    <LanguageProvider>
      <DisclaimerGate>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsOverviewPage />} />
            <Route path="/settings/llm" element={<AdminRoute><LlmConfigPage /></AdminRoute>} />
            <Route path="/settings/data-sources" element={<AdminRoute><DataSourcesPage /></AdminRoute>} />
            <Route path="/settings/mcp-server" element={<AdminRoute><McpServerPage /></AdminRoute>} />
            <Route path="/settings/profile" element={<ProfilePage />} />
            <Route path="/settings/account" element={<AccountPage />} />
            <Route path="/settings/backup" element={<AdminRoute><BackupPage /></AdminRoute>} />
            <Route path="/settings/performance-log" element={<AdminRoute><PerformanceLogPage /></AdminRoute>} />
            <Route path="/settings/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
            <Route path="/settings/system-prompt" element={<AdminRoute><SystemPromptPage /></AdminRoute>} />
            <Route path="/settings/about" element={<AboutPage />} />
            <Route path="/settings/tips" element={<TipsPage />} />
          </Routes>
          <BottomNav />
        </div>
      </DisclaimerGate>
    </LanguageProvider>
  );
}
