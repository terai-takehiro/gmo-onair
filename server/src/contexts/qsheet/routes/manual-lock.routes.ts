/**
 * 運営マニュアル 段E — 編集ロック（冊子まるごと・§6-2-1）＋ 確定・版（§6⑤・§10-3）。
 *
 * ロック4本（取る／放す／強制引き継ぎ／交代の申し出）は「プッシュ通知は作らない」
 * （設計判断・段Eの範囲外）——保持者側は次の60秒ハートビート（`POST …/lock` の応答）で
 * 引き継ぎ・申し出に気づく。書き込み系の実際の可否検査（ロック・確定状態）は
 * `manual.service.ts` の `assertEditable` が `updateManual`/`addPage`/`updatePage`/
 * `deletePage`/`reorderPages` の内部で行う——ここでは「取る／放す」操作そのものだけを扱う。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessManual } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import {
  getManualRaw,
  acquireManualLock,
  releaseManualLock,
  takeoverManualLock,
  requestManualLockHandoff,
  fixManual,
  unfixManual,
} from '../services/manual.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getManualRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('冊子が見つかりません');
  if (!(await canAccessManual(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('冊子が見つかりません'); // 存在秘匿
  }
}

/** 取る。**60秒ごとのハートビートも兼ねる**——保持者本人が呼べば locked_at を今に更新するだけ */
router.post('/manuals/:id/lock', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const result = await acquireManualLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: { acquired: result.acquired, manual: result.manual } });
}));

/** 放す。自分が保持者のときだけ */
router.delete('/manuals/:id/lock', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const manual = await releaseManualLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: manual });
}));

/** 強制的に引き継ぐ */
router.post('/manuals/:id/lock/takeover', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const manual = await takeoverManualLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: manual });
}));

/** 交代を申し出る */
router.post('/manuals/:id/lock/request', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const manual = await requestManualLockHandoff(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: manual });
}));

/** 確定する。全ページの全 kind:'linked' ブロックを凍らせ rev を +1 する */
router.post('/manuals/:id/fix', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const manual = await fixManual(p1(req.params.id), req.user!);
  res.json({ success: true, data: manual });
}));

/** 確定を解く。rev・frozen は変えない */
router.post('/manuals/:id/unfix', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const manual = await unfixManual(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: manual });
}));

export default router;
