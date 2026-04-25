/**
 * interactive/routes/stamps.routes.ts — Phase 3 v2.6.9
 * SQL は services/stamp.service.ts に集約。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { stampService } from '../services/stamp.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('interactive'));

// スタンプ作成
router.post('/', wrap(async (req, res) => {
  const row = await stampService.create(req.body);
  res.status(201).json({ success: true, data: row });
}));

// スタンプ更新
router.put('/:id', wrap(async (req, res) => {
  const row = await stampService.update(req.params.id as string, req.body);
  res.json({ success: true, data: row });
}));

// スタンプ削除
router.delete('/:id', wrap(async (req, res) => {
  await stampService.delete(req.params.id as string);
  res.json({ success: true });
}));

// 並び替え
router.put('/event/:eventId/reorder', wrap(async (req, res) => {
  const rows = await stampService.reorder(req.params.eventId as string, req.body?.order);
  res.json({ success: true, data: rows });
}));

export default router;
