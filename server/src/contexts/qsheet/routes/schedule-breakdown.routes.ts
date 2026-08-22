/**
 * ブレイクダウン（数だけ返す）。実装設計: 04-schedule-impl.md §4-6
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessSchedule } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import { getScheduleRaw } from '../services/schedule.service';
import { getBreakdown } from '../services/schedule-breakdown.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

router.get('/schedules/:id/breakdown', wrap(async (req: Request, res: Response) => {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  if (!(await canAccessSchedule(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('スケジュール表が見つかりません');
  }
  res.json({ success: true, data: await getBreakdown(p1(req.params.id)) });
}));

export default router;
