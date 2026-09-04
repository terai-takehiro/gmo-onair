/**
 * 案件フェーズごとの受注確度（%）の API
 *
 * 読むのは `sales` があれば通す（財務ダッシュボードの見込み表示に使う値なので、
 * 見積・請求を作る人は知る必要がある — `money-rules.routes.ts` と同じ考え方）。
 * 直せるのは `sales` の manager だけ。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  getStageProbabilities, saveStageProbability, isKnownStage,
} from '../services/stage-probability.service';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('sales', 'reader'), async (_req, res) => {
  res.json({ success: true, data: await getStageProbabilities() });
});

router.put('/:stage', requirePermission('sales', 'manager'), async (req, res) => {
  const { stage } = req.params;
  if (!isKnownStage(stage)) {
    throw new AppError(400, 'VALIDATION_ERROR', '知らない案件フェーズです');
  }
  const { probability } = req.body ?? {};
  const n = Number(probability);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', '確度は0〜100の整数で入れてください');
  }
  res.json({ success: true, data: await saveStageProbability(stage, n, req.user!.id) });
});

export default router;
