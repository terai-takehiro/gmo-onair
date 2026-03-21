import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { generateSequenceNumber, generateGlsNumber, generateEpisodeCode } from '../services/sequence.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const stage = req.query.stage as string;
  const assignedTo = req.query.assigned_to as string;
  let where = 'WHERE o.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (o.title LIKE ? OR o.opp_code LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (stage) { where += ` AND o.stage = ?`; params.push(stage); }
  if (assignedTo) { where += ` AND o.assigned_to = ?`; params.push(assignedTo); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM opportunities o ${where}`, params) as any).c;
  const rows = queryAll(`SELECT o.*, c.name as customer_name, u.name as assigned_to_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.assigned_to ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne(`SELECT o.*, c.name as customer_name, u.name as assigned_to_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.assigned_to WHERE o.id = ? AND o.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, (req, res) => {
  const { title, customer_id, stage, probability, expected_amount, expected_date, assigned_to, notes, project_type, project_type_other } = req.body;
  if (!title || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件仮称と顧客は必須です');
  const id = uuidv4();
  const oppCode = generateSequenceNumber('opp_code', 'OPP');
  execute(`INSERT INTO opportunities (id, opp_code, title, customer_id, stage, probability, expected_amount, expected_date, assigned_to, notes, project_type, project_type_other, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, oppCode, title, customer_id, stage || 'neta', probability || 0, expected_amount || 0, expected_date || null, assigned_to || req.user!.id, notes || null, project_type || null, project_type_other || null, req.user!.id]);
  const row = queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  const { title, customer_id, stage, probability, expected_amount, expected_date, assigned_to, notes, project_type, project_type_other } = req.body;
  execute(`UPDATE opportunities SET title=?, customer_id=?, stage=?, probability=?, expected_amount=?, expected_date=?, assigned_to=?, notes=?, project_type=?, project_type_other=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [title, customer_id, stage, probability, expected_amount, expected_date || null, assigned_to, notes || null, project_type || null, project_type_other || null, req.user!.id, req.params.id]);
  const row = queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.patch('/:id/stage', requireAuth, (req, res) => {
  const { stage, broadcast_type, media_platform, initial_episode_count } = req.body;
  if (!stage) throw new AppError(400, 'VALIDATION_ERROR', 'stageは必須です');
  const opp = queryOne('SELECT * FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  execute(`UPDATE opportunities SET stage=?, updated_at=datetime('now'), updated_by=? WHERE id=?`, [stage, req.user!.id, req.params.id]);
  let project = null;
  let episodes: unknown[] = [];
  let episodeOrder = null;
  if (stage === 'b_verbal' && !opp.project_id) {
    const projId = uuidv4();
    const glsNumber = generateGlsNumber();
    const bType = broadcast_type || 'recording';
    const mPlatform = media_platform || 'other';
    execute(`INSERT INTO projects (id, gls_number, name, customer_id, opportunity_id, status, broadcast_type, media_platform, created_by) VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
      [projId, glsNumber, opp.title, opp.customer_id, req.params.id, bType, mPlatform, req.user!.id]);
    execute(`UPDATE opportunities SET project_id=?, updated_at=datetime('now') WHERE id=?`, [projId, req.params.id]);

    // 初回発注: 話数を一括作成
    const epCount = parseInt(initial_episode_count) || 0;
    if (epCount > 0) {
      for (let i = 1; i <= epCount; i++) {
        const epId = uuidv4();
        const epCode = generateEpisodeCode(glsNumber, i);
        execute(`INSERT INTO episodes (id, project_id, episode_number, episode_code, created_by) VALUES (?, ?, ?, ?, ?)`,
          [epId, projId, i, epCode, req.user!.id]);
      }
      // 発注バッチ記録
      const orderId = uuidv4();
      const today = new Date().toISOString().split('T')[0];
      execute(`INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, projId, today, epCount, 1, epCount, '受注時初回発注', req.user!.id]);
      episodes = queryAll('SELECT * FROM episodes WHERE project_id = ? AND deleted_at IS NULL ORDER BY episode_number', [projId]);
      episodeOrder = queryOne('SELECT * FROM episode_orders WHERE id = ?', [orderId]);
    }

    project = queryOne('SELECT * FROM projects WHERE id = ?', [projId]);

    // Auto-create revenue from expected_amount
    if (opp.expected_amount && opp.expected_amount > 0) {
      const revId = uuidv4();
      execute(
        `INSERT INTO revenues (id, billing_key, project_id, customer_id, assigned_to, tax_category, amount, notes, created_by)
         VALUES (?, ?, ?, ?, ?, 'tax10', ?, ?, ?)`,
        [revId, `${glsNumber}-AUTO`, projId, opp.customer_id, req.user!.id, opp.expected_amount, 'ヨミからの自動連携', req.user!.id]
      );
    }
  }
  const updated = queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [req.params.id]);
  res.json({ success: true, data: updated, project, episodes, episodeOrder });
});

// GET /opportunities/:id/dates - List dates for opportunity
router.get('/:id/dates', (req, res) => {
  const opp = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  const dates = queryAll(
    `SELECT id, date_start, date_end, label, sort_order FROM opportunity_dates WHERE opportunity_id = ? ORDER BY sort_order, date_start`,
    [req.params.id]
  );
  res.json({ success: true, data: dates });
});

// PUT /opportunities/:id/dates - Save dates (full replace)
router.put('/:id/dates', requireAuth, (req, res) => {
  const opp = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  const { dates } = req.body;
  if (!Array.isArray(dates)) throw new AppError(400, 'VALIDATION_ERROR', 'datesは配列で指定してください');

  // Delete existing dates
  execute(`DELETE FROM opportunity_dates WHERE opportunity_id = ?`, [req.params.id]);

  // Insert new dates
  for (const d of dates) {
    const id = uuidv4();
    execute(
      `INSERT INTO opportunity_dates (id, opportunity_id, date_start, date_end, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, d.date_start, d.date_end || null, d.label || null, d.sort_order ?? 0]
    );
  }

  const saved = queryAll(
    `SELECT id, date_start, date_end, label, sort_order FROM opportunity_dates WHERE opportunity_id = ? ORDER BY sort_order, date_start`,
    [req.params.id]
  );
  res.json({ success: true, data: saved });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE opportunities SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
