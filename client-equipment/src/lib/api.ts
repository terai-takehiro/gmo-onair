import { createApi } from '@gmo-onair/shared/src/client/createApi';

const api = createApi({
  storageKey: 'eq_user',
  loginPath: '/equipment/login',
});

export default api;
