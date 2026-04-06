import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1/internal',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gmo_onair_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  const stored = localStorage.getItem('is_user');
  if (stored) {
    try {
      const user = JSON.parse(stored);
      config.headers['x-user-id'] = user.id;
    } catch { /* ignore */ }
  }
  return config;
});

export default api;

// Audience API (no auth required)
export const audienceApi = axios.create({
  baseURL: '/api/v1/internal/interactive/audience',
});
