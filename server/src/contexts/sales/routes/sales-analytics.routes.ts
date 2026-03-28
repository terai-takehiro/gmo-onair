import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { salesAnalyticsService } from '../services/sales-analytics.service';

const router = Router();

router.get('/funnel', (req, res) => {
  const year = parseInt(req.query.year as string) || undefined;
  const month = parseInt(req.query.month as string) || undefined;
  const data = salesAnalyticsService.getFunnelAnalysis(year, month);
  res.json({ success: true, data });
});

router.get('/lost-reason-categories', (_req, res) => {
  const data = salesAnalyticsService.getLostReasonCategories();
  res.json({ success: true, data });
});

router.get('/lost-reasons', (req, res) => {
  const year = parseInt(req.query.year as string) || undefined;
  const data = salesAnalyticsService.getLostReasonAnalysis(year);
  res.json({ success: true, data });
});

router.get('/targets', (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const userId = req.query.user_id as string;
  const data = salesAnalyticsService.getTargets(year, userId);
  res.json({ success: true, data });
});

router.post('/targets', requireAuth, (req, res) => {
  const { user_id, target_year, target_month, target_amount } = req.body;
  const data = salesAnalyticsService.upsertTarget(user_id, target_year, target_month, target_amount);
  res.json({ success: true, data });
});

router.get('/performance', (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || undefined;
  const data = salesAnalyticsService.getPerformanceReview(year, month);
  res.json({ success: true, data });
});

export default router;
