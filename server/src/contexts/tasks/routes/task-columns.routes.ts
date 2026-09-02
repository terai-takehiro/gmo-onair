import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { taskColumnsService } from '../services/task-columns.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));
// 書き込みは editor 以上（project-tasks / project-members の書き込みルートと同じ判断。
// router 既定の reader のままだと、閲覧のみのユーザーが共有ボードの列を消せてしまう）
const canEdit = requirePermission('sales', 'editor');

/**
 * 並び替えの本文を `{id, sort_order}` の配列に正規化する（`gpm/index.ts` の
 * members/reorder と同じ確認）。素通しすると配列でない本文で TypeError の 500 になり、
 * 形が崩れた行は UPDATE の WHERE に渡って 0件更新のまま成功を返す。
 */
const normalizeReorderItems = (body: unknown): Array<{ id: string; sort_order: number }> => {
  const raw = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown[] } | null)?.items)
      ? (body as { items: unknown[] }).items
      : [];
  return raw
    .filter((it: unknown): it is { id: string; sort_order: number } => {
      const r = it as Record<string, unknown>;
      return !!r && typeof r.id === 'string' && r.id.length > 0 && Number.isFinite(Number(r.sort_order));
    })
    .map((it) => ({ id: it.id, sort_order: Number(it.sort_order) }));
};

// GET /projects/:projectId/task-columns
router.get('/', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const columns = await taskColumnsService.listForProject(projectId);
  res.json({ success: true, data: columns });
}));

// POST /projects/:projectId/task-columns
router.post('/', canEdit, wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  const column = await taskColumnsService.create(projectId, req.body, userId);
  res.status(201).json({ success: true, data: column });
}));

// POST /projects/:projectId/task-columns/from-template
router.post('/from-template', canEdit, wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const { template_id } = req.body as { template_id: string };
  const userId = (req as { user?: { id: string } }).user!.id;
  const columns = await taskColumnsService.fromTemplate(projectId, template_id, userId);
  res.status(201).json({ success: true, data: columns });
}));

// PATCH /projects/:projectId/task-columns/reorder
router.patch('/reorder', canEdit, wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  await taskColumnsService.reorder(projectId, normalizeReorderItems(req.body), userId);
  res.json({ success: true });
}));

// PUT /projects/:projectId/task-columns/:id
router.put('/:id', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  const column = await taskColumnsService.update(id, req.body, userId);
  res.json({ success: true, data: column });
}));

// DELETE /projects/:projectId/task-columns/:id
router.delete('/:id', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  await taskColumnsService.delete(id, userId);
  res.json({ success: true });
}));

export default router;
