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
const LEVEL_ORDER: Record<string, number> = {
  reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3,
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

export function createAuthHook(config: AuthHookConfig) {
  // モジュールロード時に旧キーから新キーへ一度だけ移行する
  if (config.legacyStorageKeys?.length) {
    migrateLegacyKeys(config.storageKey, config.legacyStorageKeys);
  }
  return function useAuth() {
    // Initialize synchronously from localStorage → no loading flash, buttons active immediately
    const [currentUser, setCurrentUser] = useState<User | null>(() => readStoredUser(config.storageKey));
    const [permissions, setPermissions] = useState<Record<string, string>>({});
    // loading = false when we have cached user (still verifies in background)
    const [loading, setLoading] = useState(() => readStoredUser(config.storageKey) === null);
    const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

    useEffect(() => {
      const init = async () => {
        try {
          // Fetch auth + permissions in parallel
          const [meRes, permRes] = await Promise.all([
            config.api.get('/auth/me'),
            config.api.get('/users/me/permissions').catch(() => ({ data: { data: {} } })),
          ]);
          const user = meRes.data.data;
          setCurrentUser(user);
          setCurrentUserId(user.id);
          localStorage.setItem(config.storageKey, JSON.stringify(user));
          setPermissions(permRes.data.data || {});
        } catch {
          // Token expired or invalid — clear cached state
          setCurrentUser(null);
          setPermissions({});
          localStorage.removeItem('gmo_onair_token');
          localStorage.removeItem(config.storageKey);
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
        const pRes = await config.api.get('/users/me/permissions').catch(() => ({ data: { data: {} } }));
        setPermissions(pRes.data.data || {});
      },
      [setCurrentUserId]
    );

    const loginWithToken = useCallback(
      async (token: string) => {
        localStorage.setItem('gmo_onair_token', token);
        const [meRes, permRes] = await Promise.all([
          config.api.get('/auth/me'),
          config.api.get('/users/me/permissions').catch(() => ({ data: { data: {} } })),
        ]);
        const user = meRes.data.data;
        setCurrentUser(user);
        setCurrentUserId(user.id);
        localStorage.setItem(config.storageKey, JSON.stringify(user));
        setPermissions(permRes.data.data || {});
      },
      [setCurrentUserId]
    );

    const logout = useCallback(() => {
      setCurrentUser(null);
      setPermissions({});
      setCurrentUserId(null);
      localStorage.removeItem(config.storageKey);
      localStorage.removeItem('gmo_onair_token');
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
