import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// List invoice groups with episode count and total amount
router.get('/:projectId/invoice-groups', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const projectId = req.params.projectId;

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const where = 'WHERE ig.project_id = ? AND ig.deleted_at IS NULL';
  const params: unknown[] = [projectId];

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM invoice_groups ig ${where}`, params)) as any).c;

  const rows = await queryAll(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.episode_id = ige.episode_id AND r.deleted_at IS NULL),0) FROM invoice_group_episodes ige
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
router.post('/:projectId/invoice-groups', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId;
  const { title, invoice_date, episode_ids } = req.body;

  if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');

  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const id = uuidv4();
  await execute(
    `INSERT INTO invoice_groups (id, project_id, title, invoice_date, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, projectId, title, invoice_date || null, req.user!.id]
  );

  // Link episodes if provided
  if (episode_ids && Array.isArray(episode_ids)) {
    for (const episodeId of episode_ids) {
      await execute(
        'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
        [id, episodeId]
      );
    }
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.episode_id = ige.episode_id AND r.deleted_at IS NULL),0) FROM invoice_group_episodes ige
       JOIN episodes e ON e.id = ige.episode_id WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [id]
  );
  res.status(201).json({ success: true, data: row });
});

// Update invoice group
router.put('/:projectId/invoice-groups/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  const { title, invoice_date, notes } = req.body;

  await execute(
    `UPDATE invoice_groups SET
      title = ?, invoice_date = ?, notes = ?,
      updated_at = NOW(), updated_by = ?
    WHERE id = ?`,
    [title || null, invoice_date || null, notes || null, req.user!.id, req.params.id]
  );

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.episode_id = ige.episode_id AND r.deleted_at IS NULL),0) FROM invoice_group_episodes ige
       JOIN episodes e ON e.id = ige.episode_id WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete invoice group
router.delete('/:projectId/invoice-groups/:id', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  await execute(
    `UPDATE invoice_groups SET deleted_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

// Update episode assignments for an invoice group
router.put('/:projectId/invoice-groups/:id/episodes', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM invoice_groups WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求グループが見つかりません');

  const { episode_ids } = req.body;
  if (!Array.isArray(episode_ids)) throw new AppError(400, 'VALIDATION_ERROR', 'episode_idsは配列で指定してください');

  // Delete existing links
  await execute('DELETE FROM invoice_group_episodes WHERE invoice_group_id = ?', [req.params.id]);

  // Insert new links
  for (const episodeId of episode_ids) {
    await execute(
      'INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)',
      [req.params.id, episodeId]
    );
  }

  const row = await queryOne(
    `SELECT ig.*,
      (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count,
      (SELECT COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.episode_id = ige.episode_id AND r.deleted_at IS NULL),0) FROM invoice_group_episodes ige
       JOIN episodes e ON e.id = ige.episode_id WHERE ige.invoice_group_id = ig.id) as total_amount
    FROM invoice_groups ig WHERE ig.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Auto-create invoice groups by recording date
router.post('/:projectId/invoice-groups/auto-by-recording-date', requirePermission('sales', 'editor'), async (req, res) => {
  const projectId = req.params.projectId;
  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  // Get episodes grouped by recording_date
  const dateGroups = await queryAll(
    `SELECT recording_date, GROUP_CONCAT(id) as episode_ids, COUNT(*) as cnt
     FROM episodes
     WHERE project_id = ? AND deleted_at IS NULL AND recording_date IS NOT NULL
     GROUP BY recording_date
     ORDER BY recording_date`,
    [projectId]
  );

  const created: unknown[] = [];
  for (const group of dateGroups) {
    const recDate = group.recording_date as string;
    const epIds = (group.episode_ids as string).split(',');

    // Check if a group for this date already exists
    const existing = await queryOne(
      `SELECT ig.id FROM invoice_groups ig
       WHERE ig.project_id = ? AND ig.title ILIKE ? AND ig.deleted_at IS NULL`,
      [projectId, `%${recDate}%`]
    );
    if (existing) continue; // Skip if already exists

    const id = uuidv4();
    const title = `${recDate} 収録分 (${group.cnt}話)`;
    await execute(
      `INSERT INTO invoice_groups (id, project_id, title, invoice_date, created_by) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, title, recDate, req.user!.id]
    );

    for (const epId of epIds) {
      await execute('INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)', [id, epId.trim()]);
    }

    const row = await queryOne(
      `SELECT ig.*, (SELECT COUNT(*) FROM invoice_group_episodes ige WHERE ige.invoice_group_id = ig.id) as episode_count
       FROM invoice_groups ig WHERE ig.id = ?`,
      [id]
    );
    created.push(row);
  }

  res.status(201).json({ success: true, data: created, message: `${created.length}件の請求グループを作成しました` });
});

export default router;
