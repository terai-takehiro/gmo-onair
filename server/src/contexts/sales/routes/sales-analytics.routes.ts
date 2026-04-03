import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { salesAnalyticsService } from '../services/sales-analytics.service';

const router = Router();

router.get('/funnel', async (req, res) => {
  const year = parseInt(req.query.year as string) || undefined;
  const month = parseInt(req.query.month as string) || undefined;
  const data = await salesAnalyticsService.getFunnelAnalysis(year, month);
  res.json({ success: true, data });
});

router.get('/lost-reasons', async (req, res) => {
  const year = parseInt(req.query.year as string) || undefined;
  const data = await salesAnalyticsService.getLostReasonAnalysis(year);
  res.json({ success: true, data });
});

router.get('/targets', async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const userId = req.query.user_id as string;
  const data = await salesAnalyticsService.getTargets(year, userId);
  res.json({ success: true, data });
});

router.post('/targets', requireAuth, async (req, res) => {
  const { user_id, target_year, target_month, target_amount } = req.body;
  const data = await salesAnalyticsService.upsertTarget(user_id, target_year, target_month, target_amount);
  res.json({ success: true, data });
});

router.get('/performance', async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || undefined;
  const data = await salesAnalyticsService.getPerformanceReview(year, month);
  res.json({ success: true, data });
});

export default router;
