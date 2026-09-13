/**
 * 会場図面（`qsheet_venue_layouts`）— 一覧・詳細・CRUD・複製・確定/版・編集ロック。
 * 設計: docs/design/v4/venue-layout.md §5-4（API）・§5-5（権限）・§5-6（編集ロック）。
 * 実装パターンは manuals.routes.ts / manual-lock.routes.ts をそのまま踏襲する。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessVenueLayout, canAssignVenueLayoutProject } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import {
  listVenueLayouts,
  getVenueLayoutRaw,
  getVenueLayoutDetail,
  createVenueLayout,
  updateVenueLayout,
  updateVenueItems,
  copyVenueLayout,
  deleteVenueLayout,
  fixVenueLayout,
  unfixVenueLayout,
  acquireVenueLayoutLock,
  releaseVenueLayoutLock,
  takeoverVenueLayoutLock,
  requestVenueLayoutLockHandoff,
} from '../services/venue-layout.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

/** `manuals.routes.ts` の `requireAccessible` と同じ形（存在秘匿の404）。§5-5 */
async function requireAccessible(req: Request) {
  const raw = await getVenueLayoutRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('図面が見つかりません');
  const ok = await canAccessVenueLayout(req.user!, raw.id as string, (raw.created_by as string) ?? null);
  if (!ok) throw new NotFoundError('図面が見つかりません'); // 存在秘匿
  return raw;
}

router.get('/venue-layouts', wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const rows = await listVenueLayouts(req.user!, { project_id: q.project, program_id: q.program });
  res.json({ success: true, data: rows });
}));

router.post('/venue-layouts', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const projectId = typeof b.project_id === 'string' ? b.project_id : null;
  const programId = typeof b.program_id === 'string' ? b.program_id : null;
  // なりすまし防止（`manuals.routes.ts` の POST /manuals と同じ関所）。存在秘匿のため 404
  if (projectId && !(await canAssignVenueLayoutProject(req.user!, projectId))) {
    throw new NotFoundError('案件が見つかりません');
  }
  const floorId = typeof b.floor_id === 'string' ? b.floor_id : '';
  if (!floorId) throw new ValidationError('floor_id を指定してください');
  const row = await createVenueLayout({
    title: typeof b.title === 'string' ? b.title : '',
    projectId,
    programId,
    floorId,
    areaId: typeof b.area_id === 'string' ? b.area_id : null,
    planLabel: typeof b.plan_label === 'string' ? b.plan_label : null,
    createdBy: req.user!.id,
    // ひな形（既定）は copy_from 無し＝空の items。§6①「ひな形／前の図面を複製」
    copyFromLayoutId: typeof b.copy_from === 'string' ? b.copy_from : null,
  });
  res.status(201).json({ success: true, data: row });
}));

router.get('/venue-layouts/:id', wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await getVenueLayoutDetail(p1(req.params.id));
  if (!row) throw new NotFoundError('図面が見つかりません');
  res.json({ success: true, data: row });
}));

router.patch('/venue-layouts/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateVenueLayout(p1(req.params.id), req.user!.id, {
    ...(typeof b.title === 'string' ? { title: b.title } : {}),
    ...('plan_label' in b ? { planLabel: typeof b.plan_label === 'string' ? b.plan_label : null } : {}),
    ...('area_id' in b ? { areaId: typeof b.area_id === 'string' ? b.area_id : null } : {}),
    ...(typeof b.status === 'string' ? { status: b.status as 'draft' | 'fixed' | 'archived' } : {}),
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

/** 品目の丸ごと置換。`expected_updated_at` 必須（§5-4）。編集ロックを持っている本人かの
 *  確認は `updateVenueItems` の内部（`assertHoldsVenueLayoutLock`）で行う。 */
router.put('/venue-layouts/:id/items', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateVenueItems(p1(req.params.id), req.user!.id, {
    items: Array.isArray(b.items) ? b.items : [],
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.post('/venue-layouts/:id/copy', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await copyVenueLayout(p1(req.params.id), req.user!.id, {
    ...(typeof b.title === 'string' ? { title: b.title } : {}),
    ...('plan_label' in b ? { planLabel: typeof b.plan_label === 'string' ? b.plan_label : null } : {}),
  });
  res.status(201).json({ success: true, data: row });
}));

router.delete('/venue-layouts/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  await deleteVenueLayout(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

/** 確定する（manager・rev+1）。§5-6・§14 #8 */
router.post('/venue-layouts/:id/fix', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await fixVenueLayout(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

/** 確定を解く（manager）。rev は据え置き */
router.post('/venue-layouts/:id/unfix', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await unfixVenueLayout(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

/** 取る。**60秒ごとのハートビートも兼ねる**——保持者本人が呼べば locked_at を今に更新するだけ */
router.post('/venue-layouts/:id/lock', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const result = await acquireVenueLayoutLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: { acquired: result.acquired, layout: result.layout } });
}));

/** 放す。自分が保持者のときだけ */
router.delete('/venue-layouts/:id/lock', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const layout = await releaseVenueLayoutLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: layout });
}));

/** 交代を申し出る */
router.post('/venue-layouts/:id/lock/request', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const layout = await requestVenueLayoutLockHandoff(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: layout });
}));

/** 強制的に引き継ぐ（manager） */
router.post('/venue-layouts/:id/lock/takeover', requirePermission('qsheet', 'manager'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const layout = await takeoverVenueLayoutLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: layout });
}));

export default router;
