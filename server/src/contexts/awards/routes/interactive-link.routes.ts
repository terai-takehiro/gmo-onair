/**
 * awards/routes/interactive-link.routes.ts
 *
 * Awards イベント単位の Interactive 連携 (設定の保存/取得 + 結果取り込み)。
 *
 *   GET    /awards/events/:id/interactive-link            設定の取得 (API キーはマスク)
 *   PUT    /awards/events/:id/interactive-link            設定の保存
 *   DELETE /awards/events/:id/interactive-link            連携解除
 *   GET    /awards/events/:id/interactive-link/preview    Interactive 側の問題一覧 (マッピング UI 用)
 *   POST   /awards/events/:id/interactive-link/ingest     設定済み mapping で結果取り込み実行
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { interactiveBridge, MappingEntry } from '../services/interactive-bridge.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(
  ['/events/:id/interactive-link', '/events/:id/interactive-link/preview', '/events/:id/interactive-link/ingest'],
  requireAuth,
  requirePermission('awards', 'editor'),
);

router.get(
  '/events/:id/interactive-link',
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'VALIDATION_ERROR', 'invalid event id');
    const data = await interactiveBridge.getLink(id);
    res.json({ data });
  }),
);

router.put(
  '/events/:id/interactive-link',
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'VALIDATION_ERROR', 'invalid event id');
    const body = req.body as {
      baseUrl?: string;
      apiKeySecret?: string;
      eventId?: string;
      mapping?: Record<string, MappingEntry>;
    };
    if (!body.eventId) throw new AppError(400, 'VALIDATION_ERROR', 'eventId は必須です');
    await interactiveBridge.saveLink(id, {
      baseUrl: body.baseUrl ?? '',
      apiKeySecret: body.apiKeySecret,
      eventId: body.eventId,
      mapping: body.mapping,
    });
    const data = await interactiveBridge.getLink(id);
    res.json({ data });
  }),
);

router.delete(
  '/events/:id/interactive-link',
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'VALIDATION_ERROR', 'invalid event id');
    await interactiveBridge.clearLink(id);
    res.json({ ok: true });
  }),
);

router.get(
  '/events/:id/interactive-link/preview',
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'VALIDATION_ERROR', 'invalid event id');
    const data = await interactiveBridge.previewQuestions(id);
    res.json({ data });
  }),
);

router.post(
  '/events/:id/interactive-link/ingest',
  wrap(async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(id)) throw new AppError(400, 'VALIDATION_ERROR', 'invalid event id');
    const result = await interactiveBridge.ingest(id);
    res.json({ data: result });
  }),
);

export default router;
