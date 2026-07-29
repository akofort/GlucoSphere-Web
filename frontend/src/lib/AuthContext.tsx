import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, type PatientProfile, type User } from "./api";

interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated";
  user: User | null;
  /** The resolved Hauptpatient's clinical stammdata -- see GET /api/patient-profile. Fetched
   * alongside `user` so TopBar/ProfilePage/PDF exports always have it without a separate loading
   * state of their own. */
  patientProfile: PatientProfile | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);

  const refresh = async () => {
    try {
      const result = await api.me();
      if (result.username) {
        setUser(result as User);
        setStatus("authenticated");
        try {
          setPatientProfile(await api.getPatientProfile());
        } catch {
          setPatientProfile(null);
        }
      } else {
        setUser(null);
        setPatientProfile(null);
        setStatus("unauthenticated");
      }
    } catch {
      setUser(null);
      setPatientProfile(null);
      setStatus("unauthenticated");
    }
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStatus("unauthenticated");
      setUser(null);
      setPatientProfile(null);
    });
    refresh();
  }, []);

  const login = async (u: string, p: string) => {
    await api.login(u, p);
    await refresh();
  };

  const logout = async () => {
    await api.logout();
    setStatus("unauthenticated");
    setUser(null);
    setPatientProfile(null);
  };

  return (
    <AuthContext.Provider value={{ status, user, patientProfile, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
