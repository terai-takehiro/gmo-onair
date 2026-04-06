import { createApi } from '@gmo-onair/shared/src/client/createApi';

const api = createApi({
  storageKey: 'qs_user',
  loginPath: '/qsheet/login',
});

export default api;
