import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// 一覧
router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE pg.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ' AND pg.name LIKE ?'; params.push(`%${search}%`); }

  const total = (queryOne(`SELECT COUNT(*) as c FROM project_groups pg ${where}`, params) as any).c;
  const rows = queryAll(
    `SELECT pg.*,
       (SELECT COUNT(*) FROM project_group_members pgm WHERE pgm.group_id = pg.id) as member_count,
       (SELECT COALESCE(SUM(pu.amount), 0) FROM purchases pu WHERE pu.group_id = pg.id AND pu.deleted_at IS NULL) as total_purchase
     FROM project_groups pg ${where}
     ORDER BY pg.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

// 詳細（メンバー案件つき）
router.get('/:id', (req, res) => {
  const group = queryOne(
    `SELECT pg.*,
       (SELECT COALESCE(SUM(pu.amount), 0) FROM purchases pu WHERE pu.group_id = pg.id AND pu.deleted_at IS NULL) as total_purchase
     FROM project_groups pg WHERE pg.id = ? AND pg.deleted_at IS NULL`, [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');

  const members = queryAll(
    `SELECT p.id, p.gls_number, p.name, p.stage, c.name as customer_name
     FROM project_group_members pgm
     JOIN projects p ON p.id = pgm.project_id AND p.deleted_at IS NULL
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE pgm.group_id = ?
     ORDER BY p.gls_number`, [req.params.id]);

  const purchases = queryAll(
    `SELECT pu.*, v.name as vendor_name
     FROM purchases pu
     LEFT JOIN vendors v ON v.id = pu.vendor_id
     WHERE pu.group_id = ? AND pu.deleted_at IS NULL
     ORDER BY pu.created_at DESC`, [req.params.id]);

  // 按分明細つき
  for (const pu of purchases as any[]) {
    pu.allocations = queryAll(
      `SELECT pa.*, p.name as project_name, p.gls_number
       FROM purchase_allocations pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.purchase_id = ?`, [pu.id]);
  }

  res.json({ success: true, data: { ...group, members, purchases } });
});

// 新規作成
router.post('/', requireAuth, (req, res) => {
  const { name, description, member_project_ids } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'グループ名は必須です');

  const id = uuidv4();
  execute(
    `INSERT INTO project_groups (id, name, description, created_by) VALUES (?, ?, ?, ?)`,
    [id, name, description || null, req.user!.id]
  );

  if (member_project_ids && Array.isArray(member_project_ids)) {
    for (const pid of member_project_ids) {
      execute(`INSERT OR IGNORE INTO project_group_members (group_id, project_id) VALUES (?, ?)`, [id, pid]);
    }
  }

  const group = queryOne('SELECT * FROM project_groups WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: group });
});

// 更新
router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');

  const { name, description, member_project_ids } = req.body;
  execute(
    `UPDATE project_groups SET name = ?, description = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?`,
    [name, description || null, req.user!.id, req.params.id]
  );

  // メンバーを差し替え
  if (member_project_ids && Array.isArray(member_project_ids)) {
    execute('DELETE FROM project_group_members WHERE group_id = ?', [req.params.id]);
    for (const pid of member_project_ids) {
      execute(`INSERT INTO project_group_members (group_id, project_id) VALUES (?, ?)`, [req.params.id, pid]);
    }
  }

  const group = queryOne('SELECT * FROM project_groups WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: group });
});

// 削除
router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE project_groups SET deleted_at = datetime('now'), updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]);
  // グループ仕入のgroup_idもクリア
  execute(`UPDATE purchases SET group_id = NULL WHERE group_id = ?`, [req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

// グループ仕入登録（按分つき）
router.post('/:id/purchases', requireAuth, (req, res) => {
  const group = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');

  const { vendor_id, amount, description, tax_category, settlement_method, settlement_number,
          invoice_qualified, recognition_date, allocations } = req.body;
  if (!vendor_id) throw new AppError(400, 'VALIDATION_ERROR', '仕入先は必須です');
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '按分先を指定してください');
  }

  // 仕入レコード（project_id は按分先の最初の案件を代表として設定）
  const purchaseId = uuidv4();
  execute(
    `INSERT INTO purchases (id, billing_key, project_id, group_id, vendor_id, assigned_to, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [purchaseId, null, allocations[0].project_id, req.params.id, vendor_id, req.user!.id,
     settlement_method || null, settlement_number || null, tax_category || 'tax10',
     invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
     amount || 0, description || null, recognition_date || null, req.user!.id]
  );

  // 按分明細
  for (const alloc of allocations) {
    execute(
      `INSERT INTO purchase_allocations (id, purchase_id, project_id, allocated_amount) VALUES (?, ?, ?, ?)`,
      [uuidv4(), purchaseId, alloc.project_id, alloc.allocated_amount]
    );
  }

  const row = queryOne(
    `SELECT pu.*, v.name as vendor_name FROM purchases pu LEFT JOIN vendors v ON v.id = pu.vendor_id WHERE pu.id = ?`,
    [purchaseId]
  );
  const allocs = queryAll(
    `SELECT pa.*, p.name as project_name, p.gls_number FROM purchase_allocations pa JOIN projects p ON p.id = pa.project_id WHERE pa.purchase_id = ?`,
    [purchaseId]
  );
  res.status(201).json({ success: true, data: { ...row, allocations: allocs } });
});

export default router;
