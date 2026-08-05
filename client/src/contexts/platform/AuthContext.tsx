import { APP_LABELS } from "@gmo-onair/shared/src/client/apps";
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

/**
 * モジュール定義（日本語ラベル付き）— パーミッションキーとして使用。
 * **名前は `apps.ts` から引く**（2か所に書くと必ず片方だけ変わる）。
 */
export const MODULE_LABELS: Record<string, string> = {
  ...APP_LABELS,
  // アプリではないが権限モジュールとして存在するもの
  partner_schedule: 'パートナースケジュール',
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
/**
 * アクセスレベルの強さ。
 *
 * **`full` を必ず入れておくこと。** サーバーは system_admin に
 * `{ _all: 'full' }` を返す (`users.routes.ts`)。いまは `role === 'system_admin'` を
 * 先に見るので到達しないが、`_all` を一般ユーザーにも返すようにした瞬間に
 * `(undefined || 0) >= 1` = false になり、**その人から全メニューが消える**。
 */
const LEVEL_ORDER: Record<string, number> = {
  reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3, full: 4,
};

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
