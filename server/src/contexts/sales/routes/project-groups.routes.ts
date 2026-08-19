import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { taxBillingSuffix } from '../../../shared/services/tax-category.service';
import { loadRevenueItemCarryover } from '../../finance/services/revenue-item-carryover.service';
import { assertVendorCompanyId } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// 一覧
router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE pg.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ' AND pg.name ILIKE ?'; params.push(`%${search}%`); }

  const total = (await queryOne(`SELECT COUNT(*) as c FROM project_groups pg ${where}`, params) as any).c;
  const rows = await queryAll(
    `SELECT pg.*,
       (SELECT COUNT(*) FROM project_group_members pgm WHERE pgm.group_id = pg.id) as member_count,
       (SELECT COALESCE(SUM(pu.amount), 0) FROM purchases pu WHERE pu.group_id = pg.id AND pu.deleted_at IS NULL) as total_purchase,
       (SELECT COALESCE(SUM(r.amount), 0) FROM revenues r WHERE r.group_id = pg.id AND r.deleted_at IS NULL) as total_revenue
     FROM project_groups pg ${where}
     ORDER BY pg.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

// 詳細（メンバー案件つき）
router.get('/:id', async (req, res) => {
  const group = await queryOne(
    `SELECT pg.*,
       (SELECT COALESCE(SUM(pu.amount), 0) FROM purchases pu WHERE pu.group_id = pg.id AND pu.deleted_at IS NULL) as total_purchase,
       (SELECT COALESCE(SUM(r.amount), 0) FROM revenues r WHERE r.group_id = pg.id AND r.deleted_at IS NULL) as total_revenue
     FROM project_groups pg WHERE pg.id = ? AND pg.deleted_at IS NULL`, [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');

  const members = await queryAll(
    `SELECT p.id, p.gls_number, p.name, p.stage, c.name as customer_name
     FROM project_group_members pgm
     JOIN projects p ON p.id = pgm.project_id AND p.deleted_at IS NULL
     LEFT JOIN companies c ON c.id = p.customer_id
     WHERE pgm.group_id = ?
     ORDER BY p.gls_number`, [req.params.id]);

  // ⚠️ 仕入先名は vendors を正としつつ、消えたら companies へ落とす
  // （レビュー指摘・PR #207 4巡目・purchases.routes.ts と同じ理由）
  const purchases = await queryAll(
    `SELECT pu.*, COALESCE(v.name, vco.name) as vendor_name
     FROM purchases pu
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL
     LEFT JOIN companies vco ON vco.id = pu.vendor_id
     WHERE pu.group_id = ? AND pu.deleted_at IS NULL
     ORDER BY pu.created_at DESC`, [req.params.id]);

  // 仕入按分明細つき
  for (const pu of purchases as any[]) {
    pu.allocations = await queryAll(
      `SELECT pa.*, p.name as project_name, p.gls_number
       FROM purchase_allocations pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.purchase_id = ?`, [pu.id]);
  }

  // 売上（グループ按分）
  const revenues = await queryAll(
    `SELECT r.*, p.name as project_name, p.gls_number, c.name as customer_name
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN companies c ON c.id = r.customer_id
     WHERE r.group_id = ? AND r.deleted_at IS NULL
     ORDER BY r.created_at DESC`, [req.params.id]);

  for (const rev of revenues as any[]) {
    rev.items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [rev.id]);
    rev.allocations = await queryAll(
      `SELECT ra.*, p.name as project_name, p.gls_number
       FROM revenue_allocations ra
       JOIN projects p ON p.id = ra.project_id
       WHERE ra.revenue_id = ?`, [rev.id]);
  }

  res.json({ success: true, data: { ...group, members, purchases, revenues } });
});

// 新規作成
router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const { name, description, member_project_ids } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'グループ名は必須です');

  const id = uuidv4();
  await execute(
    `INSERT INTO project_groups (id, name, description, created_by) VALUES (?, ?, ?, ?)`,
    [id, name, description || null, req.user!.id]
  );

  if (member_project_ids && Array.isArray(member_project_ids)) {
    for (const pid of member_project_ids) {
      await execute(`INSERT INTO project_group_members (group_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [id, pid]);
    }
  }

  const group = await queryOne('SELECT * FROM project_groups WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: group });
});

