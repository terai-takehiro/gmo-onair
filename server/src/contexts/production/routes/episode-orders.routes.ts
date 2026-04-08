import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// List order history for a project
router.get('/:projectId/orders', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const projectId = req.params.projectId;

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const where = 'WHERE eo.project_id = ? AND eo.deleted_at IS NULL';
  const params: unknown[] = [projectId];

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM episode_orders eo ${where}`, params)) as any).c;

  const rows = await queryAll(
    `SELECT eo.*, u.name as created_by_name
    FROM episode_orders eo
    LEFT JOIN users u ON u.id = eo.created_by
    ${where}
    ORDER BY eo.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, total, page, limit));
});

// Soft delete an order record
router.delete('/:projectId/orders/:id', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM episode_orders WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '発注記録が見つかりません');

  await execute(
    `UPDATE episode_orders SET deleted_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
