import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // OAuth mode: validate JWT token via /auth/me
      const token = localStorage.getItem('gmo_onair_token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          const u = res.data.data;
          setUser(u);
          localStorage.setItem('is_user', JSON.stringify(u));
          setLoading(false);
          return;
        } catch {
          localStorage.removeItem('gmo_onair_token');
          localStorage.removeItem('is_user');
        }
      }

      // Mock mode: restore from localStorage
      const stored = localStorage.getItem('is_user');
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch { /* ignore */ }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = useCallback((u: User) => {
    localStorage.setItem('is_user', JSON.stringify(u));
    setUser(u);
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    localStorage.setItem('gmo_onair_token', token);
    const res = await api.get('/auth/me');
    const u = res.data.data;
    setUser(u);
    localStorage.setItem('is_user', JSON.stringify(u));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('is_user');
    localStorage.removeItem('gmo_onair_token');
    setUser(null);
    api.post('/auth/logout').catch(() => {});
  }, []);

  return { user, loading, login, loginWithToken, logout };
}
