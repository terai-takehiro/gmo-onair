import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { projectTasksService } from '../services/project-tasks.service';

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));

// GET /projects/:projectId/tasks
router.get('/', async (req, res) => {
  const { projectId } = req.params;
  const episodeId = req.query.episode_id !== undefined
    ? (req.query.episode_id as string) || null
    : undefined;
  const columnId = req.query.column_id as string | undefined;

  const tasks = await projectTasksService.list(projectId, { episodeId, columnId });
  res.json({ success: true, data: tasks });
});

// POST /projects/:projectId/tasks
router.post('/', async (req, res) => {
  const { projectId } = req.params;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.create(projectId, req.body, userId);
  res.status(201).json({ success: true, data: task });
});

// PUT /projects/:projectId/tasks/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.update(id, req.body, userId);
  res.json({ success: true, data: task });
});

// PATCH /projects/:projectId/tasks/:id/complete
router.patch('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const userId = (req as { user?: { id: string } }).user!.id;
  const task = await projectTasksService.toggleComplete(id, userId);
  res.json({ success: true, data: task });
});

// PATCH /projects/:projectId/tasks/:id/move
router.patch('/:id/move', async (req, res) => {
  const { id } = req.params;
  const { column_id, sort_order } = req.body as { column_id: string | null; sort_order: number };
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.move(id, column_id, sort_order, userId);
  res.json({ success: true });
});

// PATCH /projects/:projectId/tasks/reorder
router.patch('/reorder', async (req, res) => {
  const { projectId } = req.params;
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.reorder(projectId, req.body, userId);
  res.json({ success: true });
});

// DELETE /projects/:projectId/tasks/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = (req as { user?: { id: string } }).user!.id;
  await projectTasksService.delete(id, userId);
  res.json({ success: true });
});

export default router;
