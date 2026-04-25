/**
 * interactive/routes/scaling.routes.ts — Phase 3 v2.6.9
 * CoNoHa リサイズロジックは services/scaling.service.ts に集約。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { scalingService } from '../services/scaling.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('interactive', 'manager'));

// プラン一覧取得
router.get('/plans', (_req: Request, res: Response) => {
  res.json({ success: true, data: scalingService.listPlans() });
});

// スケーリング実行
router.post('/resize', wrap(async (req, res) => {
  const result = await scalingService.resize(req.body?.planId);
  res.json({ success: true, message: result.message });
}));

export default router;
