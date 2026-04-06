import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1/internal',
});

api.interceptors.request.use((config) => {
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
