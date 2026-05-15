import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { taskColumnsService } from '../services/task-columns.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));

// GET /projects/:projectId/task-columns
router.get('/', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const columns = await taskColumnsService.listForProject(projectId);
  res.json({ success: true, data: columns });
}));

// POST /projects/:projectId/task-columns
router.post('/', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  const column = await taskColumnsService.create(projectId, req.body, userId);
  res.status(201).json({ success: true, data: column });
}));

// POST /projects/:projectId/task-columns/from-template
router.post('/from-template', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const { template_id } = req.body as { template_id: string };
  const userId = (req as { user?: { id: string } }).user!.id;
  const columns = await taskColumnsService.fromTemplate(projectId, template_id, userId);
  res.status(201).json({ success: true, data: columns });
}));

// PATCH /projects/:projectId/task-columns/reorder
router.patch('/reorder', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  await taskColumnsService.reorder(projectId, req.body, userId);
  res.json({ success: true });
}));

// PUT /projects/:projectId/task-columns/:id
router.put('/:id', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  const column = await taskColumnsService.update(id, req.body, userId);
  res.json({ success: true, data: column });
}));

// DELETE /projects/:projectId/task-columns/:id
router.delete('/:id', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  await taskColumnsService.delete(id, userId);
  res.json({ success: true });
}));

export default router;
