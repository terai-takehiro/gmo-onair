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
  /** localStorage key for user data, e.g. 'qs_user', 'ts_user' */
  storageKey: string;
  /** Axios instance created by createApi */
  api: AxiosInstance;
}

export function createAuthHook(config: AuthHookConfig) {
  return function useAuth() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [permissions, setPermissions] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

    const fetchPermissions = useCallback(async () => {
      try {
        const res = await config.api.get('/users/me/permissions');
        setPermissions(res.data.data || {});
      } catch {
        setPermissions({});
      }
    }, []);

    useEffect(() => {
      const init = async () => {
        try {
          const res = await config.api.get('/auth/me');
          const user = res.data.data;
          setCurrentUser(user);
          setCurrentUserId(user.id);
          localStorage.setItem(config.storageKey, JSON.stringify(user));
          await fetchPermissions();
          setLoading(false);
          return;
        } catch {
          localStorage.removeItem('gmo_onair_token');
          localStorage.removeItem(config.storageKey);
        }
        setLoading(false);
      };
      init();
    }, [setCurrentUserId, fetchPermissions]);

    const login = useCallback(
      async (userId: string) => {
        setCurrentUserId(userId);
        const res = await config.api.post('/auth/mock-login', { userId });
        const user = res.data.data;
        setCurrentUser(user);
        setCurrentUserId(user.id);
        localStorage.setItem(config.storageKey, JSON.stringify(user));
        await fetchPermissions();
      },
      [setCurrentUserId, fetchPermissions]
    );

    const loginWithToken = useCallback(
      async (token: string) => {
        localStorage.setItem('gmo_onair_token', token);
        const res = await config.api.get('/auth/me');
        const user = res.data.data;
        setCurrentUser(user);
        setCurrentUserId(user.id);
        localStorage.setItem(config.storageKey, JSON.stringify(user));
        await fetchPermissions();
      },
      [setCurrentUserId, fetchPermissions]
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
