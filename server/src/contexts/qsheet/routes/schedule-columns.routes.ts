/**
 * スケジュール表の列 — CRUD ＋ 並べ替え。実装設計: 04-schedule-impl.md §4-1（B）・§4-3
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessSchedule } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import { getScheduleRaw } from '../services/schedule.service';
import { createColumn, updateColumn, deleteColumn, reorderColumns } from '../services/schedule-column.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  if (!(await canAccessSchedule(req.user!, raw.id as string, (raw.created_by as string) ?? null))) {
    throw new NotFoundError('スケジュール表が見つかりません');
  }
}

router.post('/schedules/:id/columns', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await createColumn(p1(req.params.id), {
    colGroup: String(b.col_group ?? ''),
    label: String(b.label ?? ''),
    roomId: typeof b.room_id === 'string' ? b.room_id : null,
    color: typeof b.color === 'string' ? b.color : null,
    sortOrder: typeof b.sort_order === 'number' ? b.sort_order : undefined,
  });
  res.status(201).json({ success: true, data: row });
}));

router.put('/schedules/:id/columns/reorder', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const order = (req.body as Record<string, unknown>).order;
  const rows = await reorderColumns(p1(req.params.id), Array.isArray(order) ? order as { id: string; col_group: string; sort_order: number }[] : []);
  res.json({ success: true, data: rows });
}));

router.put('/schedules/:id/columns/:columnId', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateColumn(p1(req.params.id), p1(req.params.columnId), req.user!.id, {
    label: typeof b.label === 'string' ? b.label : undefined,
    roomId: 'room_id' in b ? (b.room_id as string | null) : undefined,
    color: 'color' in b ? (b.color as string | null) : undefined,
    widthPx: typeof b.width_px === 'number' ? b.width_px : undefined,
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.delete('/schedules/:id/columns/:columnId', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const deletedItems = await deleteColumn(p1(req.params.id), p1(req.params.columnId));
  res.json({ success: true, data: { id: p1(req.params.columnId), deleted_items: deletedItems } });
}));

export default router;
