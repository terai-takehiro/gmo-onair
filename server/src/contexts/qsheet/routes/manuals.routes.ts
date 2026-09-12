/**
 * 運営マニュアル — 一覧・詳細・CRUD。段A（production-manual.md §5〜§6）。
 * 実装パターンは schedules.routes.ts をそのまま踏襲する。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessManual } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import {
  listManuals, createManual, getManualRaw, getManualWithMeta, getManualPages, updateManual, deleteManual,
} from '../services/manual.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getManualRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('冊子が見つかりません');
  const ok = await canAccessManual(req.user!, raw.id as string, (raw.created_by as string) ?? null);
  if (!ok) throw new NotFoundError('冊子が見つかりません'); // 存在秘匿
  return raw;
}

router.get('/manuals', wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const rows = await listManuals(req.user!, {
    project_id: q.project_id, program_id: q.program_id, status: q.status, search: q.search,
  });
  res.json({ success: true, data: rows });
}));

router.post('/manuals', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const row = await createManual({
    title: typeof b.title === 'string' ? b.title : '',
    projectId: typeof b.project_id === 'string' ? b.project_id : null,
    programId: typeof b.program_id === 'string' ? b.program_id : null,
    createdBy: req.user!.id,
    // ひな形／前回の冊子からの複製（段E）。どちらも省略可（今までどおり空ページ1枚）
    templateId: typeof b.template_id === 'string' ? b.template_id : null,
    copyFromManualId: typeof b.copy_from_manual_id === 'string' ? b.copy_from_manual_id : null,
  });
  res.status(201).json({ success: true, data: row });
}));

router.get('/manuals/:id', wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const manual = await getManualWithMeta(p1(req.params.id));
  if (!manual) throw new NotFoundError('冊子が見つかりません');
  const pages = await getManualPages(p1(req.params.id));
  res.json({ success: true, data: { ...manual, pages } });
}));

router.patch('/manuals/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  const b = req.body as Record<string, unknown>;
  const row = await updateManual(p1(req.params.id), req.user!.id, {
    ...(typeof b.title === 'string' ? { title: b.title } : {}),
    expectedUpdatedAt: b.expected_updated_at,
  });
  res.json({ success: true, data: row });
}));

router.delete('/manuals/:id', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  await requireAccessible(req);
  await deleteManual(p1(req.params.id), req.user!.id);
  res.json({ success: true, data: { id: p1(req.params.id) } });
}));

export default router;
