import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { salesAnalyticsService } from '../services/sales-analytics.service';

const router = Router();

// ファネル分析
router.get('/funnel', (req, res) => {
  const year = parseInt(req.query.year as string) || undefined;
  const month = parseInt(req.query.month as string) || undefined;
  const data = salesAnalyticsService.getFunnelAnalysis(year, month);
  res.json({ success: true, data });
});

// 失注理由分析
router.get('/lost-reasons', (req, res) => {
  const year = parseInt(req.query.year as string) || undefined;
  const data = salesAnalyticsService.getLostReasonAnalysis(year);
  res.json({ success: true, data });
});

// 失注理由マスタ
router.get('/lost-reason-master', (_req, res) => {
  const data = salesAnalyticsService.getLostReasons();
  res.json({ success: true, data });
});

// 営業目標の取得
router.get('/targets', (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const userId = req.query.user_id as string;
  const data = salesAnalyticsService.getTargets(year, userId);
  res.json({ success: true, data });
});

// 営業目標の設定
router.post('/targets', requireAuth, (req, res) => {
  const { user_id, fiscal_year, fiscal_month, target_amount, target_count } = req.body;
  const data = salesAnalyticsService.upsertTarget(user_id, fiscal_year, fiscal_month, target_amount, target_count);
  res.json({ success: true, data });
});

// 営業評価（目標 vs 実績）
router.get('/performance', (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || undefined;
  const data = salesAnalyticsService.getPerformanceReview(year, month);
  res.json({ success: true, data });
});

export default router;
