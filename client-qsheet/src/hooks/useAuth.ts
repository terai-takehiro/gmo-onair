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
    const stored = localStorage.getItem("qs_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setCurrentUser(user);
        setCurrentUserId(user.id);
      } catch {
        localStorage.removeItem("qs_user");
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
      localStorage.setItem("qs_user", JSON.stringify(user));
    },
    [setCurrentUserId]
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    setCurrentUserId(null);
    localStorage.removeItem("qs_user");
  }, [setCurrentUserId]);

  return {
    currentUser,
    isAuthenticated: !!currentUser,
    loading,
    login,
    logout,
  };
}
