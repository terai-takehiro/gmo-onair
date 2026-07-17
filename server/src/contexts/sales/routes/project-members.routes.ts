import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { projectMembersService } from '../services/project-members.service';

// プロジェクト担当メンバー (複数担当・外部の方対応) のルート。
// マウント: /projects (sales/index.ts) → /projects/:projectId/members/...

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const uid = (req: Request) => (req as { user?: { id: string } }).user!.id;

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET /projects/:projectId/members
router.get('/:projectId/members', requirePermission('sales'), wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  const members = await projectMembersService.list(projectId);
  res.json({ success: true, data: members });
}));

// POST /projects/:projectId/members
router.post('/:projectId/members', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  const member = await projectMembersService.add(projectId, req.body, uid(req));
  res.status(201).json({ success: true, data: member });
}));

// PATCH /projects/:projectId/members/reorder
router.patch('/:projectId/members/reorder', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  await projectMembersService.reorder(projectId, req.body, uid(req));
  res.json({ success: true });
}));

// PUT /projects/:projectId/members/:memberId
router.put('/:projectId/members/:memberId', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { memberId } = req.params as Record<string, string>;
  const member = await projectMembersService.update(memberId, req.body, uid(req));
  res.json({ success: true, data: member });
}));

// DELETE /projects/:projectId/members/:memberId
router.delete('/:projectId/members/:memberId', requirePermission('sales', 'editor'), wrap(async (req, res) => {
  const { memberId } = req.params as Record<string, string>;
  await projectMembersService.remove(memberId, uid(req));
  res.json({ success: true });
}));

export default router;
