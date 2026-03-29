import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateBillingKey } from '../../../shared/services/billing-key.service';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.query.project_id as string;
  const groupId = req.query.group_id as string;
  let where = 'WHERE pu.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (pu.description LIKE ? OR v.name LIKE ? OR p.gls_number LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  // プロジェクト絞込み: 直接仕入 + グループ按分された仕入
  if (projectId) {
    where += ` AND ((pu.project_id = ? AND pu.group_id IS NULL) OR pu.id IN (SELECT purchase_id FROM purchase_allocations WHERE project_id = ?))`;
    params.push(projectId, projectId);
  }
  if (groupId) { where += ` AND pu.group_id = ?`; params.push(groupId); }

  const allocJoin = projectId
    ? `LEFT JOIN purchase_allocations pa ON pa.purchase_id = pu.id AND pa.project_id = '${projectId.replace(/'/g, "''")}'`
    : '';
  const allocCol = projectId ? ', pa.allocated_amount' : '';

  const total = (queryOne(`SELECT COUNT(*) as c FROM purchases pu LEFT JOIN vendors v ON v.id = pu.vendor_id LEFT JOIN projects p ON p.id = pu.project_id ${allocJoin} ${where}`, params) as any).c;
  const rows = queryAll(
    `SELECT pu.*, p.name as project_name, p.gls_number, v.name as vendor_name, pg.name as group_name${allocCol}
     FROM purchases pu
     LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN vendors v ON v.id = pu.vendor_id
     LEFT JOIN project_groups pg ON pg.id = pu.group_id
     ${allocJoin}
     ${where} ORDER BY pu.recognition_date DESC, pu.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne(
    `SELECT pu.*, p.name as project_name, p.gls_number, v.name as vendor_name, e.episode_code
     FROM purchases pu LEFT JOIN projects p ON p.id = pu.project_id
     LEFT JOIN vendors v ON v.id = pu.vendor_id LEFT JOIN episodes e ON e.id = pu.episode_id
     WHERE pu.id = ? AND pu.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, (req, res) => {
  const { project_id, episode_id, vendor_id, settlement_method, settlement_number,
          tax_category, invoice_qualified, amount, description,
          recognition_date, inspection_date, payment_due_date, notes } = req.body;
  if (!project_id || !vendor_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と仕入先は必須です');

  let billing_key: string | null = null;
  if (episode_id) {
    const episode = queryOne('SELECT episode_code FROM episodes WHERE id = ?', [episode_id]) as any;
    if (episode) billing_key = generateBillingKey(episode.episode_code, tax_category || 'tax10');
  }

  const id = uuidv4();
  execute(
    `INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, inspection_date, payment_due_date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, episode_id || null, vendor_id, req.user!.id,
     settlement_method || null, settlement_number || null, tax_category || 'tax10',
     invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
     amount || 0, description || null, recognition_date || null,
     inspection_date || null, payment_due_date || null, notes || null, req.user!.id]
  );
  const row = queryOne('SELECT * FROM purchases WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM purchases WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');

  const { project_id, episode_id, vendor_id, settlement_method, settlement_number,
          tax_category, invoice_qualified, amount, description,
          recognition_date, inspection_date, payment_due_date, notes } = req.body;
  execute(
    `UPDATE purchases SET project_id=?, episode_id=?, vendor_id=?, settlement_method=?, settlement_number=?,
     tax_category=?, invoice_qualified=?, amount=?, description=?,
     recognition_date=?, inspection_date=?, payment_due_date=?, notes=?,
     updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [project_id, episode_id || null, vendor_id, settlement_method || null, settlement_number || null,
     tax_category, invoice_qualified ? 1 : 0, amount, description || null,
     recognition_date || null, inspection_date || null, payment_due_date || null, notes || null,
     req.user!.id, req.params.id]
  );
  const row = queryOne('SELECT * FROM purchases WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE purchases SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
