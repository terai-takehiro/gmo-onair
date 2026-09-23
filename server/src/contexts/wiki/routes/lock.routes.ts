/**
 * Wiki — 編集ロック4本（段B）。設計: `docs/design/v4/wiki.md` §6-③・§10-4。
 * 規則は運営マニュアル（§6-2-1）と同じで、実装は `services/wiki-lock.service.ts`。
 *
 * - `POST   /wiki/pages/:id/lock`          取る（**60秒ごとのハートビート兼用**）
 * - `DELETE /wiki/pages/:id/lock`          放す（自分が保持者のときだけ効く）
 * - `POST   /wiki/pages/:id/lock/takeover` 引き継ぐ（manager）
 * - `POST   /wiki/pages/:id/lock/request`  交代を申し出る（**読むだけの人も押せる**・§6-③）
 *
 * 引き継ぎ・申し出の通知は作りません。前の保持者は次のハートビートの応答
 * （`acquired: false`）で気づきます。
 *
 * ⚠️ **取れなかったことを例外にしません**（`acquired: false` を 200 で返す）。
 * 60秒ごとに呼ばれる口なので、他の人が編集中のあいだずっとエラーを返すと、
 * 画面のエラー表示が鳴り続けます。保存そのものは `PATCH /wiki/pages/:id` が
 * 409（`LOCKED`）で止めます。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { assertReadablePage } from '../services/wiki-access.service';
import {
  acquireWikiLock,
  releaseWikiLock,
  takeoverWikiLock,
  requestWikiLockHandoff,
} from '../services/wiki-lock.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('wiki', 'editor')] as const;
const canManage = [requireAuth, requirePermission('wiki', 'manager')] as const;

router.post('/pages/:id/lock', ...canEdit, wrap(async (req, res) => {
  const pageId = p1(req.params.id);
  await assertReadablePage(req.user!, pageId);
  const result = await acquireWikiLock(pageId, req.user!);
  res.json({ success: true, data: result });
}));

router.delete('/pages/:id/lock', ...canEdit, wrap(async (req, res) => {
  const pageId = p1(req.params.id);
  await assertReadablePage(req.user!, pageId);
  const lock = await releaseWikiLock(pageId, req.user!);
  res.json({ success: true, data: lock });
}));

router.post('/pages/:id/lock/takeover', ...canManage, wrap(async (req, res) => {
  const pageId = p1(req.params.id);
  await assertReadablePage(req.user!, pageId);
  const lock = await takeoverWikiLock(pageId, req.user!);
  res.json({ success: true, data: lock });
}));

/** 読むだけの人が「編集を代わってほしい」と伝える（§6-③ が名指しで reader の操作） */
router.post('/pages/:id/lock/request', ...canRead, wrap(async (req, res) => {
  const pageId = p1(req.params.id);
  await assertReadablePage(req.user!, pageId);
  const lock = await requestWikiLockHandoff(pageId, req.user!);
  res.json({ success: true, data: lock });
}));

export default router;
