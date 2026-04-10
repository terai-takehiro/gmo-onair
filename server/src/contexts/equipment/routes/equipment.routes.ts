import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('equipment'));

// ============================================================
// EQコード発番
// ============================================================
async function generateEqCode(): Promise<string> {
  // 英数字 (紛らわしい文字除外: 0,O,I,1,L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  // Increment sequence counter
  await execute("UPDATE sequences SET counter = counter + 1 WHERE seq_name = 'eq_code'");
  const seq = await queryOne("SELECT counter FROM sequences WHERE seq_name = 'eq_code'") as any;
  const counter = seq?.counter || Date.now();

  // Generate deterministic-ish but random-looking code
  let code = '';
  let seed = counter;
  for (let i = 0; i < 10; i++) {
    // Mix counter with position for uniqueness
    const idx = (seed * 31 + i * 7 + counter) % chars.length;
    code += chars[Math.abs(idx) % chars.length];
    seed = Math.floor(seed / chars.length) + counter + i;
  }

  // Fallback: if collision, use random
  const existing = await queryOne("SELECT id FROM equipment_items WHERE eq_code = $1", [`EQ-${code}`]);
  if (existing) {
    code = '';
    for (let i = 0; i < 10; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  return `EQ-${code}`;
}

// ============================================================
// GLS案件検索 (貸出時に紐づけるため)
// ============================================================
router.get('/projects', async (req: Request, res: Response) => {
  const { search } = req.query;
  let sql = `
    SELECT id, gls_number, name, stage
    FROM projects
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];
  let paramIndex = 1;
  if (search) {
    sql += ` AND (gls_number ILIKE $${paramIndex} OR name ILIKE $${paramIndex + 1})`;
    const s = `%${search}%`;
    params.push(s, s);
    paramIndex += 2;
  }
  sql += ' ORDER BY created_at DESC LIMIT 50';
  const rows = await queryAll(sql, params);
  res.json({ success: true, data: rows });
});

// ============================================================
// 設置/保管場所 CRUD
// ============================================================
router.get('/locations', async (_req: Request, res: Response) => {
  const rows = await queryAll(
    "SELECT * FROM equipment_locations WHERE deleted_at IS NULL ORDER BY sort_order, name"
  );
  res.json({ success: true, data: rows });
});

router.post('/locations', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  const { name, description, building, floor, area, sort_order } = req.body;
  const id = uuid();
  await execute(
    "INSERT INTO equipment_locations (id, name, description, building, floor, area, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, name, description || null, building || null, floor || null, area || null, sort_order || 0]
  );
  res.status(201).json({ success: true, data: { id } });
});

router.put('/locations/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  const { name, description, building, floor, area, sort_order } = req.body;
  await execute(
    "UPDATE equipment_locations SET name=$1, description=$2, building=$3, floor=$4, area=$5, sort_order=$6, updated_at=NOW() WHERE id=$7",
    [name, description || null, building || null, floor || null, area || null, sort_order || 0, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/locations/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  await execute("UPDATE equipment_locations SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// カテゴリ CRUD
// ============================================================
router.get('/categories', async (_req: Request, res: Response) => {
  const rows = await queryAll(
    "SELECT * FROM equipment_categories WHERE deleted_at IS NULL ORDER BY sort_order, name"
  );
  res.json({ success: true, data: rows });
});

router.post('/categories', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  const { name, item_type, parent_id, sort_order } = req.body;
  const id = uuid();
  await execute(
    "INSERT INTO equipment_categories (id, name, item_type, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5)",
    [id, name, item_type || 'both', parent_id || null, sort_order || 0]
  );
  res.status(201).json({ success: true, data: { id } });
});

router.put('/categories/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  const { name, item_type, parent_id, sort_order } = req.body;
  await execute(
    "UPDATE equipment_categories SET name=$1, item_type=$2, parent_id=$3, sort_order=$4, updated_at=NOW() WHERE id=$5",
    [name, item_type, parent_id || null, sort_order || 0, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/categories/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  await execute("UPDATE equipment_categories SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// 機材アイテム CRUD
// ============================================================
router.get('/items', async (req: Request, res: Response) => {
  const { item_type, category_id, status, search, is_lendable, limit, offset } = req.query;
  let sql = `
    SELECT ei.*, ec.name as category_name
    FROM equipment_items ei
    LEFT JOIN equipment_categories ec ON ec.id = ei.category_id AND ec.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
  `;
  const params: any[] = [];
  let paramIndex = 1;

  if (item_type) { sql += ` AND ei.item_type = $${paramIndex++}`; params.push(item_type); }
  if (category_id) { sql += ` AND ei.category_id = $${paramIndex++}`; params.push(category_id); }
  if (status) { sql += ` AND ei.status = $${paramIndex++}`; params.push(status); }
  if (is_lendable) { sql += ' AND ei.is_lendable = 1'; }
  if (search) {
    sql += ` AND (ei.name ILIKE $${paramIndex} OR ei.eq_code ILIKE $${paramIndex + 1} OR ei.manufacturer ILIKE $${paramIndex + 2} OR ei.model_number ILIKE $${paramIndex + 3} OR ei.serial_number ILIKE $${paramIndex + 4})`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
    paramIndex += 5;
  }

  // Count
  const countSql = sql.replace(/SELECT ei\.\*, ec\.name as category_name/, 'SELECT COUNT(*) as total');
  const countRow = await queryOne(countSql, params) as any;

  sql += ' ORDER BY ec.sort_order, ec.name, ei.name, ei.unit_number';
  if (limit) { sql += ` LIMIT $${paramIndex++}`; params.push(Number(limit)); }
  if (offset) { sql += ` OFFSET $${paramIndex++}`; params.push(Number(offset)); }

  const rows = await queryAll(sql, params);

  // Append lending status for lendable items
  for (const row of rows as any[]) {
    if (row.is_lendable) {
      const lending = await queryOne(
        "SELECT id, borrower_name, project_id, lent_at, due_date FROM equipment_lendings WHERE equipment_id = $1 AND status = 'lent' ORDER BY lent_at DESC LIMIT 1",
        [row.id]
      );
      (row as any).current_lending = lending || null;
    }
  }

  res.json({ success: true, data: rows, meta: { total: countRow?.total || 0 } });
});

// CSV Export (must be before /items/:id to avoid route conflict)
router.get('/items/export', requirePermission('equipment', 'exporter'), async (_req: Request, res: Response) => {
  const rows = await queryAll(`
    SELECT ei.eq_code, ei.name, ec.name as category_name, ei.item_type,
           ei.manufacturer, ei.model_number, ei.serial_number, ei.status, ei.condition, ei.location_detail as location
    FROM equipment_items ei
    LEFT JOIN equipment_categories ec ON ec.id = ei.category_id AND ec.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
    ORDER BY ec.sort_order, ec.name, ei.name, ei.unit_number
  `) as Record<string, unknown>[];
  const columns = ['eq_code', 'name', 'category_name', 'item_type', 'manufacturer', 'model_number', 'serial_number', 'status', 'condition', 'location'];
  csvResponse(res, 'equipment_items.csv', generateCsv(rows, columns));
});

router.get('/items/:id', async (req: Request, res: Response) => {
  const item = await queryOne(`
    SELECT ei.*, ec.name as category_name
    FROM equipment_items ei
    LEFT JOIN equipment_categories ec ON ec.id = ei.category_id
    WHERE ei.id = $1 AND ei.deleted_at IS NULL
  `, [req.params.id]);

  if (!item) return res.status(404).json({ success: false, error: { message: '機材が見つかりません' } });

  // Attach related data
  const lendings = await queryAll(
    "SELECT * FROM equipment_lendings WHERE equipment_id = $1 ORDER BY lent_at DESC LIMIT 20",
    [req.params.id]
  );
  const maintenance = await queryAll(
    "SELECT * FROM maintenance_records WHERE equipment_id = $1 ORDER BY reported_at DESC LIMIT 20",
    [req.params.id]
  );
  const accessories = await queryAll(`
    SELECT ea.*, ei.name as child_name, ei.eq_code as child_eq_code
    FROM equipment_accessories ea
    JOIN equipment_items ei ON ei.id = ea.child_id
    WHERE ea.parent_id = $1 AND ei.deleted_at IS NULL
  `, [req.params.id]);

  // Check if this item is an accessory of something
  const parentOf = await queryAll(`
    SELECT ea.*, ei.name as parent_name, ei.eq_code as parent_eq_code
    FROM equipment_accessories ea
    JOIN equipment_items ei ON ei.id = ea.parent_id
    WHERE ea.child_id = $1 AND ei.deleted_at IS NULL
  `, [req.params.id]);

  // 子機材（ケース/セットのグルーピング）
  const children = await queryAll(`
    SELECT id, eq_code, name, status, condition
    FROM equipment_items
    WHERE parent_id = $1 AND deleted_at IS NULL
    ORDER BY name
  `, [req.params.id]);

  // 親機材（この機材がセットに含まれている場合）
  const parent = (item as any).parent_id
    ? await queryOne(`SELECT id, eq_code, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL`, [(item as any).parent_id])
    : null;

  res.json({
    success: true,
    data: {
      ...(item as any),
      lendings,
      maintenance,
      accessories,
      parent_of: parentOf,
      children,
      parent,
    },
  });
});

router.post('/items', async (req: Request, res: Response) => {
  const id = uuid();
  const eq_code = await generateEqCode();
  const {
    name, category_id, item_type, unit_number, parent_id,
    manufacturer, model_number, serial_number, description, image_url,
    asset_number, acquisition_date, acquisition_cost, depreciation_method, useful_life, book_value, asset_class,
    status, condition, location_id, location_detail, notes,
    is_lendable, lending_rules,
  } = req.body;

  await execute(`
    INSERT INTO equipment_items (
      id, eq_code, name, category_id, item_type, unit_number, parent_id,
      manufacturer, model_number, serial_number, description, image_url,
      asset_number, acquisition_date, acquisition_cost, depreciation_method, useful_life, book_value, asset_class,
      status, condition, location_id, location_detail, notes,
      is_lendable, lending_rules,
      created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7, $8,$9,$10,$11,$12, $13,$14,$15,$16,$17,$18,$19, $20,$21,$22,$23,$24, $25,$26, $27,$28)
  `, [
    id, eq_code, name, category_id || null, item_type || 'facility', unit_number || null, parent_id || null,
    manufacturer || null, model_number || null, serial_number || null, description || null, image_url || null,
    asset_number || null, acquisition_date || null, acquisition_cost || null, depreciation_method || null, useful_life || null, book_value || null, asset_class || 'fixed_asset',
    status || 'active', condition || 'good', location_id || null, location_detail || null, notes || null,
    is_lendable ? 1 : 0, lending_rules || null,
    (req as any).user?.id || null, (req as any).user?.id || null,
  ]);
  res.status(201).json({ success: true, data: { id, eq_code } });
});

router.put('/items/:id', async (req: Request, res: Response) => {
  const {
    name, category_id, item_type, unit_number, parent_id,
    manufacturer, model_number, serial_number, description, image_url,
    asset_number, acquisition_date, acquisition_cost, depreciation_method, useful_life, book_value, asset_class,
    status, condition, location_id, location_detail, notes,
    is_lendable, lending_rules,
  } = req.body;

  await execute(`
    UPDATE equipment_items SET
      name=$1, category_id=$2, item_type=$3, unit_number=$4, parent_id=$5,
      manufacturer=$6, model_number=$7, serial_number=$8, description=$9, image_url=$10,
      asset_number=$11, acquisition_date=$12, acquisition_cost=$13, depreciation_method=$14, useful_life=$15, book_value=$16, asset_class=$17,
      status=$18, condition=$19, location_id=$20, location_detail=$21, notes=$22,
      is_lendable=$23, lending_rules=$24,
      updated_by=$25, updated_at=NOW()
    WHERE id=$26 AND deleted_at IS NULL
  `, [
    name, category_id || null, item_type, unit_number || null, parent_id !== undefined ? (parent_id || null) : undefined,
    manufacturer || null, model_number || null, serial_number || null, description || null, image_url || null,
    asset_number || null, acquisition_date || null, acquisition_cost || null, depreciation_method || null, useful_life || null, book_value || null, asset_class || 'fixed_asset',
    status || 'active', condition || 'good', location_id || null, location_detail || null, notes || null,
    is_lendable ? 1 : 0, lending_rules || null,
    (req as any).user?.id || null, req.params.id,
  ]);
  res.json({ success: true });
});

router.delete('/items/:id', async (req: Request, res: Response) => {
  await execute("UPDATE equipment_items SET deleted_at=NOW(), updated_by=$1 WHERE id=$2",
    [(req as any).user?.id || null, req.params.id]);
  res.json({ success: true });
});

// ============================================================
// 貸出管理
// ============================================================
router.get('/lendings', async (req: Request, res: Response) => {
  const { status, equipment_id, project_id } = req.query;
  let sql = `
    SELECT el.*, ei.name as equipment_name, ei.eq_code, ei.unit_number,
           p.name as project_name, p.gls_number
    FROM equipment_lendings el
    JOIN equipment_items ei ON ei.id = el.equipment_id
    LEFT JOIN projects p ON p.id = el.project_id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramIndex = 1;
  if (status) { sql += ` AND el.status = $${paramIndex++}`; params.push(status); }
  if (equipment_id) { sql += ` AND el.equipment_id = $${paramIndex++}`; params.push(equipment_id); }
  if (project_id) { sql += ` AND el.project_id = $${paramIndex++}`; params.push(project_id); }
  sql += ' ORDER BY el.lent_at DESC';

  const rows = await queryAll(sql, params);
  res.json({ success: true, data: rows });
});

router.post('/lendings', async (req: Request, res: Response) => {
  const id = uuid();
  const { equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes } = req.body;

  // Check item is lendable and not already lent
  const item = await queryOne("SELECT id, is_lendable, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL", [equipment_id]) as any;
  if (!item) return res.status(404).json({ success: false, error: { message: '機材が見つかりません' } });

  const activeLending = await queryOne(
    "SELECT id FROM equipment_lendings WHERE equipment_id = $1 AND status = 'lent'",
    [equipment_id]
  );
  if (activeLending) return res.status(400).json({ success: false, error: { message: 'この機材は貸出中です' } });

  await execute(`
    INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes, status, lent_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [id, equipment_id, project_id || null, borrower_name, purpose || null, lent_at, due_date || null, condition_out || null, notes || null, 'lent', (req as any).user?.id || null]);
  res.status(201).json({ success: true, data: { id } });
});

router.put('/lendings/:id/return', async (req: Request, res: Response) => {
  const { condition_in, notes } = req.body;
  await execute(`
    UPDATE equipment_lendings SET
      status='returned', returned_at=NOW(), condition_in=$1, notes=COALESCE($2, notes),
      returned_by=$3, updated_at=NOW()
    WHERE id=$4 AND status='lent'
  `, [condition_in || null, notes || null, (req as any).user?.id || null, req.params.id]);
  res.json({ success: true });
});

router.delete('/lendings/:id', async (req: Request, res: Response) => {
  await execute("DELETE FROM equipment_lendings WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// メンテナンス記録
// ============================================================
router.get('/maintenance', async (req: Request, res: Response) => {
  const { equipment_id, status, record_type } = req.query;
  let sql = `
    SELECT mr.*, ei.name as equipment_name, ei.eq_code
    FROM maintenance_records mr
    JOIN equipment_items ei ON ei.id = mr.equipment_id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramIndex = 1;
  if (equipment_id) { sql += ` AND mr.equipment_id = $${paramIndex++}`; params.push(equipment_id); }
  if (status) { sql += ` AND mr.status = $${paramIndex++}`; params.push(status); }
  if (record_type) { sql += ` AND mr.record_type = $${paramIndex++}`; params.push(record_type); }
  sql += ' ORDER BY mr.reported_at DESC';

  const rows = await queryAll(sql, params);
  res.json({ success: true, data: rows });
});

router.post('/maintenance', async (req: Request, res: Response) => {
  const id = uuid();
  const { equipment_id, record_type, title, description, assigned_to, vendor_name, repair_cost } = req.body;

  await execute(`
    INSERT INTO maintenance_records (id, equipment_id, record_type, title, description, reported_by, assigned_to, vendor_name, repair_cost, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [id, equipment_id, record_type, title, description || null, (req as any).user?.id || null, assigned_to || null, vendor_name || null, repair_cost || null, 'reported']);

  // If breakdown, update equipment status
  if (record_type === 'breakdown') {
    await execute("UPDATE equipment_items SET status='in_repair', updated_at=NOW() WHERE id=$1", [equipment_id]);
  }
  res.status(201).json({ success: true, data: { id } });
});

router.put('/maintenance/:id', async (req: Request, res: Response) => {
  const { title, description, assigned_to, vendor_name, repair_cost, status, result, started_at, completed_at } = req.body;

  await execute(`
    UPDATE maintenance_records SET
      title=$1, description=$2, assigned_to=$3, vendor_name=$4, repair_cost=$5,
      status=$6, result=$7, started_at=$8, completed_at=$9, updated_at=NOW()
    WHERE id=$10
  `, [title, description || null, assigned_to || null, vendor_name || null, repair_cost || null, status, result || null, started_at || null, completed_at || null, req.params.id]);

  // If completed, restore equipment to active
  if (status === 'completed') {
    const record = await queryOne("SELECT equipment_id FROM maintenance_records WHERE id=$1", [req.params.id]) as any;
    if (record) {
      await execute("UPDATE equipment_items SET status='active', updated_at=NOW() WHERE id=$1 AND status='in_repair'", [record.equipment_id]);
    }
  }
  res.json({ success: true });
});

// ============================================================
// 棚卸し
// ============================================================
router.get('/inventory-checks', async (_req: Request, res: Response) => {
  const rows = await queryAll("SELECT * FROM inventory_checks ORDER BY check_date DESC");
  res.json({ success: true, data: rows });
});

router.post('/inventory-checks', async (req: Request, res: Response) => {
  const id = uuid();
  const { title, check_date, notes } = req.body;

  await execute(
    "INSERT INTO inventory_checks (id, title, check_date, status, checked_by, notes) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, title, check_date, 'draft', (req as any).user?.id || null, notes || null]
  );

  // Auto-populate check items from active equipment
  const items = await queryAll(
    "SELECT id, location_id, location_detail FROM equipment_items WHERE deleted_at IS NULL AND status != 'disposed'"
  );
  for (const item of items as any[]) {
    const ciId = uuid();
    const expectedLoc = [item.location_id, item.location_detail].filter(Boolean).join(' / ') || null;
    await execute(
      "INSERT INTO inventory_check_items (id, check_id, equipment_id, expected_location) VALUES ($1,$2,$3,$4)",
      [ciId, id, item.id, expectedLoc]
    );
  }
  res.status(201).json({ success: true, data: { id } });
});

router.get('/inventory-checks/:id', async (req: Request, res: Response) => {
  const check = await queryOne("SELECT * FROM inventory_checks WHERE id=$1", [req.params.id]);
  if (!check) return res.status(404).json({ success: false, error: { message: '棚卸しが見つかりません' } });

  const items = await queryAll(`
    SELECT ici.*, ei.name as equipment_name, ei.eq_code, ei.location_detail
    FROM inventory_check_items ici
    JOIN equipment_items ei ON ei.id = ici.equipment_id
    WHERE ici.check_id = $1
    ORDER BY ei.name
  `, [req.params.id]);

  res.json({ success: true, data: { ...(check as any), items } });
});

router.put('/inventory-checks/:id/items/:itemId', async (req: Request, res: Response) => {
  const { found, actual_location, condition, note } = req.body;
  await execute(`
    UPDATE inventory_check_items SET found=$1, actual_location=$2, condition=$3, note=$4, checked_at=NOW()
    WHERE id=$5 AND check_id=$6
  `, [found, actual_location || null, condition || null, note || null, req.params.itemId, req.params.id]);
  res.json({ success: true });
});

router.put('/inventory-checks/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  await execute("UPDATE inventory_checks SET status=$1, updated_at=NOW() WHERE id=$2", [status, req.params.id]);
  res.json({ success: true });
});

// ============================================================
// ダッシュボード統計
// ============================================================
router.get('/stats', async (_req: Request, res: Response) => {
  try {
  const toInt = (v: any) => parseInt(v?.count ?? v ?? '0', 10) || 0;

  const totalItems = await queryOne("SELECT COUNT(*) as count FROM equipment_items WHERE deleted_at IS NULL") as any;
  const activeItems = await queryOne("SELECT COUNT(*) as count FROM equipment_items WHERE deleted_at IS NULL AND status='active'") as any;
  const inRepair = await queryOne("SELECT COUNT(*) as count FROM equipment_items WHERE deleted_at IS NULL AND status='in_repair'") as any;
  const lentOut = await queryOne("SELECT COUNT(*) as count FROM equipment_lendings WHERE status='lent'") as any;
  const overdue = await queryOne("SELECT COUNT(*) as count FROM equipment_lendings WHERE status='lent' AND due_date < NOW()") as any;
  const totalAssetValue = await queryOne("SELECT COALESCE(SUM(acquisition_cost), 0) as total FROM equipment_items WHERE deleted_at IS NULL AND asset_class='fixed_asset'") as any;
  const openMaintenance = await queryOne("SELECT COUNT(*) as count FROM maintenance_records WHERE status IN ('reported', 'in_progress')") as any;

  // Recent active lendings for dashboard
  const recentLendings = await queryAll(
    `SELECT el.id, el.borrower_name, el.due_date, el.lent_at,
            ei.name as equipment_name, ei.unit_number,
            p.name as project_name, p.gls_number
     FROM equipment_lendings el
     JOIN equipment_items ei ON ei.id = el.equipment_id
     LEFT JOIN projects p ON p.id = el.project_id
     WHERE el.status = 'lent'
     ORDER BY el.lent_at DESC LIMIT 5`
  );

  // Recent maintenance (open)
  const recentMaintenance = await queryAll(
    `SELECT mr.id, mr.title, mr.record_type, mr.status, mr.created_at,
            ei.name as equipment_name
     FROM maintenance_records mr
     JOIN equipment_items ei ON ei.id = mr.equipment_id
     WHERE mr.status IN ('reported', 'in_progress')
     ORDER BY mr.created_at DESC LIMIT 5`
  );

  res.json({
    success: true,
    data: {
      total_items: toInt(totalItems),
      active_items: toInt(activeItems),
      in_repair: toInt(inRepair),
      lent_out: toInt(lentOut),
      overdue: toInt(overdue),
      total_asset_value: parseFloat(totalAssetValue?.total ?? '0') || 0,
      open_maintenance: toInt(openMaintenance),
      recent_lendings: recentLendings,
      recent_maintenance: recentMaintenance,
    },
  });
  } catch (err: any) {
    console.error('[equipment/stats] error:', err?.message, err?.stack);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err?.message || 'Stats query failed' } });
  }
});

// ============================================================
// 付属品管理
// ============================================================
router.post('/items/:id/accessories', async (req: Request, res: Response) => {
  const id = uuid();
  const { child_id, note } = req.body;
  await execute("INSERT INTO equipment_accessories (id, parent_id, child_id, note) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [id, req.params.id, child_id, note || null]);
  res.status(201).json({ success: true, data: { id } });
});

router.delete('/items/:id/accessories/:childId', async (req: Request, res: Response) => {
  await execute("DELETE FROM equipment_accessories WHERE parent_id=$1 AND child_id=$2",
    [req.params.id, req.params.childId]);
  res.json({ success: true });
});

export default router;
