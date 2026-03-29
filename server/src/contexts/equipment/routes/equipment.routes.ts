import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, getDb, saveDb } from '../../../shared/db/connection';

const router = Router();

// ============================================================
// EQコード発番
// ============================================================
function generateEqCode(): string {
  // 英数字 (紛らわしい文字除外: 0,O,I,1,L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const db = getDb();

  // Increment sequence counter
  db.run("UPDATE sequences SET counter = counter + 1 WHERE seq_name = 'eq_code'");
  const seq = queryOne("SELECT counter FROM sequences WHERE seq_name = 'eq_code'") as any;
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
  const existing = queryOne("SELECT id FROM equipment_items WHERE eq_code = ?", [`EQ-${code}`]);
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
router.get('/projects', (req: Request, res: Response) => {
  const { search } = req.query;
  let sql = `
    SELECT id, gls_number, name, status
    FROM projects
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];
  if (search) {
    sql += ' AND (gls_number LIKE ? OR name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }
  sql += ' ORDER BY created_at DESC LIMIT 50';
  const rows = queryAll(sql, params);
  res.json({ success: true, data: rows });
});

// ============================================================
// 設置/保管場所 CRUD
// ============================================================
router.get('/locations', (_req: Request, res: Response) => {
  const rows = queryAll(
    "SELECT * FROM equipment_locations WHERE deleted_at IS NULL ORDER BY sort_order, name"
  );
  res.json({ success: true, data: rows });
});

router.post('/locations', (req: Request, res: Response) => {
  const { name, description, building, floor, area, sort_order } = req.body;
  const id = uuid();
  execute(
    "INSERT INTO equipment_locations (id, name, description, building, floor, area, sort_order) VALUES (?,?,?,?,?,?,?)",
    [id, name, description || null, building || null, floor || null, area || null, sort_order || 0]
  );
  saveDb();
  res.status(201).json({ success: true, data: { id } });
});

router.put('/locations/:id', (req: Request, res: Response) => {
  const { name, description, building, floor, area, sort_order } = req.body;
  execute(
    "UPDATE equipment_locations SET name=?, description=?, building=?, floor=?, area=?, sort_order=?, updated_at=datetime('now') WHERE id=?",
    [name, description || null, building || null, floor || null, area || null, sort_order || 0, req.params.id]
  );
  saveDb();
  res.json({ success: true });
});

router.delete('/locations/:id', (req: Request, res: Response) => {
  execute("UPDATE equipment_locations SET deleted_at=datetime('now') WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ============================================================
// カテゴリ CRUD
// ============================================================
router.get('/categories', (_req: Request, res: Response) => {
  const rows = queryAll(
    "SELECT * FROM equipment_categories WHERE deleted_at IS NULL ORDER BY sort_order, name"
  );
  res.json({ success: true, data: rows });
});

router.post('/categories', (req: Request, res: Response) => {
  const { name, item_type, parent_id, sort_order } = req.body;
  const id = uuid();
  execute(
    "INSERT INTO equipment_categories (id, name, item_type, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)",
    [id, name, item_type || 'both', parent_id || null, sort_order || 0]
  );
  saveDb();
  res.status(201).json({ success: true, data: { id } });
});

router.put('/categories/:id', (req: Request, res: Response) => {
  const { name, item_type, parent_id, sort_order } = req.body;
  execute(
    "UPDATE equipment_categories SET name=?, item_type=?, parent_id=?, sort_order=?, updated_at=datetime('now') WHERE id=?",
    [name, item_type, parent_id || null, sort_order || 0, req.params.id]
  );
  saveDb();
  res.json({ success: true });
});

router.delete('/categories/:id', (req: Request, res: Response) => {
  execute("UPDATE equipment_categories SET deleted_at=datetime('now') WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ============================================================
// 機材アイテム CRUD
// ============================================================
router.get('/items', (req: Request, res: Response) => {
  const { item_type, category_id, status, search, is_lendable, limit, offset } = req.query;
  let sql = `
    SELECT ei.*, ec.name as category_name
    FROM equipment_items ei
    LEFT JOIN equipment_categories ec ON ec.id = ei.category_id AND ec.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (item_type) { sql += ' AND ei.item_type = ?'; params.push(item_type); }
  if (category_id) { sql += ' AND ei.category_id = ?'; params.push(category_id); }
  if (status) { sql += ' AND ei.status = ?'; params.push(status); }
  if (is_lendable) { sql += ' AND ei.is_lendable = 1'; }
  if (search) {
    sql += ' AND (ei.name LIKE ? OR ei.eq_code LIKE ? OR ei.manufacturer LIKE ? OR ei.model_number LIKE ? OR ei.serial_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  // Count
  const countSql = sql.replace(/SELECT ei\.\*, ec\.name as category_name/, 'SELECT COUNT(*) as total');
  const countRow = queryOne(countSql, params) as any;

  sql += ' ORDER BY ei.created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  if (offset) { sql += ' OFFSET ?'; params.push(Number(offset)); }

  const rows = queryAll(sql, params);

  // Append lending status for lendable items
  for (const row of rows as any[]) {
    if (row.is_lendable) {
      const lending = queryOne(
        "SELECT id, borrower_name, project_id, lent_at, due_date FROM equipment_lendings WHERE equipment_id = ? AND status = 'lent' ORDER BY lent_at DESC LIMIT 1",
        [row.id]
      );
      (row as any).current_lending = lending || null;
    }
  }

  res.json({ success: true, data: rows, meta: { total: countRow?.total || 0 } });
});

router.get('/items/:id', (req: Request, res: Response) => {
  const item = queryOne(`
    SELECT ei.*, ec.name as category_name
    FROM equipment_items ei
    LEFT JOIN equipment_categories ec ON ec.id = ei.category_id
    WHERE ei.id = ? AND ei.deleted_at IS NULL
  `, [req.params.id]);

  if (!item) return res.status(404).json({ success: false, error: { message: '機材が見つかりません' } });

  // Attach related data
  const lendings = queryAll(
    "SELECT * FROM equipment_lendings WHERE equipment_id = ? ORDER BY lent_at DESC LIMIT 20",
    [req.params.id]
  );
  const maintenance = queryAll(
    "SELECT * FROM maintenance_records WHERE equipment_id = ? ORDER BY reported_at DESC LIMIT 20",
    [req.params.id]
  );
  const accessories = queryAll(`
    SELECT ea.*, ei.name as child_name, ei.eq_code as child_eq_code
    FROM equipment_accessories ea
    JOIN equipment_items ei ON ei.id = ea.child_id
    WHERE ea.parent_id = ? AND ei.deleted_at IS NULL
  `, [req.params.id]);

  // Check if this item is an accessory of something
  const parentOf = queryAll(`
    SELECT ea.*, ei.name as parent_name, ei.eq_code as parent_eq_code
    FROM equipment_accessories ea
    JOIN equipment_items ei ON ei.id = ea.parent_id
    WHERE ea.child_id = ? AND ei.deleted_at IS NULL
  `, [req.params.id]);

  res.json({
    success: true,
    data: {
      ...(item as any),
      lendings,
      maintenance,
      accessories,
      parent_of: parentOf,
    },
  });
});

router.post('/items', (req: Request, res: Response) => {
  const id = uuid();
  const eq_code = generateEqCode();
  const {
    name, category_id, item_type,
    manufacturer, model_number, serial_number, description, image_url,
    asset_number, acquisition_date, acquisition_cost, depreciation_method, useful_life, book_value, asset_class,
    status, condition, location_id, location_detail, notes,
    is_lendable, lending_rules,
  } = req.body;

  execute(`
    INSERT INTO equipment_items (
      id, eq_code, name, category_id, item_type,
      manufacturer, model_number, serial_number, description, image_url,
      asset_number, acquisition_date, acquisition_cost, depreciation_method, useful_life, book_value, asset_class,
      status, condition, location_id, location_detail, notes,
      is_lendable, lending_rules,
      created_by, updated_by
    ) VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?, ?,?, ?,?)
  `, [
    id, eq_code, name, category_id || null, item_type || 'facility',
    manufacturer || null, model_number || null, serial_number || null, description || null, image_url || null,
    asset_number || null, acquisition_date || null, acquisition_cost || null, depreciation_method || null, useful_life || null, book_value || null, asset_class || 'fixed_asset',
    status || 'active', condition || 'good', location_id || null, location_detail || null, notes || null,
    is_lendable ? 1 : 0, lending_rules || null,
    (req as any).user?.id || null, (req as any).user?.id || null,
  ]);
  saveDb();
  res.status(201).json({ success: true, data: { id, eq_code } });
});

router.put('/items/:id', (req: Request, res: Response) => {
  const {
    name, category_id, item_type,
    manufacturer, model_number, serial_number, description, image_url,
    asset_number, acquisition_date, acquisition_cost, depreciation_method, useful_life, book_value, asset_class,
    status, condition, location_id, location_detail, notes,
    is_lendable, lending_rules,
  } = req.body;

  execute(`
    UPDATE equipment_items SET
      name=?, category_id=?, item_type=?,
      manufacturer=?, model_number=?, serial_number=?, description=?, image_url=?,
      asset_number=?, acquisition_date=?, acquisition_cost=?, depreciation_method=?, useful_life=?, book_value=?, asset_class=?,
      status=?, condition=?, location_id=?, location_detail=?, notes=?,
      is_lendable=?, lending_rules=?,
      updated_by=?, updated_at=datetime('now')
    WHERE id=? AND deleted_at IS NULL
  `, [
    name, category_id || null, item_type,
    manufacturer || null, model_number || null, serial_number || null, description || null, image_url || null,
    asset_number || null, acquisition_date || null, acquisition_cost || null, depreciation_method || null, useful_life || null, book_value || null, asset_class || 'fixed_asset',
    status || 'active', condition || 'good', location_id || null, location_detail || null, notes || null,
    is_lendable ? 1 : 0, lending_rules || null,
    (req as any).user?.id || null, req.params.id,
  ]);
  saveDb();
  res.json({ success: true });
});

router.delete('/items/:id', (req: Request, res: Response) => {
  execute("UPDATE equipment_items SET deleted_at=datetime('now'), updated_by=? WHERE id=?",
    [(req as any).user?.id || null, req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ============================================================
// 貸出管理
// ============================================================
router.get('/lendings', (req: Request, res: Response) => {
  const { status, equipment_id, project_id } = req.query;
  let sql = `
    SELECT el.*, ei.name as equipment_name, ei.eq_code,
           p.name as project_name, p.gls_number
    FROM equipment_lendings el
    JOIN equipment_items ei ON ei.id = el.equipment_id
    LEFT JOIN projects p ON p.id = el.project_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (status) { sql += ' AND el.status = ?'; params.push(status); }
  if (equipment_id) { sql += ' AND el.equipment_id = ?'; params.push(equipment_id); }
  if (project_id) { sql += ' AND el.project_id = ?'; params.push(project_id); }
  sql += ' ORDER BY el.lent_at DESC';

  const rows = queryAll(sql, params);
  res.json({ success: true, data: rows });
});

router.post('/lendings', (req: Request, res: Response) => {
  const id = uuid();
  const { equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes } = req.body;

  // Check item is lendable and not already lent
  const item = queryOne("SELECT id, is_lendable, name FROM equipment_items WHERE id = ? AND deleted_at IS NULL", [equipment_id]) as any;
  if (!item) return res.status(404).json({ success: false, error: { message: '機材が見つかりません' } });

  const activeLending = queryOne(
    "SELECT id FROM equipment_lendings WHERE equipment_id = ? AND status = 'lent'",
    [equipment_id]
  );
  if (activeLending) return res.status(400).json({ success: false, error: { message: 'この機材は貸出中です' } });

  execute(`
    INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes, status, lent_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `, [id, equipment_id, project_id || null, borrower_name, purpose || null, lent_at, due_date || null, condition_out || null, notes || null, 'lent', (req as any).user?.id || null]);
  saveDb();
  res.status(201).json({ success: true, data: { id } });
});

router.put('/lendings/:id/return', (req: Request, res: Response) => {
  const { condition_in, notes } = req.body;
  execute(`
    UPDATE equipment_lendings SET
      status='returned', returned_at=datetime('now'), condition_in=?, notes=COALESCE(?, notes),
      returned_by=?, updated_at=datetime('now')
    WHERE id=? AND status='lent'
  `, [condition_in || null, notes || null, (req as any).user?.id || null, req.params.id]);
  saveDb();
  res.json({ success: true });
});

router.delete('/lendings/:id', (req: Request, res: Response) => {
  execute("DELETE FROM equipment_lendings WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ============================================================
// メンテナンス記録
// ============================================================
router.get('/maintenance', (req: Request, res: Response) => {
  const { equipment_id, status, record_type } = req.query;
  let sql = `
    SELECT mr.*, ei.name as equipment_name, ei.eq_code
    FROM maintenance_records mr
    JOIN equipment_items ei ON ei.id = mr.equipment_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (equipment_id) { sql += ' AND mr.equipment_id = ?'; params.push(equipment_id); }
  if (status) { sql += ' AND mr.status = ?'; params.push(status); }
  if (record_type) { sql += ' AND mr.record_type = ?'; params.push(record_type); }
  sql += ' ORDER BY mr.reported_at DESC';

  const rows = queryAll(sql, params);
  res.json({ success: true, data: rows });
});

router.post('/maintenance', (req: Request, res: Response) => {
  const id = uuid();
  const { equipment_id, record_type, title, description, assigned_to, vendor_name, repair_cost } = req.body;

  execute(`
    INSERT INTO maintenance_records (id, equipment_id, record_type, title, description, reported_by, assigned_to, vendor_name, repair_cost, status)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `, [id, equipment_id, record_type, title, description || null, (req as any).user?.id || null, assigned_to || null, vendor_name || null, repair_cost || null, 'reported']);

  // If breakdown, update equipment status
  if (record_type === 'breakdown') {
    execute("UPDATE equipment_items SET status='in_repair', updated_at=datetime('now') WHERE id=?", [equipment_id]);
  }
  saveDb();
  res.status(201).json({ success: true, data: { id } });
});

router.put('/maintenance/:id', (req: Request, res: Response) => {
  const { title, description, assigned_to, vendor_name, repair_cost, status, result, started_at, completed_at } = req.body;

  execute(`
    UPDATE maintenance_records SET
      title=?, description=?, assigned_to=?, vendor_name=?, repair_cost=?,
      status=?, result=?, started_at=?, completed_at=?, updated_at=datetime('now')
    WHERE id=?
  `, [title, description || null, assigned_to || null, vendor_name || null, repair_cost || null, status, result || null, started_at || null, completed_at || null, req.params.id]);

  // If completed, restore equipment to active
  if (status === 'completed') {
    const record = queryOne("SELECT equipment_id FROM maintenance_records WHERE id=?", [req.params.id]) as any;
    if (record) {
      execute("UPDATE equipment_items SET status='active', updated_at=datetime('now') WHERE id=? AND status='in_repair'", [record.equipment_id]);
    }
  }
  saveDb();
  res.json({ success: true });
});

// ============================================================
// 棚卸し
// ============================================================
router.get('/inventory-checks', (_req: Request, res: Response) => {
  const rows = queryAll("SELECT * FROM inventory_checks ORDER BY check_date DESC");
  res.json({ success: true, data: rows });
});

router.post('/inventory-checks', (req: Request, res: Response) => {
  const id = uuid();
  const { title, check_date, notes } = req.body;

  execute(
    "INSERT INTO inventory_checks (id, title, check_date, status, checked_by, notes) VALUES (?,?,?,?,?,?)",
    [id, title, check_date, 'draft', (req as any).user?.id || null, notes || null]
  );

  // Auto-populate check items from active equipment
  const items = queryAll(
    "SELECT id, location_id, location_detail FROM equipment_items WHERE deleted_at IS NULL AND status != 'disposed'"
  );
  for (const item of items as any[]) {
    const ciId = uuid();
    const expectedLoc = [item.location_id, item.location_detail].filter(Boolean).join(' / ') || null;
    execute(
      "INSERT INTO inventory_check_items (id, check_id, equipment_id, expected_location) VALUES (?,?,?,?)",
      [ciId, id, item.id, expectedLoc]
    );
  }
  saveDb();
  res.status(201).json({ success: true, data: { id } });
});

router.get('/inventory-checks/:id', (req: Request, res: Response) => {
  const check = queryOne("SELECT * FROM inventory_checks WHERE id=?", [req.params.id]);
  if (!check) return res.status(404).json({ success: false, error: { message: '棚卸しが見つかりません' } });

  const items = queryAll(`
    SELECT ici.*, ei.name as equipment_name, ei.eq_code, ei.location_detail
    FROM inventory_check_items ici
    JOIN equipment_items ei ON ei.id = ici.equipment_id
    WHERE ici.check_id = ?
    ORDER BY ei.name
  `, [req.params.id]);

  res.json({ success: true, data: { ...(check as any), items } });
});

router.put('/inventory-checks/:id/items/:itemId', (req: Request, res: Response) => {
  const { found, actual_location, condition, note } = req.body;
  execute(`
    UPDATE inventory_check_items SET found=?, actual_location=?, condition=?, note=?, checked_at=datetime('now')
    WHERE id=? AND check_id=?
  `, [found, actual_location || null, condition || null, note || null, req.params.itemId, req.params.id]);
  saveDb();
  res.json({ success: true });
});

router.put('/inventory-checks/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  execute("UPDATE inventory_checks SET status=?, updated_at=datetime('now') WHERE id=?", [status, req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ============================================================
// ダッシュボード統計
// ============================================================
router.get('/stats', (_req: Request, res: Response) => {
  const totalItems = queryOne("SELECT COUNT(*) as count FROM equipment_items WHERE deleted_at IS NULL") as any;
  const activeItems = queryOne("SELECT COUNT(*) as count FROM equipment_items WHERE deleted_at IS NULL AND status='active'") as any;
  const inRepair = queryOne("SELECT COUNT(*) as count FROM equipment_items WHERE deleted_at IS NULL AND status='in_repair'") as any;
  const lentOut = queryOne("SELECT COUNT(*) as count FROM equipment_lendings WHERE status='lent'") as any;
  const overdue = queryOne("SELECT COUNT(*) as count FROM equipment_lendings WHERE status='lent' AND due_date < date('now')") as any;
  const totalAssetValue = queryOne("SELECT COALESCE(SUM(acquisition_cost), 0) as total FROM equipment_items WHERE deleted_at IS NULL AND asset_class='fixed_asset'") as any;
  const openMaintenance = queryOne("SELECT COUNT(*) as count FROM maintenance_records WHERE status IN ('reported', 'in_progress')") as any;

  res.json({
    success: true,
    data: {
      total_items: totalItems?.count || 0,
      active_items: activeItems?.count || 0,
      in_repair: inRepair?.count || 0,
      lent_out: lentOut?.count || 0,
      overdue: overdue?.count || 0,
      total_asset_value: totalAssetValue?.total || 0,
      open_maintenance: openMaintenance?.count || 0,
    },
  });
});

// ============================================================
// 付属品管理
// ============================================================
router.post('/items/:id/accessories', (req: Request, res: Response) => {
  const id = uuid();
  const { child_id, note } = req.body;
  execute("INSERT OR IGNORE INTO equipment_accessories (id, parent_id, child_id, note) VALUES (?,?,?,?)",
    [id, req.params.id, child_id, note || null]);
  saveDb();
  res.status(201).json({ success: true, data: { id } });
});

router.delete('/items/:id/accessories/:childId', (req: Request, res: Response) => {
  execute("DELETE FROM equipment_accessories WHERE parent_id=? AND child_id=?",
    [req.params.id, req.params.childId]);
  saveDb();
  res.json({ success: true });
});

export default router;
