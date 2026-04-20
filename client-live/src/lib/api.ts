import { createApi } from '@gmo-onair/shared/src/client/createApi';

const api = createApi({
  storageKey: 'lv_user',
  loginPath: '/live/login',
});

export default api;
