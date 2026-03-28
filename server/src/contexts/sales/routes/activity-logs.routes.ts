import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { activityLogService } from '../services/activity-log.service';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const opportunityId = req.query.opportunity_id as string;
  const customerId = req.query.customer_id as string;
  const performedBy = req.query.performed_by as string;
  const activityType = req.query.activity_type as string;
  const result = activityLogService.list({ search, opportunityId, customerId, performedBy, activityType }, page, limit, offset);
  res.json(paginatedResponse(result.rows, result.total, result.page, result.limit));
});

router.get('/upcoming', requireAuth, (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const rows = activityLogService.getUpcomingActions(req.user!.id, days);
  res.json({ success: true, data: rows });
});

router.get('/:id', (req, res) => {
  const row = activityLogService.getById(req.params.id as string);
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, (req, res) => {
  const row = activityLogService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const row = activityLogService.update(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, (req, res) => {
  activityLogService.delete(req.params.id as string);
  res.json({ success: true, message: '削除しました' });
});

export default router;
