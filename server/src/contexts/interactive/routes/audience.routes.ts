/**
 * interactive/routes/audience.routes.ts — Phase 3 v2.6.9
 * 視聴者向けエンドポイント (認証不要 — QR からアクセス)。
 * SQL + ロジックは services/audience.service.ts に集約。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { audienceService } from '../services/audience.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// 注意: 全て認証不要（QRコードからアクセス）

// イベント情報取得 (視聴者向け)
router.get('/events/:id', wrap(async (req, res) => {
  const data = await audienceService.getEventForAudience(
    req.params.id as string,
    req.query.ch as string | undefined,
  );
  res.json({ success: true, data });
}));

// セッション作成
router.post('/events/:id/join', wrap(async (req, res) => {
  const data = await audienceService.join(
    req.params.id as string,
    String(req.headers['user-agent'] || ''),
  );
  res.status(201).json({ success: true, data });
}));

// スタンプ送信 (HTTP fallback)
router.post('/events/:id/stamp', wrap(async (req, res) => {
  await audienceService.sendStamp(req.params.id as string, req.body?.stamp_id);
  res.json({ success: true });
}));

// QR コード (img タグから直接表示)
router.get('/events/:id/qr', wrap(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const svg = await audienceService.generateQrSvg(clientUrl, req.params.id as string);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
}));

router.get('/events/:id/channels/:channelId/qr', wrap(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const svg = await audienceService.generateQrSvg(
    clientUrl,
    req.params.id as string,
    req.params.channelId as string,
  );
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
}));

export default router;
