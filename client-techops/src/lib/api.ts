import { createApi } from '@gmo-onair/shared/src/client/createApi';

const api = createApi({
  storageKey: 'gmo_onair_user',
  loginPath: '/techops/login',
  // ログイン不要の公開URL（CLAUDE.md「認証を付けないこと」）:
  //   ・音声サポート（旧 `/qsheet/audio/` は `RedirectQsheetToTechops` が転送するまでの
  //     一瞬だけここに居るので、両方を挙げる）
  //   ・テロップCGの出力画面（OBS のブラウザソースが未ログインで開く —
  //     公開音声URLが 401 でログイン画面へ強制送還されていた前例の再発防止）
  publicPaths: ['/techops/audio/', '/qsheet/audio/', '/techops/graphics/output/'],
});

export default api;
