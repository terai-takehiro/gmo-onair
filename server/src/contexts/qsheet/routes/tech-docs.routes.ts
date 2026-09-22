/**
 * 技術資料（`qsheet_tech_docs`）— 一覧・詳細・CRUD・複製・行（映像パッチ／技術スタッフ）・
 * 確定/版・編集ロック。設計: docs/design/v4/tech-docs.md §5-4（権限）・§5-5（API）。
 * 実装パターンは `venue-layouts.routes.ts` をそのまま踏襲する。
 *
 * 権限（§5-4）: ルーター全体が `requireAuth, requirePermission('qsheet')`（= reader 以上）。
 * 書き込みは `'editor'`、確定/確定解除・ロックの強制引き継ぎは `'manager'`。
 * 行の可視性は `canAccessTechDoc`——見えない資料は **404**（存在秘匿）。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessTechDoc, canAssignTechDocProject } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import {
  listTechDocs,
  getTechDocRaw,
  getTechDocDetail,
  createTechDoc,
  updateTechDoc,
  deleteTechDoc,
  fixTechDoc,
  unfixTechDoc,
  acquireTechDocLock,
  releaseTechDocLock,
  requestTechDocLockHandoff,
  takeoverTechDocLock,
  createPatchRow,
  updatePatchRow,
  deletePatchRow,
  reorderPatchRows,
  createStaffRow,
  updateStaffRow,
  deleteStaffRow,
  reorderStaffRows,
} from '../services/tech-doc.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

const editor = requirePermission('qsheet', 'editor');
const manager = requirePermission('qsheet', 'manager');

/** `venue-layouts.routes.ts` の `requireAccessible` と同じ形（存在秘匿の404） */
async function requireAccessible(req: Request) {
  const raw = await getTechDocRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('技術資料が見つかりません');
  const ok = await canAccessTechDoc(req.user!, raw.id as string, (raw.created_by as string) ?? null);
  if (!ok) throw new NotFoundError('技術資料が見つかりません'); // 存在秘匿
  return raw;
}

function orderOf(body: unknown): string[] {
  const order = (body as Record<string, unknown>)?.order;
  if (!Array.isArray(order) || order.some((x) => typeof x !== 'string')) {
    throw new ValidationError('order（id の配列）を指定してください');
  }
  return order as string[];
}

// ── 資料 ─────────────────────────────────────────────────

router.get('/tech-docs', wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const rows = await listTechDocs(req.user!, { project: q.project, program_id: q.program });
  res.json({ success: true, data: rows });
}));

router.post('/tech-docs', editor, wrap(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const projectId = typeof b.project_id === 'string' ? b.project_id : null;
  const programId = typeof b.program_id === 'string' ? b.program_id : null;
  // なりすまし防止（`venue-layouts.routes.ts` の POST と同じ関所）。存在秘匿のため 404
  if (projectId && !(await canAssignTechDocProject(req.user!, projectId))) {
    throw new NotFoundError('案件が見つかりません');
  }
  const copyFrom = typeof b.copy_from === 'string' ? b.copy_from : null;
  // 複製元は「自分が見られる資料」だけ（IDOR 対策。venue の copy_from と同じ検査）
  if (copyFrom) {
    const source = await getTechDocRaw(copyFrom);
    if (!source) throw new NotFoundError('複製元の技術資料が見つかりません');
    const canRead = await canAccessTechDoc(req.user!, source.id as string, (source.created_by as string) ?? null);
    if (!canRead) throw new NotFoundError('複製元の技術資料が見つかりません');
  }
  const row = await createTechDoc({
    title: typeof b.title === 'string' ? b.title : '',
    projectId,
    programId,
    createdBy: req.user!.id,
    copyFrom,
  });
  res.status(201).json({ success: true, data: row });
}));

router.get('/tech-docs/:id', wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const detail = await getTechDocDetail(p1(req.params.id));
  if (!detail) throw new NotFoundError('技術資料が見つかりません');
  res.json({ success: true, data: detail });
}));

router.patch('/tech-docs/:id', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateTechDoc(p1(req.params.id), req.user!.id, {
    ...(typeof b.title === 'string' ? { title: b.title } : {}),
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.delete('/tech-docs/:id', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  await deleteTechDoc(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

// ── 映像パッチの行 ───────────────────────────────────────
// 行の書き込みは親の資料の updated_at も進めるので、応答に `doc_updated_at` を添える
// （`TechRowMutationResponse`。削除も 204 ではなく `{ data: { id } }` を返す）

router.post('/tech-docs/:id/patch-rows', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await createPatchRow(p1(req.params.id), req.user!.id, req.body as Record<string, unknown>);
  res.status(201).json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

/** 並べ替え（`{ order: string[] }`）。`/:rowId` とは別の道なので取り合いにならない */
router.patch('/tech-docs/:id/patch-rows', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await reorderPatchRows(p1(req.params.id), req.user!.id, orderOf(req.body));
  res.json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

router.patch('/tech-docs/:id/patch-rows/:rowId', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await updatePatchRow(p1(req.params.id), p1(req.params.rowId), req.user!.id, req.body as Record<string, unknown>);
  res.json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

router.delete('/tech-docs/:id/patch-rows/:rowId', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await deletePatchRow(p1(req.params.id), p1(req.params.rowId), req.user!.id);
  res.json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

// ── 技術スタッフの行 ─────────────────────────────────────

router.post('/tech-docs/:id/staff-rows', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await createStaffRow(p1(req.params.id), req.user!.id, req.body as Record<string, unknown>);
  res.status(201).json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

router.patch('/tech-docs/:id/staff-rows', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await reorderStaffRows(p1(req.params.id), req.user!.id, orderOf(req.body));
  res.json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

router.patch('/tech-docs/:id/staff-rows/:rowId', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await updateStaffRow(p1(req.params.id), p1(req.params.rowId), req.user!.id, req.body as Record<string, unknown>);
  res.json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

router.delete('/tech-docs/:id/staff-rows/:rowId', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const r = await deleteStaffRow(p1(req.params.id), p1(req.params.rowId), req.user!.id);
  res.json({ success: true, data: r.data, doc_updated_at: r.doc_updated_at });
}));

// ── 確定・版（manager） ──────────────────────────────────

router.post('/tech-docs/:id/fix', manager, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await fixTechDoc(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

router.post('/tech-docs/:id/unfix', manager, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await unfixTechDoc(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

// ── 編集ロック（§5-4。10分で自動解除・60秒のハートビートを兼ねる） ──

router.post('/tech-docs/:id/lock', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await acquireTechDocLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

router.delete('/tech-docs/:id/lock', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await releaseTechDocLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

router.post('/tech-docs/:id/lock/request', editor, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await requestTechDocLockHandoff(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

router.post('/tech-docs/:id/lock/takeover', manager, wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const row = await takeoverTechDocLock(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: row });
}));

export default router;
