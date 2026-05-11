/**
 * interactive/routes/external.routes.ts
 *
 * インタラクティブ外部公開 API (v1)。
 * 用途: 表彰CG (Awards) など他システムからクイズ/アンケート集計結果を取り込む。
 *
 * 認証: X-API-Key ヘッダー (interactive_api_keys テーブルで管理)。
 * Cookie / セッションは使わない (サーバー間通信前提)。
 *
 * エンドポイント:
 *   GET /api/v1/external/events/:eventId/questions
 *     → 当該イベントの問題一覧 (メタデータ + 多言語テキスト + 回答数)
 *
 *   GET /api/v1/external/questions/:questionId/results
 *     → 選択肢ごとの得票数 + 割合 + 多言語テキスト + 正解インデックス
 */
import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/middleware/errorHandler';
import { apiKeyService } from '../services/apiKey.service';
import { questionService } from '../services/question.service';
import { queryOne } from '../../../shared/db/connection';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

async function apiKeyAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const raw = (req.header('x-api-key') ?? req.header('X-API-Key') ?? '').trim();
  if (!raw) return next(new AppError(401, 'MISSING_API_KEY', 'X-API-Key ヘッダーが必要です'));
  const key = await apiKeyService.verify(raw);
  if (!key) return next(new AppError(401, 'INVALID_API_KEY', 'API キーが無効です'));
  (req as unknown as { apiKey: typeof key }).apiKey = key;
  next();
}

router.use(apiKeyAuth);

router.get(
  '/events/:eventId/questions',
  wrap(async (req, res) => {
    const eventId = req.params.eventId as string;
    const ev = await queryOne(
      'SELECT id, title, status FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
      [eventId],
    );
    if (!ev) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
    const questions = await questionService.listByEvent(eventId);
    res.json({ data: { event: ev, questions } });
  }),
);

router.get(
  '/questions/:questionId/results',
  wrap(async (req, res) => {
    const id = req.params.questionId as string;
    const q = await questionService.getById(id);
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');
    const dump = await questionService.getResultsDump(id);
    res.json({ data: dump });
  }),
);

export default router;
