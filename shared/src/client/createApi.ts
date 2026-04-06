// shared/src/client/createApi.ts — Factory for per-app axios instance
import axios from 'axios';
import { useUiStore } from './uiStore';

export interface ApiConfig {
  /** localStorage key for user data, e.g. 'qs_user', 'ts_user' */
  storageKey: string;
  /** Login redirect path, e.g. '/qsheet/login' */
  loginPath: string;
}

export function createApi(config: ApiConfig) {
  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1/internal',
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });

  api.interceptors.request.use((reqConfig) => {
    const token = localStorage.getItem('gmo_onair_token');
    if (token) {
      reqConfig.headers['Authorization'] = `Bearer ${token}`;
    }
    const userId = useUiStore.getState().currentUserId;
    if (userId) {
      reqConfig.headers['x-user-id'] = userId;
    }
    return reqConfig;
  });

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        useUiStore.getState().setCurrentUserId(null);
        localStorage.removeItem(config.storageKey);
        window.location.href = config.loginPath;
      }
      return Promise.reject(error);
    },
  );

  return api;
}
