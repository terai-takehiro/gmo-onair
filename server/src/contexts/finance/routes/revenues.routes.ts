import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
// billing-key service no longer used for revenues (sequential numbering now)

const router = Router();

// 売上一覧
router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.query.project_id as string;
  let where = 'WHERE r.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (r.billing_key LIKE ? OR r.notes LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (projectId) { where += ` AND r.project_id = ?`; params.push(projectId); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM revenues r ${where}`, params) as any).c;
  const rows = queryAll(`SELECT r.*, p.name as project_name, p.gls_number, p.project_type, c.name as customer_name, e.episode_code FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN episodes e ON e.id = r.episode_id ${where} ORDER BY r.billing_key ASC, r.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

  // プロジェクト絞込み時は明細行も付与
  if (projectId) {
    for (const row of rows as any[]) {
      row.items = queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [row.id]);
    }
  }

  res.json(paginatedResponse(rows, total, page, limit));
});

// 売上詳細（明細行つき）
router.get('/:id', (req, res) => {
  const row = queryOne(`SELECT r.*, p.name as project_name, p.gls_number, p.project_type, c.name as customer_name, e.episode_code FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN episodes e ON e.id = r.episode_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

  const items = queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]);
  row.items = items;
  res.json({ success: true, data: row });
});

// 新規売上（明細行対応、episode_id任意）
router.post('/', requireAuth, (req, res) => {
  const { project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle } = req.body;
  if (!project_id || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と顧客は必須です');

  // billing_key生成: GLS番号-連番 (例: GLS-A004-001, GLS-A004-002)
  const project = queryOne('SELECT gls_number FROM projects WHERE id = ?', [project_id]) as any;
  const base = project?.gls_number || 'REV';
  const existingCount = (queryOne(
    `SELECT COUNT(*) as c FROM revenues WHERE project_id = ? AND deleted_at IS NULL`,
    [project_id]
  ) as any).c;
  const seqNum = String(existingCount + 1).padStart(3, '0');
  const taxSuffix = (tax_category || 'tax10') === 'tax8' ? '2' : (tax_category === 'exempt' ? '0' : '1');
  const billing_key = `${base}-${seqNum}-${taxSuffix}`;

  const id = uuidv4();

  // 明細行がある場合は合計を計算
  const finalAmount = Array.isArray(items) && items.length > 0
    ? items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0)
    : (amount || 0);

  execute(`INSERT INTO revenues (id, billing_key, project_id, customer_id, episode_id, assigned_to, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, subtitle, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key, project_id, customer_id, episode_id || null, req.user!.id, tax_category || 'tax10', finalAmount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, subtitle || null, req.user!.id]);

  // 明細行を保存
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      execute(`INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1]);
    }
  }

  const row = queryOne('SELECT * FROM revenues WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// 売上更新（明細行対応）
router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT * FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  const { billing_key, project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle } = req.body;

  // 税区分変更時はbilling_keyの末尾税枝番を更新
  let finalBillingKey = existing.billing_key;
  if (tax_category && tax_category !== existing.tax_category) {
    const taxSuffix = tax_category === 'tax8' ? '2' : (tax_category === 'exempt' ? '0' : '1');
    // 末尾の税枝番を置換 (GLS-A004-001-1 → GLS-A004-001-2)
    finalBillingKey = existing.billing_key.replace(/-\d$/, `-${taxSuffix}`);
  }

  // 明細行がある場合は合計を計算
  const finalAmount = Array.isArray(items) && items.length > 0
    ? items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0)
    : (amount !== undefined ? amount : existing.amount);

  execute(`UPDATE revenues SET billing_key=?, project_id=?, customer_id=?, episode_id=?, tax_category=?, amount=?, recognition_date=?, billing_date=?, payment_due_date=?, notes=?, subtitle=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [finalBillingKey || null, project_id || existing.project_id, customer_id || existing.customer_id, episode_id !== undefined ? (episode_id || null) : existing.episode_id, tax_category || existing.tax_category, finalAmount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, subtitle !== undefined ? (subtitle || null) : existing.subtitle, req.user!.id, req.params.id]);

  // 明細行を置換
  if (Array.isArray(items)) {
    execute('DELETE FROM revenue_items WHERE revenue_id = ?', [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      execute(`INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), req.params.id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1]);
    }
  }

  const row = queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// 売上削除
router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE revenues SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
