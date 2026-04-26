import { createApi } from '@gmo-onair/shared/src/client/createApi';
import axios from 'axios';

const api = createApi({
  storageKey: 'gmo_onair_user',
  loginPath: '/interactive/login',
});

export default api;

// Audience API (no auth required)
export const audienceApi = axios.create({
  baseURL: '/api/v1/internal/interactive/audience',
});
