/**
 * Wiki — スペースとツリーの API（段A）。
 * 設計: `docs/design/v4/wiki.md` §6-①②・§8。
 *
 * - `GET /wiki/spaces`            スペースの一覧（読める区分だけ・件数と最終更新つき）
 * - `GET /wiki/spaces/:key`       スペース1件
 * - `GET /wiki/spaces/:key/tree`  そのスペースのツリー（公開＋自分の下書き）
 *
 * 読み取りは区画 `wiki` の reader（全員の既定）。区分ごとの閲覧範囲は
 * service の `readableSpaceIds` が見ます（§8）。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { listSpaces, getSpaceByKey, getSpaceTree } from '../services/wiki-space.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;

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
