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
  getScheduleColumns, getScheduleItems, updateSchedule, deleteSchedule, getShares, setShares,
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
  // ⚠️ **キーを常に持つオブジェクトを組み立てないこと。** `updateSchedule`（schedule.service.ts）は
  // `'projectId' in input` で「送られたか」を判定するが、`{ projectId: 送られていれば値 : undefined }`
  // という形は**値が undefined でもキー自体は必ず存在する**ため常に true になり、location_id・
  // project_id・program_id・episode_id・notes を**指定しなかっただけで毎回 null に戻していた**
  // （2026-09-06・第2版計画の表の設定シートを実装するまで、この経路の呼び出し元が無く
  // 誰も踏んでいなかった）。スプレッドで「送られたときだけキーを足す」形にする。
  const row = await updateSchedule(p1(req.params.id), req.user!.id, {
    ...(typeof b.title === 'string' ? { title: b.title } : {}),
    ...(typeof b.service_date === 'string' ? { serviceDate: b.service_date } : {}),
    ...('location_id' in b ? { locationId: b.location_id as string | null } : {}),
    ...('project_id' in b ? { projectId: b.project_id as string | null } : {}),
    ...('program_id' in b ? { programId: b.program_id as string | null } : {}),
    ...('episode_id' in b ? { episodeId: b.episode_id as string | null } : {}),
    ...(typeof b.view_start_min === 'number' ? { viewStartMin: b.view_start_min } : {}),
    ...(typeof b.view_end_min === 'number' ? { viewEndMin: b.view_end_min } : {}),
    ...(typeof b.slot_min === 'number' ? { slotMin: b.slot_min } : {}),
    ...(typeof b.status === 'string' ? { status: b.status } : {}),
    ...('notes' in b ? { notes: b.notes as string | null } : {}),
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.delete('/schedules/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await deleteSchedule(p1(req.params.id), req.user!);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

// 共有設定を見る／変えるのは 作成者 または 管理者のみ（`documents.routes.ts` の共有 API と同じ作法）。
// **案件メンバーはここには写らない**（§3-2 は動的判定。ここは「ほかに見せる人」の明示共有だけ）
async function requireShareManager(req: Request) {
  const raw = await getScheduleRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('スケジュール表が見つかりません');
  if (!isQsheetAdmin(req.user!) && (raw.created_by as string) !== req.user!.id) {
    throw new ForbiddenError('共有設定を変更する権限がありません');
  }
}

router.get('/schedules/:id/shares', wrap(async (req: Request, res: Response) => {
  await requireShareManager(req);
  const rows = await getShares(p1(req.params.id));
  res.json({ success: true, data: rows });
}));

router.put('/schedules/:id/shares', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireShareManager(req);
  const count = await setShares(p1(req.params.id), (req.body as Record<string, unknown>).user_ids, req.user!.id);
  const rows = await getShares(p1(req.params.id));
  res.json({ success: true, data: { share_count: count, shares: rows } });
}));

export default router;
