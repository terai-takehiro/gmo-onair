import { createApi } from '@gmo-onair/shared/src/client/createApi';

const api = createApi({
  storageKey: 'gmo_onair_user',
  loginPath: '/techops/login',
  // 音声サポートだけログイン不要の公開URL（CLAUDE.md「認証を付けないこと」）。
  // 旧 `/qsheet/audio/` は `RedirectQsheetToTechops` が転送するまでの一瞬だけ
  // ここに居るので、両方を挙げる。
  publicPaths: ['/techops/audio/', '/qsheet/audio/'],
});

export default api;
