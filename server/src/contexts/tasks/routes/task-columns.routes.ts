import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { taskColumnsService } from '../services/task-columns.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));
// 書き込みは editor 以上 (v3.1.0)。
//
// v3.0.11 まで router.use の `requirePermission('sales')` だけが掛かっており、
// これは既定で **minLevel='reader'** なので、**「見るだけ」の権限で かんばんの列を
// 作成・変更・削除できた**。サーバー側の他の 74 箇所は書き込みに
// `requirePermission('...', 'editor')` を明示しているので、ここだけが抜けていた。
// 削除も editor にする (毎日の操作なので manager では現場が止まる)。

// GET /projects/:projectId/task-columns
router.get('/', wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const columns = await taskColumnsService.listForProject(projectId);
  res.json({ success: true, data: columns });
}));

// POST /projects/:projectId/task-columns
router.post('/', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  const column = await taskColumnsService.create(projectId, req.body, userId);
  res.status(201).json({ success: true, data: column });
}));

// POST /projects/:projectId/task-columns/from-template
router.post('/from-template', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const { template_id } = req.body as { template_id: string };
  const userId = (req as { user?: { id: string } }).user!.id;
  const columns = await taskColumnsService.fromTemplate(projectId, template_id, userId);
  res.status(201).json({ success: true, data: columns });
}));

// PATCH /projects/:projectId/task-columns/reorder
router.patch('/reorder', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const projectId = (req.params as Record<string, string>).projectId;
  const userId = (req as { user?: { id: string } }).user!.id;
  await taskColumnsService.reorder(projectId, req.body, userId);
  res.json({ success: true });
}));

// PUT /projects/:projectId/task-columns/:id
router.put('/:id', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  const column = await taskColumnsService.update(id, req.body, userId);
  res.json({ success: true, data: column });
}));

// DELETE /projects/:projectId/task-columns/:id
router.delete('/:id', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const userId = (req as { user?: { id: string } }).user!.id;
  await taskColumnsService.delete(id, userId);
  res.json({ success: true });
}));

export default router;
