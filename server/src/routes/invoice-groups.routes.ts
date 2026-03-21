import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// List invoice groups with episode count and total amount
router.get('/:projectId/invoice-groups', (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const projectId = req.params.projectId;

  const project = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const where = 'WHERE ig.project_id = ? AND ig.deleted_at IS NULL';
  const params: unknown[] = [projectId];

  const total = (queryOne(`SELECT COUNT(*) as c FROM invoice_groups ig ${where}`, params) as any).c;

  const rows = queryAll(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(e.revenue_budget),0) FROM invoice_group_episodes ige
       JOIN episodes e ON e.id = ige.episode_id WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig
    ${where}
    ORDER BY ig.invoice_date DESC, ig.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, total, page, limit));
});

// Create invoice group
router.post('/:projectId/invoice-groups', requireAuth, (req, res) => {
  const projectId = req.params.projectId;
  const { title, invoice_date, episode_ids } = req.body;

  if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');

  const project = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const id = uuidv4();
  execute(
    `INSERT INTO invoice_groups (id, project_id, title, invoice_date, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, projectId, title, invoice_date || null, req.user!.id]
  );

  // Link episodes if provided
  if (episode_ids && Array.isArray(episode_ids)) {
    for (const episodeId of episode_ids) {
      execute(
        'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
        [id, episodeId]
      );
    }
  }

  const row = queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(e.revenue_budget),0) FROM invoice_group_episodes ige
       JOIN episodes e ON e.id = ige.episode_id WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [id]
  );
  res.status(201).json({ success: true, data: row });
});

// Update invoice group
router.put('/:projectId/invoice-groups/:id', requireAuth, (req, res) => {
  const existing = queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  const { title, invoice_date, notes } = req.body;

  execute(
    `UPDATE invoice_groups SET
      title = ?, invoice_date = ?, notes = ?,
      updated_at = datetime('now'), updated_by = ?
    WHERE id = ?`,
    [title || null, invoice_date || null, notes || null, req.user!.id, req.params.id]
  );

  const row = queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(e.revenue_budget),0) FROM invoice_group_episodes ige
       JOIN episodes e ON e.id = ige.episode_id WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete invoice group
router.delete('/:projectId/invoice-groups/:id', requireAuth, (req, res) => {
  const existing = queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  execute(
    `UPDATE invoice_groups SET deleted_at = datetime('now'), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

// Update episode assignments for an invoice group
router.put('/:projectId/invoice-groups/:id/episodes', requireAuth, (req, res) => {
  const existing = queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  const { episode_ids } = req.body;
  if (!Array.isArray(episode_ids)) throw new AppError(400, 'VALIDATION_ERROR', 'episode_idsは配列で指定してください');

  // Delete existing links
  execute('DELETE FROM invoice_group_episodes WHERE invoice_group_id = ?', [req.params.id]);

  // Insert new links
  for (const episodeId of episode_ids) {
    execute(
      'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
      [req.params.id, episodeId]
    );
  }

  const row = queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE(SUM(e.revenue_budget),0) FROM invoice_group_episodes ige
       JOIN episodes e ON e.id = ige.episode_id WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

export default router;
