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

export interface AuthHookConfig {
  /** localStorage key for user data, e.g. 'qs_user', 'ts_user' */
  storageKey: string;
  /** Axios instance created by createApi */
  api: AxiosInstance;
}

export function createAuthHook(config: AuthHookConfig) {
  return function useAuth() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const setCurrentUserId = useUiStore((s) => s.setCurrentUserId);

    useEffect(() => {
      const init = async () => {
        const token = localStorage.getItem('gmo_onair_token');
        if (token) {
          try {
            const res = await config.api.get('/auth/me');
            const user = res.data.data;
            setCurrentUser(user);
            setCurrentUserId(user.id);
            localStorage.setItem(config.storageKey, JSON.stringify(user));
            setLoading(false);
            return;
          } catch {
            localStorage.removeItem('gmo_onair_token');
            localStorage.removeItem(config.storageKey);
          }
        }

        const stored = localStorage.getItem(config.storageKey);
        if (stored) {
          try {
            const user = JSON.parse(stored);
            setCurrentUser(user);
            setCurrentUserId(user.id);
          } catch {
            localStorage.removeItem(config.storageKey);
          }
        }
        setLoading(false);
      };
      init();
    }, [setCurrentUserId]);

    const login = useCallback(
      async (userId: string) => {
        setCurrentUserId(userId);
        const res = await config.api.post('/auth/mock-login', { userId });
        const user = res.data.data;
        setCurrentUser(user);
        setCurrentUserId(user.id);
        localStorage.setItem(config.storageKey, JSON.stringify(user));
      },
      [setCurrentUserId]
    );

    const loginWithToken = useCallback(
      async (token: string) => {
        localStorage.setItem('gmo_onair_token', token);
        const res = await config.api.get('/auth/me');
        const user = res.data.data;
        setCurrentUser(user);
        setCurrentUserId(user.id);
        localStorage.setItem(config.storageKey, JSON.stringify(user));
      },
      [setCurrentUserId]
    );

    const logout = useCallback(() => {
      setCurrentUser(null);
      setCurrentUserId(null);
      localStorage.removeItem(config.storageKey);
      localStorage.removeItem('gmo_onair_token');
      config.api.post('/auth/logout').catch(() => {});
    }, [setCurrentUserId]);

    return {
      currentUser,
      isAuthenticated: !!currentUser,
      loading,
      login,
      loginWithToken,
      logout,
    };
  };
}