// 更新
router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');

  const { name, description, member_project_ids } = req.body;
  await execute(
    `UPDATE project_groups SET name = ?, description = ?, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [name, description || null, req.user!.id, req.params.id]
  );

  // メンバーを差し替え
  if (member_project_ids && Array.isArray(member_project_ids)) {
    await execute('DELETE FROM project_group_members WHERE group_id = ?', [req.params.id]);
    for (const pid of member_project_ids) {
      await execute(`INSERT INTO project_group_members (group_id, project_id) VALUES (?, ?)`, [req.params.id, pid]);
    }
  }

  const group = await queryOne('SELECT * FROM project_groups WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: group });
});

// 削除
router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(`UPDATE project_groups SET deleted_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]);
  // グループ仕入・売上のgroup_idもクリア
  await execute(`UPDATE purchases SET group_id = NULL WHERE group_id = ?`, [req.params.id]);
  await execute(`UPDATE revenues SET group_id = NULL WHERE group_id = ?`, [req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

// グループ仕入登録（按分つき）
router.post('/:id/purchases', requirePermission('sales', 'editor'), async (req, res) => {
  const group = await queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');

  const { vendor_id, amount, description, tax_category, settlement_method, settlement_number,
          invoice_qualified, recognition_date, allocations } = req.body;
  if (!vendor_id) throw new AppError(400, 'VALIDATION_ERROR', '仕入先は必須です');
  // `vendor_id` は companies.id（Phase 3-2b）を直接指すため確かめる
  // （`purchases.routes.ts` の POST と同じ理由）
  await assertVendorCompanyId(vendor_id);
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '按分先を指定してください');
  }

  // 仕入レコード（project_id は按分先の最初の案件を代表として設定）
  const purchaseId = uuidv4();
  await execute(
    `INSERT INTO purchases (id, billing_key, project_id, group_id, vendor_id, assigned_to, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [purchaseId, null, allocations[0].project_id, req.params.id, vendor_id, req.user!.id,
     settlement_method || null, settlement_number || null, tax_category || 'tax10',
     invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
     amount || 0, description || null, recognition_date || null, req.user!.id]
  );

  // 按分明細
  for (const alloc of allocations) {
    await execute(
      `INSERT INTO purchase_allocations (id, purchase_id, project_id, allocated_amount) VALUES (?, ?, ?, ?)`,
      [uuidv4(), purchaseId, alloc.project_id, alloc.allocated_amount]
    );
  }

  const row = await queryOne(
    `SELECT pu.*, COALESCE(v.name, vco.name) as vendor_name FROM purchases pu
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL
     LEFT JOIN companies vco ON vco.id = pu.vendor_id WHERE pu.id = ?`,
    [purchaseId]
  );
  const allocs = await queryAll(
    `SELECT pa.*, p.name as project_name, p.gls_number FROM purchase_allocations pa JOIN projects p ON p.id = pa.project_id WHERE pa.purchase_id = ?`,
    [purchaseId]
  );
  res.status(201).json({ success: true, data: { ...row, allocations: allocs } });
});

// グループ売上登録（按分つき）
router.post('/:id/revenues', requirePermission('sales', 'editor'), async (req, res) => {
  const group = await queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');

  const { customer_id, tax_category, subtitle, recognition_date, billing_date, payment_due_date, notes, items, status: reqStatus, allocations } = req.body;
  if (!customer_id) throw new AppError(400, 'VALIDATION_ERROR', '顧客は必須です');
  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '按分先を指定してください');
  }

  const revenueStatus = reqStatus === 'estimate' ? 'estimate' : 'confirmed';
  const taxCat = tax_category || 'tax10';

  // billing_key生成
  const project = await queryOne('SELECT gls_number, code FROM projects WHERE id = ?', [allocations[0].project_id]) as any;
  // deleted_at でフィルタすると削除後に連番が再利用され billing_key が重複するため、
  // ソフトデリート分も含めて数える (連番は飛んでも一意性を優先)。
  const existingCount = (await queryOne(
    `SELECT COUNT(*) as c FROM revenues WHERE project_id = ?`,
    [allocations[0].project_id]
  ) as any).c;
  const seqNum = String(existingCount + 1).padStart(3, '0');
  const taxSuffix = taxBillingSuffix(taxCat);
  const estBase = (project?.code as string) || String(allocations[0].project_id).slice(0, 8);
  const billing_key = revenueStatus === 'estimate'
    ? `EST-${estBase}-${seqNum}-${taxSuffix}`
    : `${project?.gls_number || 'REV'}-${seqNum}-${taxSuffix}`;

  // 明細行がある場合は合計を計算
  const finalAmount = Array.isArray(items) && items.length > 0
    ? items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0)
    : 0;

  const revenueId = uuidv4();
  await execute(
    `INSERT INTO revenues (id, billing_key, project_id, group_id, customer_id, assigned_to, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, subtitle, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [revenueId, billing_key, allocations[0].project_id, req.params.id, customer_id, req.user!.id,
     taxCat, finalAmount, recognition_date || null, billing_date || null, payment_due_date || null,
     notes || null, subtitle || null, revenueStatus, req.user!.id]
  );

  // 明細行を保存
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await execute(
        `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), revenueId, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1]
      );
    }
  }

  // 按分明細
  for (const alloc of allocations) {
    await execute(
      `INSERT INTO revenue_allocations (id, revenue_id, project_id, allocated_amount) VALUES (?, ?, ?, ?)`,
      [uuidv4(), revenueId, alloc.project_id, alloc.allocated_amount]
    );
  }

  const row = await queryOne(
    `SELECT r.*, c.name as customer_name FROM revenues r LEFT JOIN companies c ON c.id = r.customer_id WHERE r.id = ?`,
    [revenueId]
  ) as any;
  row.items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [revenueId]);
  row.allocations = await queryAll(
    `SELECT ra.*, p.name as project_name, p.gls_number FROM revenue_allocations ra JOIN projects p ON p.id = ra.project_id WHERE ra.revenue_id = ?`,
    [revenueId]
  );
  res.status(201).json({ success: true, data: row });
});

// グループ仕入更新（按分つき）
router.put('/:id/purchases/:purchaseId', requirePermission('sales', 'editor'), async (req, res) => {
  const group = await queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');
  const existing = await queryOne('SELECT id FROM purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL', [req.params.purchaseId, req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');

  const { vendor_id, amount, description, tax_category, settlement_method, settlement_number,
          invoice_qualified, recognition_date, allocations } = req.body;
  // 新しく渡された vendor_id だけ確かめる（POST と同じ理由。既存値は再検証しない）
  if (vendor_id) await assertVendorCompanyId(vendor_id);

  await execute(
    `UPDATE purchases SET vendor_id=?, amount=?, description=?, tax_category=?, settlement_method=?, settlement_number=?, invoice_qualified=?, recognition_date=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [vendor_id, amount || 0, description || null, tax_category || 'tax10',
     settlement_method || null, settlement_number || null,
     invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
     recognition_date || null, req.user!.id, req.params.purchaseId]
  );

  // 按分明細を置換
  if (Array.isArray(allocations) && allocations.length > 0) {
    await execute('DELETE FROM purchase_allocations WHERE purchase_id = ?', [req.params.purchaseId]);
    for (const alloc of allocations) {
      await execute(
        `INSERT INTO purchase_allocations (id, purchase_id, project_id, allocated_amount) VALUES (?, ?, ?, ?)`,
        [uuidv4(), req.params.purchaseId, alloc.project_id, alloc.allocated_amount]
      );
    }
  }

  const row = await queryOne(
    `SELECT pu.*, COALESCE(v.name, vco.name) as vendor_name FROM purchases pu
     LEFT JOIN vendors v ON v.company_id = pu.vendor_id AND v.deleted_at IS NULL
     LEFT JOIN companies vco ON vco.id = pu.vendor_id WHERE pu.id = ?`,
    [req.params.purchaseId]
  );
  const allocs = await queryAll(
    `SELECT pa.*, p.name as project_name, p.gls_number FROM purchase_allocations pa JOIN projects p ON p.id = pa.project_id WHERE pa.purchase_id = ?`,
    [req.params.purchaseId]
  );
  res.json({ success: true, data: { ...row, allocations: allocs } });
});

// グループ仕入削除
router.delete('/:id/purchases/:purchaseId', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL', [req.params.purchaseId, req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入が見つかりません');

  await execute('DELETE FROM purchase_allocations WHERE purchase_id = ?', [req.params.purchaseId]);
  await execute(`UPDATE purchases SET deleted_at=NOW(), updated_by=? WHERE id=?`, [req.user!.id, req.params.purchaseId]);
  res.json({ success: true, message: '削除しました' });
});

