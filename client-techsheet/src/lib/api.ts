import { createApi } from '@gmo-onair/shared/src/client/createApi';

const api = createApi({
  storageKey: 'gmo_onair_user',
  loginPath: '/techsheet/login',
});

export default api;
