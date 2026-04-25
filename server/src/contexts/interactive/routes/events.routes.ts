/**
 * interactive/routes/events.routes.ts — Phase 3 v2.6.8
 * SQL とドメイン処理は services/event.service.ts に集約。
 * このファイルは HTTP plumbing (auth + リクエスト分配 + レスポンス) のみ。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { eventService } from '../services/event.service';

const router = Router();

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('interactive'));

// イベント一覧
router.get('/', wrap(async (req, res) => {
  const rows = await eventService.list({
    search: String(req.query.search || '').trim(),
    status: String(req.query.status || ''),
  });
  res.json({ success: true, data: rows });
}));

// イベント詳細
router.get('/:id', wrap(async (req, res) => {
  res.json({ success: true, data: await eventService.getById(req.params.id as string) });
}));

// イベント作成
router.post('/', wrap(async (req, res) => {
  const row = await eventService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, data: row });
}));

// イベント更新
router.put('/:id', wrap(async (req, res) => {
  const row = await eventService.update(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: row });
}));

// リハーサル開始 (draft → rehearsal)
router.post('/:id/rehearsal', wrap(async (req, res) => {
  await eventService.startRehearsal(req.params.id as string);
  res.json({ success: true });
}));

// リハーサルリセット (rehearsal → draft, 統計クリア)
router.post('/:id/rehearsal-reset', wrap(async (req, res) => {
  await eventService.resetRehearsal(req.params.id as string);
  res.json({ success: true, message: 'リハーサルデータをリセットしました' });
}));

// 本番開始 (draft/rehearsal → live)
router.post('/:id/start', wrap(async (req, res) => {
  await eventService.start(req.params.id as string);
  res.json({ success: true });
}));

// 配信終了 (live → ended)
router.post('/:id/stop', wrap(async (req, res) => {
  await eventService.stop(req.params.id as string);
  res.json({ success: true });
}));

// 再利用 (ended → draft, 統計リセット)
router.post('/:id/reuse', wrap(async (req, res) => {
  await eventService.reuse(req.params.id as string);
  res.json({ success: true, message: 'イベントを再利用可能にしました' });
}));

// イベント削除 (soft delete)
router.delete('/:id', wrap(async (req, res) => {
  await eventService.delete(req.params.id as string);
  res.json({ success: true });
}));

// 統計
router.get('/:id/stats', wrap(async (req, res) => {
  res.json({ success: true, data: await eventService.getStats(req.params.id as string) });
}));

export default router;
