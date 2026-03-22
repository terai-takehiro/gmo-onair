import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { AppError } from '../middleware/errorHandler';
import { generateBillingKey } from '../services/billing-key.service';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.query.project_id as string;
  const episodeId = req.query.episode_id as string;
  let where = 'WHERE pu.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (pu.description LIKE ? OR v.name LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (projectId) { where += ` AND pu.project_id = ?`; params.push(projectId); }
  if (episodeId) { where += ' AND pu.episode_id = ?'; params.push(episodeId); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM purchases pu LEFT JOIN vendors v ON v.id = pu.vendor_id ${where}`, params) as any).c;
  const rows = queryAll(`SELECT pu.*, pu.billing_key, p.name as project_name, p.gls_number, v.name as vendor_name, e.episode_code FROM purchases pu LEFT JOIN projects p ON p.id = pu.project_id LEFT JOIN vendors v ON v.id = pu.vendor_id LEFT JOIN episodes e ON e.id = pu.episode_id ${where} ORDER BY pu.recognition_date DESC, pu.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne(`SELECT pu.*, p.name as project_name, p.gls_number, v.name as vendor_name, e.episode_code FROM purchases pu LEFT JOIN projects p ON p.id = pu.project_id LEFT JOIN vendors v ON v.id = pu.vendor_id LEFT JOIN episodes e ON e.id = pu.episode_id WHERE pu.id = ? AND pu.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');
  res.json({ success: true, data: row });
});

// GET episode allocations for a purchase
router.get('/:id/episode-allocations', (req, res) => {
  const purchase = queryOne('SELECT id FROM purchases WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!purchase) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');
  const rows = queryAll(
    `SELECT pea.*, e.episode_code FROM purchase_episode_allocations pea LEFT JOIN episodes e ON e.id = pea.episode_id WHERE pea.purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

router.post('/', requireAuth, (req, res) => {
  const { project_id, episode_ids, vendor_id, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, inspection_date, payment_due_date, notes } = req.body;
  if (!project_id || !vendor_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と仕入先は必須です');

  // Determine episode_id from episode_ids array
  let episode_id: string | null = null;
  const episodeIdList: string[] = episode_ids || [];

  if (episodeIdList.length === 1) {
    episode_id = episodeIdList[0];
  } else if (episodeIdList.length > 1) {
    episode_id = episodeIdList[0];
  }

  // Look up episode_code for billing_key generation
  let billing_key: string | null = null;
  if (episode_id) {
    const episode = queryOne('SELECT episode_code FROM episodes WHERE id = ?', [episode_id]) as any;
    if (episode) {
      billing_key = generateBillingKey(episode.episode_code, tax_category || 'tax10');
    }
  }

  const id = uuidv4();
  execute(`INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, inspection_date, payment_due_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, episode_id, vendor_id, req.user!.id, settlement_method || null, settlement_number || null, tax_category || 'tax10', invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1, amount || 0, description || null, recognition_date || null, inspection_date || null, payment_due_date || null, notes || null, req.user!.id]);

  // Create purchase_episode_allocations for multi-episode
  if (episodeIdList.length > 1) {
    const perEpisodeAmount = Math.floor((amount || 0) / episodeIdList.length);
    const remainder = (amount || 0) - perEpisodeAmount * episodeIdList.length;
    episodeIdList.forEach((epId, index) => {
      const allocId = uuidv4();
      const allocAmount = index === 0 ? perEpisodeAmount + remainder : perEpisodeAmount;
      execute(
        `INSERT INTO purchase_episode_allocations (id, purchase_id, episode_id, allocated_amount) VALUES (?, ?, ?, ?)`,
        [allocId, id, epId, allocAmount]
      );
    });
  }

  const row = queryOne('SELECT * FROM purchases WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// POST auto-allocate purchase amount across episodes evenly
router.post('/:id/allocate-episodes', requireAuth, (req, res) => {
  const purchase = queryOne('SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!purchase) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');

  const { episode_ids } = req.body;
  if (!episode_ids || !Array.isArray(episode_ids) || episode_ids.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'エピソードIDの配列は必須です');
  }

  // Delete existing allocations
  execute('DELETE FROM purchase_episode_allocations WHERE purchase_id = ?', [req.params.id]);

  // Create even allocations
  const totalAmount = purchase.amount || 0;
  const perEpisodeAmount = Math.floor(totalAmount / episode_ids.length);
  const remainder = totalAmount - perEpisodeAmount * episode_ids.length;

  episode_ids.forEach((epId: string, index: number) => {
    const allocId = uuidv4();
    const allocAmount = index === 0 ? perEpisodeAmount + remainder : perEpisodeAmount;
    execute(
      `INSERT INTO purchase_episode_allocations (id, purchase_id, episode_id, allocated_amount) VALUES (?, ?, ?, ?)`,
      [allocId, req.params.id, epId, allocAmount]
    );
  });

  const rows = queryAll(
    `SELECT pea.*, e.episode_code FROM purchase_episode_allocations pea LEFT JOIN episodes e ON e.id = pea.episode_id WHERE pea.purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM purchases WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');
  const { project_id, vendor_id, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, inspection_date, payment_due_date, notes } = req.body;
  execute(`UPDATE purchases SET project_id=?, vendor_id=?, settlement_method=?, settlement_number=?, tax_category=?, invoice_qualified=?, amount=?, description=?, recognition_date=?, inspection_date=?, payment_due_date=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [project_id, vendor_id, settlement_method || null, settlement_number || null, tax_category, invoice_qualified ? 1 : 0, amount, description || null, recognition_date || null, inspection_date || null, payment_due_date || null, notes || null, req.user!.id, req.params.id]);
  const row = queryOne('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE purchases SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
