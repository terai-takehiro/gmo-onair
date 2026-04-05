import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import api from "@/lib/api";
import { useUiStore } from "@/stores/uiStore";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** モジュール別パーミッション: module名 → access_level */
type Permissions = Record<string, string>;

/** モジュール定義（日本語ラベル付き） */
export const MODULE_LABELS: Record<string, string> = {
  dashboard: "ダッシュボード",
  projects: "案件管理",
  calendar: "スタジオ予約",
  equipment: "機材管理",
  revenues: "売上管理",
  purchases: "仕入管理",
  sga: "販管費",
  masters: "マスター管理",
  reports: "レポート",
  admin: "システム管理",
};

export const ACCESS_LEVEL_LABELS: Record<string, string> = {
  view: "閲覧のみ",
  edit: "閲覧・編集",
  full: "フルアクセス",
};

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (userId: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  permissions: Permissions;
  /** モジュールへのアクセス権があるかチェック */
  hasPermission: (module: string, minLevel?: "view" | "edit" | "full") => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const LEVEL_ORDER: Record<string, number> = { view: 1, edit: 2, full: 3 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [loading, setLoading] = useState(true);
  const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await api.get("/users/me/permissions");
      setPermissions(res.data.data || {});
    } catch {
      setPermissions({});
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("gmo_onair_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setCurrentUser(user);
        setCurrentUserId(user.id);
        fetchPermissions();
      } catch {
        localStorage.removeItem("gmo_onair_user");
      }
    }
    setLoading(false);
  }, [setCurrentUserId, fetchPermissions]);

  const login = useCallback(
    async (userId: string) => {
      setCurrentUserId(userId);
      const res = await api.post("/auth/login", { userId });
      const user = res.data.data;
      setCurrentUser(user);
      setCurrentUserId(user.id);
      localStorage.setItem("gmo_onair_user", JSON.stringify(user));
      await fetchPermissions();
    },
    [setCurrentUserId, fetchPermissions]
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    setPermissions({});
    setCurrentUserId(null);
    localStorage.removeItem("gmo_onair_user");
  }, [setCurrentUserId]);

  const hasPermission = useCallback(
    (module: string, minLevel: "view" | "edit" | "full" = "view") => {
      if (!currentUser) return false;
      // system_admin は全権限
      if (currentUser.role === "system_admin") return true;
      // _all は全モジュールアクセス（サーバー側で返す場合）
      if (permissions._all) return (LEVEL_ORDER[permissions._all] || 0) >= LEVEL_ORDER[minLevel];
      const userLevel = permissions[module];
      if (!userLevel) return false;
      return (LEVEL_ORDER[userLevel] || 0) >= LEVEL_ORDER[minLevel];
    },
    [currentUser, permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        login,
        logout,
        loading,
        permissions,
        hasPermission,
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
