import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { activityLogService } from '../services/activity-log.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const filter = {
    search,
    projectId: req.query.project_id as string,
    customerId: req.query.customer_id as string,
    userId: req.query.user_id as string,
    activityType: req.query.activity_type as string,
  };
  const result = await activityLogService.list(filter, page, limit, offset);
  res.json(paginatedResponse(result.rows, result.total, result.page, result.limit));
});

router.get('/upcoming', async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  res.json({ success: true, data: await activityLogService.getUpcomingActions(req.user!.id, days) });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await activityLogService.getById(req.params.id as string) });
});

router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  res.status(201).json({ success: true, data: await activityLogService.create(req.body, req.user!.id) });
});

router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await activityLogService.update(req.params.id as string, req.body) });
});

router.delete('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  await activityLogService.delete(req.params.id as string);
  res.json({ success: true, message: '削除しました' });
});

export default router;
