import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import api from "@/lib/api";
import { useUiStore } from "@/stores/uiStore";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (userId: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

  useEffect(() => {
    const stored = localStorage.getItem("gmo_onair_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setCurrentUser(user);
        setCurrentUserId(user.id);
      } catch {
        localStorage.removeItem("gmo_onair_user");
      }
    }
    setLoading(false);
  }, [setCurrentUserId]);

  const login = useCallback(
    async (userId: string) => {
      setCurrentUserId(userId);
      const res = await api.post("/auth/login", { userId });
      const user = res.data.data;
      setCurrentUser(user);
      setCurrentUserId(user.id);
      localStorage.setItem("gmo_onair_user", JSON.stringify(user));
    },
    [setCurrentUserId]
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    setCurrentUserId(null);
    localStorage.removeItem("gmo_onair_user");
  }, [setCurrentUserId]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        login,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
