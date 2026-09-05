import { APP_LABELS } from "@gmo-onair/shared/src/client/apps";
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import api from "@/lib/api";
import { clearRecent } from "@gmo-onair/shared/src/client-v4/recent";
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

// **アクセスレベルの日本語ラベルはここに持たない。**
// 画面に出す言い方は「見るだけ／書ける／管理」で全アプリ共通にしてあり、正は
// `pages/members/moduleLabels.ts` の `LEVEL_CHOICES` と
// `shared/src/client/states/NoPermissionPanel.tsx`。
// ここにあった `ACCESS_LEVEL_LABELS`（閲覧／編集／管理）は参照 0 件のまま
// 古い言い方だけを残しており、読んだ人が別の語を書き足す元になっていたので消した。

/** アクセスレベルの説明 */
export const ACCESS_LEVEL_DESCRIPTIONS: Record<string, string> = {
  reader: "参照・CSV出力",
  editor: "追加・編集",
  manager: "追加・編集・削除・設定",
};

/** 旧レベルの互換ラベル（DBに古い値が残っている場合の表示用） */
export const LEGACY_LEVEL_LABELS: Record<string, string> = {
  exporter: "見るだけ",
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
  /**
   * 自分の `role`（system_admin / staff）と権限をサーバーから読み直す。
   *
   * `currentUser` / `permissions` は react-query の外（このコンテキストの state）に
   * 持っているため、権限・役割・システム上の区別の保存で invalidateQueries しても
   * 更新されない。**自分自身のこれらを直した直後**に呼ぶと、リロードなしで
   * メニュー・ボタンの出し分けに反映される。
   *
   * ⚠️ `role` も読み直す（`permissions` だけでは足りない）— `hasPermission` は
   * まず `currentUser.role === 'system_admin'` を見るので、自分の `role` を
   * system_admin から降格した／に上げた場合、`role` が古いままだと
   * 権限の見え方が変わらない（実際にレビューで指摘された）
   */
  refreshPermissions: () => Promise<void>;
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

  /**
   * 自分自身の `role` と `permissions` を `/auth/me` から読み直す。
   *
   * mock 認証も JWT 認証も `req.user` は毎リクエスト DB から作り直される
   * （`mockAuth` / `jwtAuth` → `loadUserWithPermissions`）ため、この1本で
   * どちらのモードでも最新の `role` と `permissions` が取れる。
   * ログイン中の再取得なので、ログアウト処理のような localStorage の書き換えはしない
   * （JWT トークン自体は変わらない）。
   */
  const refreshSelf = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      const user = res.data.data as User & { permissions?: Permissions };
      setCurrentUser({ id: user.id, name: user.name, email: user.email, role: user.role });
      setPermissions(user.permissions ?? {});
      setPermissionsLoaded(true);
      // mock mode は localStorage の `gmo_onair_user` を初期化に使うので、
      // ここも更新しておかないと次のリロードで古い role に戻る
      if (!localStorage.getItem("gmo_onair_token")) {
        localStorage.setItem("gmo_onair_user", JSON.stringify({
          id: user.id, name: user.name, email: user.email, role: user.role,
        }));
      }
    } catch {
      // 読み直しに失敗しても、いま持っている値をそのまま使う
      // (ここで消すと保存はできたのに画面がエラー扱いになる)
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
    // **「最近見たもの」も消す。** 読むときに持ち主を突き合わせてはいるが、
    // 端末に案件名・お客様名が残り続ける理由が無い（辞めた人の分も残らない）
    clearRecent();
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
        refreshPermissions: refreshSelf,
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
