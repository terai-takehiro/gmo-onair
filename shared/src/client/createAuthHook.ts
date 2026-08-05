// shared/src/client/createAuthHook.ts — Factory for per-app useAuth hook
import { useCallback, useEffect, useState } from 'react';
import { useUiStore } from './uiStore';
import type { AxiosInstance } from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: Record<string, string>; // module -> access_level
}

type AccessLevel = 'reader' | 'editor' | 'manager';

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

export interface AuthHookConfig {
  /** localStorage key for user data, e.g. 'gmo_onair_user' */
  storageKey: string;
  /** Axios instance created by createApi */
  api: AxiosInstance;
  /** Legacy keys to migrate from (one-shot copy → storageKey then delete). v2.2.0+ */
  legacyStorageKeys?: string[];
}

/**
 * One-time migration: 旧キー (例 qs_user/eq_user) のデータがあり、
 * 新キーが空の場合だけ新キーへコピーし、旧キーは削除する。
 * v2.2.0 で全アプリ共通の `gmo_onair_user` に統一するための互換層。
 */
function migrateLegacyKeys(targetKey: string, legacyKeys: string[]) {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(targetKey)) return;
  for (const k of legacyKeys) {
    const v = localStorage.getItem(k);
    if (v) {
      localStorage.setItem(targetKey, v);
      localStorage.removeItem(k);
      return;
    }
  }
}

function readStoredUser(storageKey: string): User | null {
  try {
    const s = localStorage.getItem(storageKey);
    return s ? (JSON.parse(s) as User) : null;
  } catch {
    return null;
  }
}

const PERMISSIONS_STORAGE_KEY = 'gmo_onair_permissions';

function readStoredPermissions(): Record<string, string> {
  try {
    const s = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
    return s ? (JSON.parse(s) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeStoredPermissions(perms: Record<string, string>) {
  try {
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(perms));
  } catch {
    /* localStorage full / disabled — silently ignore, runtime state still works */
  }
}

export function createAuthHook(config: AuthHookConfig) {
  // モジュールロード時に旧キーから新キーへ一度だけ移行する
  if (config.legacyStorageKeys?.length) {
    migrateLegacyKeys(config.storageKey, config.legacyStorageKeys);
  }
  return function useAuth() {
    // localStorage の user は表示用の初期値としてのみ使う (UI フラッシュ抑制)。
    // **正当性は /auth/me で確認するまで保留** — v2.4.2 で loading 初期値を常に true にした。
    // 旧実装 (loading = (readStoredUser === null)) では「localStorage に stale user が残っていて
    // cookie が失効」の場合、loading=false で即「ログイン済み」と誤判定し、LoginPage がルートへ
    // hard redirect → ルートで 401 → /login に戻る、というリダイレクトループを誘発していた。
    const [currentUser, setCurrentUser] = useState<User | null>(() => readStoredUser(config.storageKey));
    // permissions も localStorage キャッシュから初期化する (v2.8.90)。
    // 以前は常に {} 初期値で、`/users/me/permissions` が遅い・失敗すると hasPermission(...) が false を返し、
    // 編集ボタン (機材登録 / 表編集) が非表示になる問題があった。キャッシュを介して即座に権限を復元する。
    const [permissions, setPermissions] = useState<Record<string, string>>(() => readStoredPermissions());
    const [loading, setLoading] = useState(true);
    const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

    useEffect(() => {
      const init = async () => {
        try {
          // /auth/me が成功するまで permissions の確定はしない。permissions API が失敗した場合は
          // キャッシュ値を温存して silent fallback (= ボタンが消える事故を防ぐ)。
          const meRes = await config.api.get('/auth/me');
          const user = meRes.data.data;
          setCurrentUser(user);
          setCurrentUserId(user.id);
          localStorage.setItem(config.storageKey, JSON.stringify(user));

          try {
            const permRes = await config.api.get('/users/me/permissions');
            const perms = permRes.data.data || {};
            setPermissions(perms);
            writeStoredPermissions(perms);
          } catch (permErr) {
            // permissions 取得失敗時はキャッシュ値を保持 (clobber しない)。
            console.warn('[useAuth] permissions fetch failed, keeping cached values', permErr);
          }
        } catch {
          // /auth/me 失敗 = セッション無効。ユーザーと権限の両方をクリア。
          setCurrentUser(null);
          setPermissions({});
          localStorage.removeItem('gmo_onair_token');
          localStorage.removeItem(config.storageKey);
          localStorage.removeItem(PERMISSIONS_STORAGE_KEY);
        } finally {
          setLoading(false);
        }
      };
      init();
    }, [setCurrentUserId]);

    const login = useCallback(
      async (userId: string) => {
        setCurrentUserId(userId);
        const loginRes = await config.api.post('/auth/mock-login', { userId });
        const user = loginRes.data.data;
        setCurrentUser(user);
        setCurrentUserId(user.id);
        localStorage.setItem(config.storageKey, JSON.stringify(user));
        // Fetch permissions now that we're logged in
        try {
          const pRes = await config.api.get('/users/me/permissions');
          const perms = pRes.data.data || {};
          setPermissions(perms);
          writeStoredPermissions(perms);
        } catch (permErr) {
          console.warn('[useAuth] permissions fetch after login failed', permErr);
        }
      },
      [setCurrentUserId]
    );

    const loginWithToken = useCallback(
      async (token: string) => {
        localStorage.setItem('gmo_onair_token', token);
        const meRes = await config.api.get('/auth/me');
        const user = meRes.data.data;
        setCurrentUser(user);
        setCurrentUserId(user.id);
        localStorage.setItem(config.storageKey, JSON.stringify(user));
        try {
          const permRes = await config.api.get('/users/me/permissions');
          const perms = permRes.data.data || {};
          setPermissions(perms);
          writeStoredPermissions(perms);
        } catch (permErr) {
          console.warn('[useAuth] permissions fetch after token login failed', permErr);
        }
      },
      [setCurrentUserId]
    );

    const logout = useCallback(() => {
      setCurrentUser(null);
      setPermissions({});
      setCurrentUserId(null);
      localStorage.removeItem(config.storageKey);
      localStorage.removeItem('gmo_onair_token');
      localStorage.removeItem(PERMISSIONS_STORAGE_KEY);
      config.api.post('/auth/logout').catch(() => {});
    }, [setCurrentUserId]);

    const hasPermission = useCallback(
      (module: string, minLevel: AccessLevel = 'reader') => {
        if (!currentUser) return false;
        if (currentUser.role === 'system_admin') return true;
        if (permissions._all) return (LEVEL_ORDER[permissions._all] || 0) >= LEVEL_ORDER[minLevel];
        const userLevel = permissions[module];
        if (!userLevel) return false;
        return (LEVEL_ORDER[userLevel] || 0) >= LEVEL_ORDER[minLevel];
      },
      [currentUser, permissions]
    );

    return {
      currentUser,
      isAuthenticated: !!currentUser,
      loading,
      permissions,
      login,
      loginWithToken,
      logout,
      hasPermission,
    };
  };
}
