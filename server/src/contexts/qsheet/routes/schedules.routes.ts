/**
 * スケジュール表 — 一覧・詳細・CRUD・共有。実装設計: 04-schedule-impl.md §4-1（A）
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { isQsheetAdmin, canAccessSchedule } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ForbiddenError } from '../services/httpErrors';
import {
  listSchedules, createSchedule, getScheduleRaw, getScheduleWithMeta,
  getScheduleColumns, getScheduleItems, updateSchedule, deleteSchedule, setShares,
} from '../services/schedule.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  const ok = await canAccessSchedule(req.user!, raw.id as string, (raw.created_by as string) ?? null);
  if (!ok) throw new NotFoundError('スケジュール表が見つかりません'); // 存在秘匿
  return raw;
}

router.get('/schedules', wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const rows = await listSchedules(req.user!, {
    date_from: q.date_from, date_to: q.date_to, project_id: q.project_id, program_id: q.program_id,
    location_id: q.location_id, status: q.status, search: q.search,
  });
  res.json({ success: true, data: rows });
}));

router.post('/schedules', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const row = await createSchedule({
    title: typeof b.title === 'string' ? b.title : '',
    serviceDate: String(b.service_date ?? ''),
    locationId: typeof b.location_id === 'string' ? b.location_id : null,
    projectId: typeof b.project_id === 'string' ? b.project_id : null,
    programId: typeof b.program_id === 'string' ? b.program_id : null,
    episodeId: typeof b.episode_id === 'string' ? b.episode_id : null,
    templateId: typeof b.template_id === 'string' ? b.template_id : null,
    onairStartMin: typeof b.onair_start_min === 'number' ? b.onair_start_min : null,
    createdBy: req.user!.id,
  });
  res.status(201).json({ success: true, data: row });
}));

router.get('/schedules/:id', wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const schedule = await getScheduleWithMeta(p1(req.params.id));
  if (!schedule) throw new NotFoundError('スケジュール表が見つかりません');
  const [columns, items] = await Promise.all([getScheduleColumns(p1(req.params.id)), getScheduleItems(p1(req.params.id))]);
  res.json({ success: true, data: { ...schedule, columns, items } });
}));

router.put('/schedules/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateSchedule(p1(req.params.id), req.user!.id, {
    title: typeof b.title === 'string' ? b.title : undefined,
    serviceDate: typeof b.service_date === 'string' ? b.service_date : undefined,
    locationId: 'location_id' in b ? (b.location_id as string | null) : undefined,
    projectId: 'project_id' in b ? (b.project_id as string | null) : undefined,
    programId: 'program_id' in b ? (b.program_id as string | null) : undefined,
    episodeId: 'episode_id' in b ? (b.episode_id as string | null) : undefined,
    viewStartMin: typeof b.view_start_min === 'number' ? b.view_start_min : undefined,
    viewEndMin: typeof b.view_end_min === 'number' ? b.view_end_min : undefined,
    slotMin: typeof b.slot_min === 'number' ? b.slot_min : undefined,
    status: typeof b.status === 'string' ? b.status : undefined,
    notes: 'notes' in b ? (b.notes as string | null) : undefined,
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.delete('/schedules/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await deleteSchedule(p1(req.params.id), req.user!);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

router.put('/schedules/:id/shares', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  if (!isQsheetAdmin(req.user!) && (raw.created_by as string) !== req.user!.id) {
    throw new ForbiddenError('共有設定を変更する権限がありません');
  }
  const count = await setShares(p1(req.params.id), (req.body as Record<string, unknown>).user_ids, req.user!.id);
  res.json({ success: true, data: { share_count: count } });
}));

export default router;
