import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { activityLogService } from '../services/activity-log.service';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const filter = {
    search,
    projectId: req.query.project_id as string,
    customerId: req.query.customer_id as string,
    userId: req.query.user_id as string,
    activityType: req.query.activity_type as string,
  };
  const result = activityLogService.list(filter, page, limit, offset);
  res.json(paginatedResponse(result.rows, result.total, result.page, result.limit));
});

router.get('/upcoming', requireAuth, (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  res.json({ success: true, data: activityLogService.getUpcomingActions(req.user!.id, days) });
});

router.get('/:id', (req, res) => {
  res.json({ success: true, data: activityLogService.getById(req.params.id as string) });
});

router.post('/', requireAuth, (req, res) => {
  res.status(201).json({ success: true, data: activityLogService.create(req.body, req.user!.id) });
});

router.put('/:id', requireAuth, (req, res) => {
  res.json({ success: true, data: activityLogService.update(req.params.id as string, req.body) });
});

router.delete('/:id', requireAuth, (req, res) => {
  activityLogService.delete(req.params.id as string);
  res.json({ success: true, message: '削除しました' });
});

export default router;
