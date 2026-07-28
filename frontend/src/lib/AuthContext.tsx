import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, type User } from "./api";

interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated";
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);

  const refresh = async () => {
    try {
      const result = await api.me();
      if (result.username) {
        setUser(result as User);
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStatus("unauthenticated");
      setUser(null);
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
  };

  return <AuthContext.Provider value={{ status, user, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
