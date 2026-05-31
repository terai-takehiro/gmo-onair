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
  { id: "sales",       label: "案件管理",           description: "案件パイプライン・顧客・見積",     icon: "FolderKanban", color: "bg-blue-500",    status: "active",      basePath: "/sales" },
  { id: "budget",      label: "予算管理",           description: "売上・仕入・販管費・損益",         icon: "PiggyBank",    color: "bg-emerald-500", status: "active",      basePath: "/budget" },
  { id: "studio",      label: "カレンダー",         description: "スタジオカレンダー・ブッキング",   icon: "Calendar",     color: "bg-violet-500",  status: "active",      basePath: "/studio" },
  { id: "qsheet",      label: "Qシート",            description: "Qシート作成・OnAir・ランダウン",   icon: "FileText",     color: "bg-rose-500",    status: "active",      basePath: "/qsheet" },
  { id: "equipment",   label: "機材管理",           description: "機材台帳・貸出・メンテナンス",     icon: "Package",      color: "bg-amber-500",   status: "active",      basePath: "/equipment" },
  { id: "techsheet",   label: "技術資料",           description: "カメラ・映像・音声技術仕様書",     icon: "BookOpen",     color: "bg-cyan-500",    status: "active",      basePath: "/techsheet" },
  { id: "liveops",     label: "計時LIVE",           description: "カウントダウン・視聴者カウンター", icon: "Timer",        color: "bg-red-500",     status: "active",      basePath: "/live" },
  { id: "awards",      label: "リアルタイムCG",     description: "リアルタイム放送CG演出・送出管理", icon: "Tv",           color: "bg-yellow-500",  status: "active",      basePath: "/awards" },
  { id: "interactive", label: "インタラクティブ演出", description: "スタンプ・リアルタイム演出支援 (外部)", icon: "Sparkles", color: "bg-pink-500", status: "active",      basePath: "https://interactive.gmo-onair.jp/", externalUrl: "https://interactive.gmo-onair.jp/" },
  { id: "translate",   label: "翻訳",               description: "GMO 翻訳ツール (外部)",            icon: "Languages",    color: "bg-green-600",   status: "active",      basePath: "https://gmo-translate.jp/", externalUrl: "https://gmo-translate.jp/" },
  { id: "assign",      label: "制作支援",           description: "スケジュール・スタッフ配置",       icon: "Users",        color: "bg-orange-500",  status: "coming_soon", basePath: "/prodsheet" },
  { id: "delivery",    label: "素材納品",           description: "VTR/素材の納品管理",               icon: "Truck",        color: "bg-teal-500",    status: "coming_soon", basePath: "/delivery" },
];

/** モジュール定義（日本語ラベル付き）— パーミッションキーとして使用 */
export const MODULE_LABELS: Record<string, string> = {
  sales: "案件管理",
  budget: "予算管理",
  studio: "カレンダー",
  equipment: "機材管理",
  qsheet: "Qシート",
  techsheet: "技術資料",
  liveops: "計時LIVE",
  awards: "リアルタイムCG",
  assign: "制作支援",
  delivery: "素材納品",
  admin: "システム管理",
};

/** アクセスレベル定義（3段階） */
export const ACCESS_LEVEL_LABELS: Record<string, string> = {
  reader: "閲覧",
  editor: "編集",
  manager: "管理",
};

/** アクセスレベルの説明 */
export const ACCESS_LEVEL_DESCRIPTIONS: Record<string, string> = {
  reader: "参照・CSV出力",
  editor: "追加・編集",
  manager: "追加・編集・削除・設定",
};

/** 旧レベルの互換ラベル（DBに古い値が残っている場合の表示用） */
export const LEGACY_LEVEL_LABELS: Record<string, string> = {
  exporter: "閲覧",
  owner:    "管理",
};

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (userId: string) => Promise<void>;
  /** OAuth callback: JWT tokenでログイン */
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  /** パーミッション取得が完了したか（PermissionRouteの表示制御に使用） */
  permissionsLoaded: boolean;
  permissions: Permissions;
  /** モジュールへのアクセス権があるかチェック */
  hasPermission: (module: string, minLevel?: "reader" | "exporter" | "editor" | "manager" | "owner") => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 3段階化: exporter=reader, owner=manager として扱う
