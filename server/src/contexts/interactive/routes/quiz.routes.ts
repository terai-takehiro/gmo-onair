/**
 * interactive/routes/quiz.routes.ts — Phase 3 v2.6.9
 * SQL とドメインロジックは services/question.service.ts に集約。
 * Socket.IO 通知 (io.emit) は WS インフラなので routes に残す。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { questionService } from '../services/question.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// io 取得ヘルパー
function getIo(req: Request): unknown {
  return (req as unknown as { app: { get: (k: string) => unknown } }).app?.get('io');
}

// ============================================================
// 管理者API (認証 + interactive権限)
// ============================================================

router.get(
  '/events/:eventId/questions',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    res.json({ success: true, data: await questionService.listByEvent(req.params.eventId as string) });
  }),
);

router.post(
  '/events/:eventId/questions',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    const row = await questionService.create(req.params.eventId as string, req.body);
    res.status(201).json({ success: true, data: row });
  }),
);

router.delete(
  '/questions/:id',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    await questionService.delete(req.params.id as string);
    res.json({ success: true });
  }),
);

router.post(
  '/questions/:id/activate',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    const { eventId, texts } = await questionService.activate(req.params.id as string);
    const io = getIo(req) as { of: (n: string) => { to: (r: string) => { emit: (e: string, p: unknown) => void } } } | undefined;
    if (io) {
      io.of('/interactive').to(`event:${eventId}`).emit('question:active', { questionId: req.params.id, texts });
    }
    res.json({ success: true });
  }),
);

// 締切（回答受付終了のみ — 結果はまだ非公開）
router.post(
  '/questions/:id/close',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    const { eventId } = await questionService.close(req.params.id as string);
    const io = getIo(req) as { of: (n: string) => { to: (r: string) => { emit: (e: string, p: unknown) => void } } } | undefined;
    if (io) {
      io.of('/interactive').to(`event:${eventId}`).emit('question:closed', { questionId: req.params.id });
    }
    res.json({ success: true });
  }),
);

// アンサーチェック / 集計結果発表
router.post(
  '/questions/:id/show-results',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    const q = await questionService.getEventStatus(req.params.id as string);
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

    const results = await questionService.getResults(req.params.id as string);
    const io = getIo(req) as { of: (n: string) => { to: (r: string) => { emit: (e: string, p: unknown) => void } } } | undefined;
    if (io) {
      io.of('/interactive').to(`event:${q.event_id}`).emit('question:results', {
        questionId: req.params.id,
        results,
        displayMode: req.body?.display_mode || 'percent',
      });
    }
    res.json({ success: true, data: results });
  }),
);

// 正解発表（クイズのみ）
router.post(
  '/questions/:id/reveal',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    const q = await questionService.getEventCorrect(req.params.id as string);
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

    const io = getIo(req) as { of: (n: string) => { to: (r: string) => { emit: (e: string, p: unknown) => void } } } | undefined;
    if (io) {
      io.of('/interactive').to(`event:${q.event_id}`).emit('question:reveal', {
        questionId: req.params.id,
        correctIndex: q.correct_index,
      });
    }
    res.json({ success: true });
  }),
);

// 画面から消す
router.post(
  '/questions/:id/dismiss',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    const q = await questionService.getEventStatus(req.params.id as string);
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');

    const io = getIo(req) as { of: (n: string) => { to: (r: string) => { emit: (e: string, p: unknown) => void } } } | undefined;
    if (io) {
      io.of('/interactive').to(`event:${q.event_id}`).emit('question:dismiss', { questionId: req.params.id });
    }
    res.json({ success: true });
  }),
);

router.get(
  '/questions/:id/results/json',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await questionService.getResultsDump(req.params.id as string));
  }),
);

router.post(
  '/events/:eventId/questions/import',
  requireAuth, requirePermission('interactive'),
  wrap(async (req, res) => {
    const { count } = await questionService.importBulk(
      req.params.eventId as string,
      req.body?.questions,
    );
    res.json({ success: true, message: `${count}問をインポートしました` });
  }),
);

// ============================================================
// 視聴者API (認証不要)
// ============================================================

router.post('/audience/questions/:id/answer', wrap(async (req, res) => {
  await questionService.submitAnswer(
    req.params.id as string,
    req.body?.choice_index,
    req.body?.session_token,
  );
  res.json({ success: true });
}));

export default router;
