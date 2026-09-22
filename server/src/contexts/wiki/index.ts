import { Router } from 'express';
import homeRoutes from './routes/home.routes';
import spacesRoutes from './routes/spaces.routes';
import pagesRoutes from './routes/pages.routes';

/**
 * Wiki（新しいブロックアプリ）— Markdown で書いた文章をツリーに並べ、
 * 検索できて、AI が読める場所。設計の正は `docs/design/v4/wiki.md`。
 *
 * 段A（器）で出しているのは**読み取りだけ**です:
 *   GET  /wiki/home                     ホーム（スペース・最近更新・お気に入り・期限切れ）
 *   GET  /wiki/spaces                   スペースの一覧
 *   GET  /wiki/spaces/:key              スペース1件
 *   GET  /wiki/spaces/:key/tree         そのスペースのツリー
 *   GET  /wiki/pages/:id                ページ1件
 *   GET  /wiki/pages/:id/versions       履歴の一覧
 *   GET  /wiki/pages/:id/versions/:rev  版1件
 *   POST /wiki/pages/:id/view           閲覧の記録
 *
 * 作成・編集・公開は段B、データベースは段C、検索は段D、AI は段E、見直しは段F（§9）。
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
  router.use('/wiki', pagesRoutes);
  return router;
}
