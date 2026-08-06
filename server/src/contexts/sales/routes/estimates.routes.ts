/**
 * 見積 (v4 ⑥)。`/projects/:projectId/estimates` にぶら下がる。
 *
 * **書き込みは `sales` の editor 以上。** 見積は金額なので、閲覧だけの人が
 * 触れると出した額が変わってしまう。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { estimateService } from '../services/estimate.service';
import { AppError } from '../../../shared/middleware/errorHandler';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));

const canEdit = requirePermission('sales', 'editor');
const userOf = (req: Request) => (req as { user?: { id: string } }).user!.id;

// GET /projects/:projectId/estimates
router.get('/', wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  res.json({ success: true, data: await estimateService.listByProject(projectId) });
}));

// GET /projects/:projectId/estimates/:id — 明細つき
router.get('/:id', wrap(async (req, res) => {
  const est = await estimateService.getById((req.params as Record<string, string>).id);
  if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
  res.json({ success: true, data: est });
}));

// POST /projects/:projectId/estimates — 新しい見積 (v1)
router.post('/', canEdit, wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  const est = await estimateService.create(projectId, req.body, userOf(req));
  res.status(201).json({ success: true, data: est });
}));

// POST /projects/:projectId/estimates/:id/next-version — 前の版を写して版を上げる
router.post('/:id/next-version', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.status(201).json({ success: true, data: await estimateService.createNextVersion(id, userOf(req)) });
}));

// PUT /projects/:projectId/estimates/:id
router.put('/:id', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.json({ success: true, data: await estimateService.update(id, req.body, userOf(req)) });
}));

// PUT /projects/:projectId/estimates/:id/items — 明細をまとめて置き換える
router.put('/:id/items', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  res.json({ success: true, data: await estimateService.replaceItems(id, items) });
}));

// DELETE /projects/:projectId/estimates/:id
router.delete('/:id', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  await estimateService.remove(id, userOf(req));
  res.json({ success: true });
}));

export default router;
