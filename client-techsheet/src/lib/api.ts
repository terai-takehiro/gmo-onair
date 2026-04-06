import axios from 'axios';
import { useUiStore } from '@/stores/uiStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1/internal',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gmo_onair_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  const userId = useUiStore.getState().currentUserId;
  if (userId) {
    config.headers['x-user-id'] = userId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useUiStore.getState().setCurrentUserId(null);
      localStorage.removeItem('ts_user');
      window.location.href = '/techsheet/login';
    }
    return Promise.reject(error);
  },
);

export default api;
