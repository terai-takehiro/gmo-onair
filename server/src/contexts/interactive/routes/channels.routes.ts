/**
 * interactive/routes/channels.routes.ts — Phase 3 v2.6.9
 * SQL は services/channel.service.ts に集約。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { channelService } from '../services/channel.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('interactive'));

// チャンネル一覧
router.get('/events/:eventId/channels', wrap(async (req, res) => {
  res.json({ success: true, data: await channelService.listByEvent(req.params.eventId as string) });
}));

// チャンネル作成
router.post('/events/:eventId/channels', wrap(async (req, res) => {
  const row = await channelService.create(req.params.eventId as string, req.body);
  res.status(201).json({ success: true, data: row });
}));

// チャンネル更新
router.put('/channels/:id', wrap(async (req, res) => {
  const row = await channelService.update(req.params.id as string, req.body);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'チャンネルが見つかりません');
  res.json({ success: true, data: row });
}));

// チャンネル削除
router.delete('/channels/:id', wrap(async (req, res) => {
  await channelService.delete(req.params.id as string);
  res.json({ success: true });
}));

export default router;
