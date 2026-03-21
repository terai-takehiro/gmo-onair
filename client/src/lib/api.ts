import axios from 'axios';
import { useUiStore } from '@/stores/uiStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1/internal',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const userId = useUiStore.getState().currentUserId;
  if (userId) {
    config.headers['x-user-id'] = userId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response;
      if (status === 401) console.error('Unauthorized');
      else if (status === 403) console.error('Forbidden');
    }
    return Promise.reject(error);
  },
);

export default api;
