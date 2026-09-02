import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { projectTasksService } from '../services/project-tasks.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));

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

// ---- タスク依存関係 (先行 → 後続) — /:id より前に定義 ----
// GET /projects/:projectId/tasks/dependencies
router.get('/dependencies', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const deps = await projectTasksService.listDependencies(projectId);
  res.json({ success: true, data: deps });
}));

// POST /projects/:projectId/tasks/dependencies
router.post('/dependencies', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  const { predecessor_id, successor_id } = req.body as { predecessor_id: string; successor_id: string };
  const dep = await projectTasksService.addDependency(projectId, predecessor_id, successor_id, userId);
  res.status(201).json({ success: true, data: dep });
}));

// DELETE /projects/:projectId/tasks/dependencies/:id
router.delete('/dependencies/:id', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  await projectTasksService.removeDependency(id);
  res.json({ success: true });
}));

// GET /projects/:projectId/tasks
router.get('/', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const episodeId = req.query.episode_id !== undefined
    ? (req.query.episode_id as string) || null
    : undefined;
  const columnId = req.query.column_id as string | undefined;

  const tasks = await projectTasksService.list(projectId, { episodeId, columnId });
  res.json({ success: true, data: tasks });
}));

// POST /projects/:projectId/tasks
router.post('/', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.create(projectId, req.body, userId);
  res.status(201).json({ success: true, data: task });
}));

// PUT /projects/:projectId/tasks/:id
router.put('/:id', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.update(id, req.body, userId);
  res.json({ success: true, data: task });
}));

// PATCH /projects/:projectId/tasks/:id/complete
router.patch('/:id/complete', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.toggleComplete(id, userId);
  res.json({ success: true, data: task });
}));

// PATCH /projects/:projectId/tasks/:id/move
router.patch('/:id/move', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const { column_id, sort_order } = req.body as { column_id: string | null; sort_order: number };
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.move(id, column_id, sort_order, userId);
  res.json({ success: true });
}));

// PATCH /projects/:projectId/tasks/reorder
router.patch('/reorder', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.reorder(projectId, normalizeReorderItems(req.body), userId);
  res.json({ success: true });
}));

// DELETE /projects/:projectId/tasks/:id
router.delete('/:id', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.delete(id, userId);
  res.json({ success: true });
}));

export default router;
