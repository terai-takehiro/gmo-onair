import { Router } from 'express';
import homeRoutes from './routes/home.routes';
import spacesRoutes from './routes/spaces.routes';
import pagesRoutes from './routes/pages.routes';
import pagesWriteRoutes from './routes/pages-write.routes';
import lockRoutes from './routes/lock.routes';
import filesRoutes from './routes/files.routes';

/**
 * Wiki（新しいブロックアプリ）— Markdown で書いた文章をツリーに並べ、
 * 検索できて、AI が読める場所。設計の正は `docs/design/v4/wiki.md`。
 *
 * 段A（読み取り）:
 *   GET  /wiki/home                     ホーム（スペース・最近更新・お気に入り・要見直し）
 *   GET  /wiki/spaces                   スペースの一覧
 *   GET  /wiki/spaces/:key              スペース1件
 *   GET  /wiki/spaces/:key/tree         そのスペースのツリー
 *   GET  /wiki/pages/:id                ページ1件
 *   GET  /wiki/pages/:id/versions       履歴の一覧
 *   GET  /wiki/pages/:id/versions/:rev  版1件
 *   POST /wiki/pages/:id/view           閲覧の記録
 *
 * 段B（書き込み）:
 *   POST   /wiki/pages                       追加（テンプレートから写せる・editor）
 *   PATCH  /wiki/pages/:id                   保存（本文・題・情報の欄・editor）
 *   PATCH  /wiki/pages/:id/move              ツリーの中で動かす（editor）
 *   DELETE /wiki/pages/:id                   削除（子ページも一緒に・manager）
 *   GET    /wiki/templates                   テンプレートの一覧（editor）
 *   POST   /wiki/pages/:id/make-template     テンプレートにする／やめる（manager）
 *   POST   /wiki/pages/:id/lock              編集ロックを取る（60秒ハートビート兼用・editor）
 *   DELETE /wiki/pages/:id/lock              放す（editor）
 *   POST   /wiki/pages/:id/lock/takeover     引き継ぐ（manager）
 *   POST   /wiki/pages/:id/lock/request      交代を申し出る（reader・§6-③）
 *   POST   /wiki/files                       画像を上げる（editor）
 *   GET    /wiki/files/:id                   画像を配る（reader）
 *
 * データベースは段C、検索は段D、AI は段E、見直しは段F（§9）。
 *
 * ⚠️ **並べる順に意味があります。** `/pages/:id/versions` は `/pages/:id` より
 * 先に書いてありますが、Express は**より具体的な道から順に**照合するわけではなく
 * 登録順に見るだけです。`/pages/:id` が先でも `/pages/:id/versions` は別の道なので
 * ぶつかりませんが、将来 `/pages/:rest*` のような広い道を足すときは最後に置いてください。
 */
export function createWikiRoutes(): Router {
  const router = Router();
  router.use('/wiki', homeRoutes);
  router.use('/wiki', spacesRoutes);
  router.use('/wiki', filesRoutes);
  router.use('/wiki', lockRoutes);
  router.use('/wiki', pagesWriteRoutes);
  router.use('/wiki', pagesRoutes);
  return router;
}
