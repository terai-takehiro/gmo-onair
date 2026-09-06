/**
 * 旧⇄新の切替状態の API — 2026年10月の事業再編（§5）
 *
 * GET は認証さえあれば誰でも読める（移行センターに限らず、広く帯として出す
 * バナー表示の裏取りに使うことを見込んでいる）。状態・切替日の変更（PUT）は
 * `system_admin` だけ（切替は人の操作だけで行う・§8「Claude が自動で切り替える」対策）。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { getOrgTransition, updateOrgTransition } from '../services/org-transition.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

router.get('/', wrap(async (_req, res) => {
  res.json({ success: true, data: await getOrgTransition() });
}));

router.put('/', requireRole('system_admin'), wrap(async (req, res) => {
  // 検証は org-transition.service.ts 側。投げた AppError はそのまま errorHandler へ流す
  // （ここで捕まえて書き直さない）。
  const updated = await updateOrgTransition(req.body ?? {}, req.user!.id);
  res.json({ success: true, data: updated });
}));

export default router;