// グループ売上更新（按分つき）
router.put('/:id/revenues/:revenueId', requirePermission('sales', 'editor'), async (req, res) => {
  const group = await queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', 'グループが見つかりません');
  const existing = await queryOne('SELECT * FROM revenues WHERE id = ? AND group_id = ? AND deleted_at IS NULL', [req.params.revenueId, req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

  const { customer_id, tax_category, subtitle, recognition_date, billing_date, notes, status: reqStatus, items, allocations } = req.body;

  const finalAmount = Array.isArray(items) && items.length > 0
    ? items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0)
    : existing.amount;

  await execute(
    `UPDATE revenues SET customer_id=?, tax_category=?, amount=?, recognition_date=?, billing_date=?, notes=?, subtitle=?, status=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [customer_id || existing.customer_id, tax_category || existing.tax_category, finalAmount,
     recognition_date || null, billing_date || null, notes || null,
     subtitle !== undefined ? (subtitle || null) : existing.subtitle,
     reqStatus || existing.status, req.user!.id, req.params.revenueId]
  );

  // 明細行を置換
  if (Array.isArray(items)) {
    // この口は品目名・数量・単価しか送ってこないが、DB には期間・補足・区分・単位・
    // 行ごとの仕入…と列がある。全置換なので、**送ってこない列は毎回消えていた**。
    // DELETE の前に読んで引き継ぐ。
    const carryover = await loadRevenueItemCarryover(String(req.params.revenueId), queryAll);

    await execute('DELETE FROM revenue_items WHERE revenue_id = ?', [req.params.revenueId]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const kept = carryover(it.description);
      await execute(
        `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order, period_start, period_end, item_notes, category, unit, cost_amount, cost_vendor_id, is_ai_suggested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), req.params.revenueId, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1,
         kept.period_start, kept.period_end, kept.item_notes, kept.category,
         kept.unit, kept.cost_amount, kept.cost_vendor_id, kept.is_ai_suggested]
      );
    }
  }

  // 按分明細を置換
  if (Array.isArray(allocations) && allocations.length > 0) {
    await execute('DELETE FROM revenue_allocations WHERE revenue_id = ?', [req.params.revenueId]);
    for (const alloc of allocations) {
      await execute(
        `INSERT INTO revenue_allocations (id, revenue_id, project_id, allocated_amount) VALUES (?, ?, ?, ?)`,
        [uuidv4(), req.params.revenueId, alloc.project_id, alloc.allocated_amount]
      );
    }
  }

  const row = await queryOne(
    `SELECT r.*, c.name as customer_name FROM revenues r LEFT JOIN companies c ON c.id = r.customer_id WHERE r.id = ?`,
    [req.params.revenueId]
  ) as any;
  row.items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.revenueId]);
  row.allocations = await queryAll(
    `SELECT ra.*, p.name as project_name, p.gls_number FROM revenue_allocations ra JOIN projects p ON p.id = ra.project_id WHERE ra.revenue_id = ?`,
    [req.params.revenueId]
  );
  res.json({ success: true, data: row });
});

// グループ売上削除
router.delete('/:id/revenues/:revenueId', requirePermission('sales', 'manager'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM revenues WHERE id = ? AND group_id = ? AND deleted_at IS NULL', [req.params.revenueId, req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

  await execute('DELETE FROM revenue_allocations WHERE revenue_id = ?', [req.params.revenueId]);
  await execute('DELETE FROM revenue_items WHERE revenue_id = ?', [req.params.revenueId]);
  await execute(`UPDATE revenues SET deleted_at=NOW(), updated_by=? WHERE id=?`, [req.user!.id, req.params.revenueId]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
