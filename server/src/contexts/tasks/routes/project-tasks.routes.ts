import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { projectTasksService } from '../services/project-tasks.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));
// 書き込みは editor 以上 (v3.1.0)。
//
// v3.0.11 まで router.use の `requirePermission('sales')` だけが掛かっており、
// これは既定で **minLevel='reader'** なので、**「見るだけ」の権限で タスクを
// 作成・変更・削除できた**。サーバー側の他の 74 箇所は書き込みに
// `requirePermission('...', 'editor')` を明示しているので、ここだけが抜けていた。
// 削除も editor にする (毎日の操作なので manager では現場が止まる)。

// ---- タスク依存関係 (先行 → 後続) — /:id より前に定義 ----
// GET /projects/:projectId/tasks/dependencies
router.get('/dependencies', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const deps = await projectTasksService.listDependencies(projectId);
  res.json({ success: true, data: deps });
}));

// POST /projects/:projectId/tasks/dependencies
router.post('/dependencies', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  const { predecessor_id, successor_id } = req.body as { predecessor_id: string; successor_id: string };
  const dep = await projectTasksService.addDependency(projectId, predecessor_id, successor_id, userId);
  res.status(201).json({ success: true, data: dep });
}));

// DELETE /projects/:projectId/tasks/dependencies/:id
router.delete('/dependencies/:id', requirePermission('sales', 'editor'), wrap(async (req, res) => {
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
router.post('/', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.create(projectId, req.body, userId);
  res.status(201).json({ success: true, data: task });
}));

// PUT /projects/:projectId/tasks/:id
router.put('/:id', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.update(id, req.body, userId);
  res.json({ success: true, data: task });
}));

// PATCH /projects/:projectId/tasks/:id/complete
router.patch('/:id/complete', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.toggleComplete(id, userId);
  res.json({ success: true, data: task });
}));

// PATCH /projects/:projectId/tasks/:id/move
router.patch('/:id/move', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const { column_id, sort_order } = req.body as { column_id: string | null; sort_order: number };
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.move(id, column_id, sort_order, userId);
  res.json({ success: true });
}));

// PATCH /projects/:projectId/tasks/reorder
router.patch('/reorder', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.reorder(projectId, req.body, userId);
  res.json({ success: true });
}));

// DELETE /projects/:projectId/tasks/:id
router.delete('/:id', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.delete(id, userId);
  res.json({ success: true });
}));

export default router;
