import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { generateEpisodeCode, getNextEpisodeNumber } from '../services/sequence.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// List episodes for a project
router.get('/:projectId/episodes', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.params.projectId;

  const project = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  let where = 'WHERE e.project_id = ? AND e.deleted_at IS NULL';
  const params: unknown[] = [projectId];

  if (search) {
    where += ' AND (e.episode_code LIKE ? OR e.title LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = (queryOne(`SELECT COUNT(*) as c FROM episodes e ${where}`, params) as any).c;

  const rows = queryAll(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost,
      (SELECT COUNT(*) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as revenue_count,
      (SELECT COUNT(*) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as purchase_count
    FROM episodes e
    ${where}
    ORDER BY e.episode_number ASC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, total, page, limit));
});

// Get single episode
router.get('/:projectId/episodes/:id', (req, res) => {
  const row = queryOne(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost
    FROM episodes e
    WHERE e.id = ? AND e.project_id = ? AND e.deleted_at IS NULL`,
    [req.params.id, req.params.projectId]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');
  res.json({ success: true, data: row });
});

// Batch create episodes
router.post('/:projectId/episodes/batch', requireAuth, (req, res) => {
  const projectId = req.params.projectId as string;
  const { count, order_date, notes, revenue_budget_per_episode, cost_budget_per_episode } = req.body;

  if (!count || count < 1) throw new AppError(400, 'VALIDATION_ERROR', '作成数は1以上を指定してください');

  const project = queryOne('SELECT gls_number FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const nextNum = getNextEpisodeNumber(projectId);
  const createdEpisodes: unknown[] = [];

  const startEp = nextNum;
  const endEp = nextNum + count - 1;

  // Create episode_orders record
  const orderId = uuidv4();
  const today = order_date || new Date().toISOString().split('T')[0];
  execute(
    `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, projectId, today, count, startEp, endEp, notes || null, req.user!.id]
  );

  for (let i = 0; i < count; i++) {
    const episodeNumber = nextNum + i;
    const episodeCode = generateEpisodeCode(project.gls_number, episodeNumber);
    const id = uuidv4();

    execute(
      `INSERT INTO episodes (id, project_id, episode_code, episode_number, revenue_budget, cost_budget, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, episodeCode, episodeNumber, revenue_budget_per_episode || 0, cost_budget_per_episode || 0, req.user!.id]
    );

    const row = queryOne('SELECT * FROM episodes WHERE id = ?', [id]);
    createdEpisodes.push(row);
  }

  res.status(201).json({ success: true, data: createdEpisodes });
});

// Update episode
router.put('/:projectId/episodes/:id', requireAuth, (req, res) => {
  const existing = queryOne(
    'SELECT e.id FROM episodes e WHERE e.id = ? AND e.project_id = ? AND e.deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  const {
    title, recording_date, broadcast_date, status,
    revenue_budget, cost_budget, notes
  } = req.body;

  // For live broadcasts, recording_date also sets broadcast_date
  let finalBroadcastDate = broadcast_date || null;
  if (recording_date) {
    const project = queryOne(
      'SELECT broadcast_type FROM projects WHERE id = ? AND deleted_at IS NULL',
      [req.params.projectId]
    ) as any;
    if (project && project.broadcast_type === 'live') {
      finalBroadcastDate = recording_date;
    }
  }

  execute(
    `UPDATE episodes SET
      title = ?, recording_date = ?, broadcast_date = ?, status = ?,
      revenue_budget = ?, cost_budget = ?, notes = ?,
      updated_at = datetime('now'), updated_by = ?
    WHERE id = ?`,
    [
      title || null, recording_date || null, finalBroadcastDate,
      status || null, revenue_budget || null, cost_budget || null,
      notes || null, req.user!.id, req.params.id
    ]
  );

  const row = queryOne(
    `SELECT e.*,
      (SELECT COALESCE(SUM(amount),0) FROM revenues WHERE episode_id = e.id AND deleted_at IS NULL) as actual_revenue,
      (SELECT COALESCE(SUM(amount),0) FROM purchases WHERE episode_id = e.id AND deleted_at IS NULL) as actual_cost
    FROM episodes e WHERE e.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete episode
router.delete('/:projectId/episodes/:id', requireAuth, (req, res) => {
  const existing = queryOne(
    'SELECT id FROM episodes WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.projectId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エピソードが見つかりません');

  execute(
    `UPDATE episodes SET deleted_at = datetime('now'), updated_by = ? WHERE id = ?`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
