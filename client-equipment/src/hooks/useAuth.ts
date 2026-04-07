import { createAuthHook } from '@gmo-onair/shared/src/client/createAuthHook';
import api from '@/lib/api';

export const useAuth = createAuthHook({
  storageKey: 'eq_user',
  api,
});
