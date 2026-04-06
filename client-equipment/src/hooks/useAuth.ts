import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useUiStore } from "@/stores/uiStore";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

  useEffect(() => {
    const init = async () => {
      // OAuth mode: validate JWT token via /auth/me
      const token = localStorage.getItem("gmo_onair_token");
      if (token) {
        try {
          const res = await api.get("/auth/me");
          const user = res.data.data;
          setCurrentUser(user);
          setCurrentUserId(user.id);
          localStorage.setItem("eq_user", JSON.stringify(user));
          setLoading(false);
          return;
        } catch {
          localStorage.removeItem("gmo_onair_token");
          localStorage.removeItem("eq_user");
        }
      }

      // Mock mode: restore from localStorage
      const stored = localStorage.getItem("eq_user");
      if (stored) {
        try {
          const user = JSON.parse(stored);
          setCurrentUser(user);
          setCurrentUserId(user.id);
        } catch {
          localStorage.removeItem("eq_user");
        }
      }
      setLoading(false);
    };
    init();
  }, [setCurrentUserId]);

  const login = useCallback(
    async (userId: string) => {
      setCurrentUserId(userId);
      const res = await api.post("/auth/login", { userId });
      const user = res.data.data;
      setCurrentUser(user);
      setCurrentUserId(user.id);
      localStorage.setItem("eq_user", JSON.stringify(user));
    },
    [setCurrentUserId]
  );

  const loginWithToken = useCallback(
    async (token: string) => {
      localStorage.setItem("gmo_onair_token", token);
      const res = await api.get("/auth/me");
      const user = res.data.data;
      setCurrentUser(user);
      setCurrentUserId(user.id);
      localStorage.setItem("eq_user", JSON.stringify(user));
    },
    [setCurrentUserId]
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    setCurrentUserId(null);
    localStorage.removeItem("eq_user");
    localStorage.removeItem("gmo_onair_token");
    api.post("/auth/logout").catch(() => {});
  }, [setCurrentUserId]);

  return {
    currentUser,
    isAuthenticated: !!currentUser,
    loading,
    login,
    loginWithToken,
    logout,
  };
}
