import { Router } from 'express';
import homeRoutes from './routes/home.routes';
import spacesRoutes from './routes/spaces.routes';
import pagesRoutes from './routes/pages.routes';
import pagesWriteRoutes from './routes/pages-write.routes';
import lockRoutes from './routes/lock.routes';
import filesRoutes from './routes/files.routes';
import databasesRoutes from './routes/databases.routes';
import searchRoutes from './routes/search.routes';
import mdRoutes from './routes/md.routes';
import aiRoutes from './routes/ai.routes';

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
 * 段C（データベース・§4-4）:
 *   GET  /wiki/databases/:pageId           項目とビューの定義
 *   PUT  /wiki/databases/:pageId           項目とビューをまとめて保存（editor）
 *   GET  /wiki/databases/:pageId/rows      行の一覧（`?view=` で絞り込み・並べ替え）
 *   POST /wiki/databases/:pageId/rows      行を1本足す（題だけでよい・editor）
 *   GET  /wiki/databases/:pageId/rows.csv  書き出し（Notion と同じ形）
 *   （ページを `kind='database'` にする／戻すのは `PATCH /wiki/pages/:id` の `kind`）
 *
 * 段D（検索・お気に入り・`.md`・§5-4・§5-2 の約束3）:
 *   GET    /wiki/search                    検索（語・スペース・タグ・担当・更新日）
 *   POST   /wiki/pages/:id/favorite        お気に入りに入れる
 *   DELETE /wiki/pages/:id/favorite        お気に入りから外す
 *   GET    /wiki/pages/:id.md              ページ1枚を text/markdown で（YAML の見出しつき）
 *   GET    /wiki/export?space=<key>        スペースまるごとを zip で
 *   POST   /wiki/import                    Obsidian・Notion・ONAiR の書き出し（zip）を取り込む（editor）
 *
 * 段E（AI・§7）:
 *   POST   /wiki/ask                          出典つきで答える（出せなければ答えない）
 *   GET    /wiki/ai/threads                   スレッドの一覧（**本人のみ**）
 *   GET    /wiki/ai/threads/:id               会話1本（本人のみ）
 *   DELETE /wiki/ai/threads/:id               会話を消す（本人のみ）
 *   POST   /wiki/ai/messages/:id/feedback     3値の評価（条件2）
 *   POST   /wiki/pages/:id/draft              そのページに AI で下書きを書く（editor）
 *   POST   /wiki/ai/draft                     新しい下書きページを AI で作る（editor）
 *   POST   /wiki/rewrite                      手入力のメモを手順書の形に（**保存しない**・editor）
 *   POST   /wiki/rewrite/:outputId/decision   置き換えた／やめた（条件2・editor）
 *   GET    /wiki/ai/gaps                      足りないページ（manager）
 *   POST   /wiki/ai/gaps/:id/resolve          ページにした／書かない（manager）
 *   GET    /wiki/ai/digest                    AI の直され方と成果（条件4・manager）
 *
 * 見直しは段F（§9）。
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
  router.use('/wiki', databasesRoutes);
  router.use('/wiki', lockRoutes);
  router.use('/wiki', searchRoutes);
  // ⚠️ `mdRoutes` の `/pages/:id.md` は `pagesRoutes` の `/pages/:id` より**先**に置くこと
  //    （Express は登録順に照合するので、後ろだと `:id` が `wp-xxxx.md` まで食べる）
  router.use('/wiki', mdRoutes);
  // ⚠️ `aiRoutes` の `/pages/:id/draft` は `pagesWriteRoutes` より**先**に置きます
  //    （後ろでも道は別ですが、ページの書き込みの道が広がったときに巻き込まれないため）
  router.use('/wiki', aiRoutes);
  router.use('/wiki', pagesWriteRoutes);
  router.use('/wiki', pagesRoutes);
  return router;
}
