import { createContext, useContext, type ReactNode } from "react";
import { api } from "./api";
import { STRINGS, type Strings } from "./strings";
import { useAuth } from "./AuthContext";

interface LanguageState {
  language: "DE" | "EN";
  t: Strings;
  setLanguage: (lang: "DE" | "EN") => Promise<void>;
}

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const language = user?.appLanguage ?? "DE";

  const setLanguage = async (lang: "DE" | "EN") => {
    if (!user) return;
    await api.updateOwnProfile({
      displayName: user.displayName, userRole: user.userRole, appLanguage: lang,
      glucoseUnit: user.glucoseUnit, insulinPump: user.insulinPump, cgmSystem: user.cgmSystem,
    });
    await refresh();
  };

  return (
    <LanguageContext.Provider value={{ language, t: STRINGS[language], setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
