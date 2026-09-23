/**
 * Wiki — スペースとツリーの API（段A）。
 * 設計: `docs/design/v4/wiki.md` §6-①②・§8。
 *
 * - `GET /wiki/spaces`            スペースの一覧（読める区分だけ・件数と最終更新つき）
 * - `GET /wiki/spaces/:key`       スペース1件
 * - `GET /wiki/spaces/:key/tree`  そのスペースのツリー（公開＋自分の下書き）
 * - `GET /wiki/users`             人の一覧（担当・人の項目・検索の「担当」の候補と名前の表示）
 *
 * 読み取りは区画 `wiki` の reader（全員の既定）。区分ごとの閲覧範囲は
 * service の `readableSpaceIds` が見ます（§8）。
 */
import { Router } from 'express';
import { queryAll } from '../../../shared/db/connection';
import { WIKI_ELIGIBLE } from '../services/wiki-access.service';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { listSpaces, getSpaceByKey, getSpaceTree } from '../services/wiki-space.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;

/**
 * 人の一覧（**上限なし**・id と名前だけ）。
 *
 * ⚠️ 画面は全体の `/users` を使いません。あちらは1回で100人までに切るので、
 * 101人目以降が検索の「担当」・ページの担当・データベースの人の項目に**出ず、名前も
 * 引けませんでした**（#730 の Codex 指摘・P2）。停止・招待中の人も返すのは、
 * 既に入っている担当の名前を id のまま見せないためです（削除した人だけ除きます）。
 *
 * ⚠️ **その代わり `active`（＝新しく選べる人か）を付けて返し、画面は選ぶ候補からは外します**
 * （#740 の Codex 指摘・P2 ×2）。`active` は「在籍中」かつ「Wiki を使える」（`WIKI_ELIGIBLE`）です。
 * 付けずに返していたころは、ログインできない人・Wiki を開けない人を担当に選べました。
 * 選べるのは在籍中の人と、いま入っている値だけです（`pickableUsers`）。
 */
router.get('/users', ...canRead, wrap(async (_req, res) => {
  const rows = await queryAll(
    `SELECT u.id, u.name,
            EXISTS (SELECT 1 FROM users u2 WHERE u2.id = u.id AND ${WIKI_ELIGIBLE.replace(/\bu\./g, 'u2.')}) AS active
       FROM users u WHERE u.deleted_at IS NULL ORDER BY u.name, u.id`,
  );
  res.json({ success: true, data: rows });
}));

router.get('/spaces', ...canRead, wrap(async (req, res) => {
  const rows = await listSpaces(req.user!);
  res.json({ success: true, data: rows });
}));

router.get('/spaces/:key', ...canRead, wrap(async (req, res) => {
  const row = await getSpaceByKey(req.user!, p1(req.params.key));
  res.json({ success: true, data: row });
}));

router.get('/spaces/:key/tree', ...canRead, wrap(async (req, res) => {
  // key → id を引くついでに「読めるか」も確かめる（読めなければ 404 で止まる）
  const space = await getSpaceByKey(req.user!, p1(req.params.key));
  const rows = await getSpaceTree(req.user!, String(space.id));
  res.json({ success: true, data: rows });
}));

export default router;
