import { createAuthHook } from '@gmo-onair/shared/src/client/createAuthHook';
import api from '@/lib/api';

export const useAuth = createAuthHook({
  storageKey: 'gmo_onair_user',
  legacyStorageKeys: ['is_user'],
  api,
});
