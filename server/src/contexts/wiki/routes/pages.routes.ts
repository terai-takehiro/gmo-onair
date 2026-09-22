/**
 * Wiki — ページ閲覧と履歴の API（段A）。
 * 設計: `docs/design/v4/wiki.md` §6-②⑥・§7-3。
 *
 * - `GET  /wiki/pages/:id`               ページ1件（パンくず・バックリンク・お気に入り・30日の閲覧数）
 * - `GET  /wiki/pages/:id/versions`      履歴の一覧（本文は返さない＝軽くする）
 * - `GET  /wiki/pages/:id/versions/:rev` 版1件（本文つき）
 * - `POST /wiki/pages/:id/view`          閲覧の記録（204）
 *
 * **書き込み（作成・編集・公開）は段B です。** ここには置きません。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { getPage, listVersions, getVersion, recordView } from '../services/wiki-page.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;

router.get('/pages/:id', ...canRead, wrap(async (req, res) => {
  const row = await getPage(req.user!, p1(req.params.id));
  res.json({ success: true, data: row });
}));

router.get('/pages/:id/versions', ...canRead, wrap(async (req, res) => {
  const rows = await listVersions(req.user!, p1(req.params.id));
  res.json({ success: true, data: rows });
}));

router.get('/pages/:id/versions/:rev', ...canRead, wrap(async (req, res) => {
  const row = await getVersion(req.user!, p1(req.params.id), Number(p1(req.params.rev)));
  res.json({ success: true, data: row });
}));

/**
 * 閲覧の記録。**204（中身なし）で返します** — 画面はこの結果を使わないので、
 * 返す値があると「待ってから描く」実装を誘発します。
 */
router.post('/pages/:id/view', ...canRead, wrap(async (req, res) => {
  const body = req.body ?? {};
  await recordView(req.user!, p1(req.params.id), String(body.via ?? 'link'), body.answer_output_id ?? null);
  res.status(204).end();
}));

export default router;
