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

/** ブロックアプリ定義 */
export interface BlockApp {
  id: string;
  label: string;
  description: string;
  icon: string;       // lucide icon name (resolved in UI)
  color: string;      // tailwind color class
  status: "active" | "coming_soon";
  basePath: string;
  /** 外部URLの場合（別タブで開く）。Phase NOW で Qsheet/EventStamp に使用 */
  externalUrl?: string;
}

export const BLOCK_APPS: BlockApp[] = [
  { id: "sales",     label: "営業管理",       description: "案件パイプライン・顧客・見積",   icon: "FolderKanban", color: "bg-blue-500",    status: "active",      basePath: "/sales" },
  { id: "budget",    label: "予算管理",       description: "売上・仕入・販管費・損益",       icon: "PiggyBank",    color: "bg-emerald-500", status: "active",      basePath: "/budget" },
  { id: "studio",    label: "スタジオ予約",   description: "スタジオカレンダー・ブッキング", icon: "Calendar",     color: "bg-violet-500",  status: "active",      basePath: "/studio" },
  { id: "equipment", label: "機材管理",       description: "機材台帳・貸出・メンテナンス",   icon: "Package",      color: "bg-amber-500",   status: "active",      basePath: "/equipment" },
  { id: "qsheet",    label: "Qシート",        description: "Qシート作成・放送進行",         icon: "FileText",     color: "bg-rose-500",    status: "active",      basePath: "/qsheet" },
  { id: "interactive",  label: "インタラクティブ演出", description: "スタンプ・リアルタイム演出支援", icon: "Sparkles",     color: "bg-pink-500",    status: "active",      basePath: "/interactive",  externalUrl: "/interactive/" },
  { id: "techdocs",  label: "技術資料",       description: "技術資料作成支援",               icon: "BookOpen",     color: "bg-cyan-500",    status: "coming_soon", basePath: "/techdocs" },
  { id: "assign",    label: "スタッフ配置",   description: "スタッフアサイン管理",           icon: "Users",        color: "bg-orange-500",  status: "coming_soon", basePath: "/assign" },
  { id: "delivery",     label: "素材納品",       description: "VTR/素材の納品管理",             icon: "Truck",        color: "bg-teal-500",    status: "coming_soon", basePath: "/delivery" },
];

/** モジュール定義（日本語ラベル付き）— パーミッションキーとして使用 */
export const MODULE_LABELS: Record<string, string> = {
  sales: "営業管理",
  budget: "予算管理",
  studio: "スタジオ予約",
  equipment: "機材管理",
  qsheet: "Qシート",
  techdocs: "技術資料",
  assign: "スタッフ配置",
  delivery: "素材納品",
  interactive: "インタラクティブ演出",
  admin: "システム管理",
};

/** アクセスレベル定義（BOX風 5段階） */
export const ACCESS_LEVEL_LABELS: Record<string, string> = {
  reader: "リーダー",
  exporter: "エクスポーター",
  editor: "エディター",
  manager: "マネージャー",
  owner: "オーナー",
};

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (userId: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  permissions: Permissions;
  /** モジュールへのアクセス権があるかチェック */
  hasPermission: (module: string, minLevel?: "reader" | "exporter" | "editor" | "manager" | "owner") => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const LEVEL_ORDER: Record<string, number> = { reader: 1, exporter: 2, editor: 3, manager: 4, owner: 5 };

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
    (module: string, minLevel: "reader" | "exporter" | "editor" | "manager" | "owner" = "reader") => {
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