const LEVEL_ORDER: Record<string, number> = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [loading, setLoading] = useState(true);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

  const fetchPermissions = useCallback(async (seed?: Permissions) => {
    // If a seed is provided (from /auth/me response), use it immediately
    if (seed && Object.keys(seed).length > 0) {
      setPermissions(seed);
      setPermissionsLoaded(true);
    }
    try {
      const res = await api.get("/users/me/permissions");
      const data: Permissions = res.data.data || {};
      // Only update if we got real data, or if seed was also empty
      if (Object.keys(data).length > 0 || !seed) {
        setPermissions(data);
      }
    } catch {
      // Don't clear permissions on network error if we already have data from seed
      if (!seed) setPermissions({});
    } finally {
      setPermissionsLoaded(true);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      // If we have a JWT token, validate via /auth/me
      const token = localStorage.getItem("gmo_onair_token");
      if (token) {
        try {
          const res = await api.get("/auth/me");
          const user = res.data.data;
          setCurrentUser(user);
          setCurrentUserId(user.id);
          localStorage.setItem("gmo_onair_user", JSON.stringify(user));
          // Use permissions embedded in /auth/me (req.user.permissions) as seed,
          // then fetch /users/me/permissions to confirm/refresh
          await fetchPermissions(user.permissions as Permissions | undefined);
          setLoading(false);
          return;
        } catch {
          localStorage.removeItem("gmo_onair_token");
          localStorage.removeItem("gmo_onair_user");
        }
      }

      // Fallback: mock mode — restore from localStorage
      const stored = localStorage.getItem("gmo_onair_user");
      if (stored) {
        try {
          const user = JSON.parse(stored);
          setCurrentUser(user);
          setCurrentUserId(user.id);
          fetchPermissions();
        } catch {
          localStorage.removeItem("gmo_onair_user");
          setPermissionsLoaded(true);
        }
      } else {
        setPermissionsLoaded(true);
      }
      setLoading(false);
    };
    init();
  }, [setCurrentUserId, fetchPermissions]);

  const login = useCallback(
    async (userId: string) => {
      setCurrentUserId(userId);
      const res = await api.post("/auth/mock-login", { userId });
      const user = res.data.data;
      setCurrentUser(user);
      setCurrentUserId(user.id);
      localStorage.setItem("gmo_onair_user", JSON.stringify(user));
      await fetchPermissions();
    },
    [setCurrentUserId, fetchPermissions]
  );

  /** OAuth callback login: store token and fetch user from /auth/me */
  const loginWithToken = useCallback(
    async (token: string | undefined) => {
      // 本番はCookieのみでtokenなし。undefinedをlocalStorageに書かないよう保護
      if (token) {
        localStorage.setItem("gmo_onair_token", token);
      } else {
        localStorage.removeItem("gmo_onair_token");
      }
      const res = await api.get("/auth/me");
      const user = res.data.data;
      setCurrentUser(user);
      setCurrentUserId(user.id);
      localStorage.setItem("gmo_onair_user", JSON.stringify(user));
      await fetchPermissions(user.permissions as Permissions | undefined);
    },
    [setCurrentUserId, fetchPermissions]
  );

  const logout = useCallback(async () => {
    setCurrentUser(null);
    setPermissions({});
    setPermissionsLoaded(true);
    setCurrentUserId(null);
    localStorage.removeItem("gmo_onair_user");
    localStorage.removeItem("gmo_onair_token");
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    // フルリロードでReact stateを完全リセット
    window.location.href = "/login";
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
        loginWithToken,
        logout,
        loading,
        permissionsLoaded,
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
