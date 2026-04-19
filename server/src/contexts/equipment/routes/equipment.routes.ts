import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('equipment'));

// ============================================================
// EQコード発番 (Y-V-00001 形式)
// ============================================================
async function generateEqCode(locationCode: string, typeCode: string): Promise<string> {
  if (!locationCode || !typeCode) throw new Error('拠点コードと種別コードは必須です');
  const prefix = `${locationCode}-${typeCode}`;
  // numStart is inlined as a literal integer (safe: computed from .length, never from user string content)
  const numStart = prefix.length + 2; // "Y-A-000006" → SUBSTRING FROM 5 = "000006"

  // Step 1: find the actual max counter across ALL equipment_items (incl. soft-deleted)
  const maxRow = await queryOne(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(eq_code FROM ${numStart}) AS INTEGER)), 0) AS maxn
     FROM equipment_items WHERE eq_code LIKE $1`,
    [`${prefix}-%`]
  ) as any;
  const maxFromItems: number = maxRow?.maxn ?? 0;

  // Step 2: upsert sequence — ensure counter >= maxFromItems, then increment atomically
  const seq = await queryOne(`
    INSERT INTO equipment_id_sequences (prefix, counter) VALUES ($1, $2 + 1)
    ON CONFLICT (prefix) DO UPDATE
      SET counter = GREATEST(equipment_id_sequences.counter, $2) + 1
    RETURNING counter
  `, [prefix, maxFromItems]) as any;

  return `${prefix}-${String(seq?.counter ?? 1).padStart(6, '0')}`;
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
  const { name, description, building, floor, area, sort_order, is_rack, rack_units, rack_sort_order } = req.body;
  const id = uuid();
  await execute(
    `INSERT INTO equipment_locations (id, name, description, building, floor, area, sort_order, is_rack, rack_units, rack_sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, name, description || null, building || null, floor || null, area || null, sort_order || 0,
     is_rack ?? false, is_rack ? (rack_units || null) : null, rack_sort_order || 0]
  );
  res.status(201).json({ success: true, data: { id } });
});

router.put('/locations/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  const { name, description, building, floor, area, sort_order, is_rack, rack_units, rack_sort_order } = req.body;
  await execute(
    `UPDATE equipment_locations
     SET name=$1, description=$2, building=$3, floor=$4, area=$5, sort_order=$6,
         is_rack=$7, rack_units=$8, rack_sort_order=$9, updated_at=NOW()
     WHERE id=$10`,
    [name, description || null, building || null, floor || null, area || null, sort_order || 0,
     is_rack ?? false, is_rack ? (rack_units || null) : null, rack_sort_order || 0, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/locations/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  await execute("UPDATE equipment_locations SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// 機材アイテム CRUD
// ============================================================
router.get('/items', async (req: Request, res: Response) => {
  const { status, search, limit, offset, equipment_section, equipment_type_code, include_children, parent_id } = req.query;
  let sql = `
    SELECT ei.*,
           em.name as manufacturer_name,
           el.name as location_name,
           el.is_rack as location_is_rack, el.rack_units as location_rack_units,
           p.eq_code as parent_eq_code, p.name as parent_name,
           ec.color_hex, ec.name as color_name,
           CASE WHEN ei.purchased_at IS NOT NULL AND ei.warranty_years > 0
                THEN (ei.purchased_at + (ei.warranty_years || ' years')::interval)::date
                ELSE NULL END as warranty_end,
           (SELECT COUNT(*)::int FROM equipment_items c WHERE c.parent_id = ei.id AND c.deleted_at IS NULL) AS children_count
    FROM equipment_items ei
    LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    LEFT JOIN equipment_items p ON p.id = ei.parent_id AND p.deleted_at IS NULL
    LEFT JOIN equipment_colors ec ON ec.id = ei.color_id AND ec.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
  `;
  const params: any[] = [];
  let paramIndex = 1;

  if (parent_id) {
    sql += ` AND ei.parent_id = $${paramIndex++}`;
    params.push(parent_id);
  } else if (include_children !== '1') {
    sql += ` AND ei.parent_id IS NULL`;
  }
  if (status) { sql += ` AND ei.status = $${paramIndex++}`; params.push(status); }
  if (equipment_section) { sql += ` AND ei.equipment_section = $${paramIndex++}`; params.push(equipment_section); }
  if (equipment_type_code) { sql += ` AND ei.equipment_type_code = $${paramIndex++}`; params.push(equipment_type_code); }
  if (search) {
    sql += ` AND (ei.name ILIKE $${paramIndex} OR ei.eq_code ILIKE $${paramIndex + 1} OR em.name ILIKE $${paramIndex + 2} OR ei.model_number ILIKE $${paramIndex + 3} OR ei.serial_number ILIKE $${paramIndex + 4})`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
    paramIndex += 5;
  }

  // Count (wrap full query to preserve all JOINs/WHERE conditions)
  const countSql = `SELECT COUNT(*) as total FROM (${sql}) _cnt`;
  const countRow = await queryOne(countSql, params) as any;

  // 並び順: 機材ブロック(種別) → 設置場所 → 商品名 → 型名 → no
  sql += `
    ORDER BY
      CASE ei.equipment_type_code
        WHEN 'V' THEN 1 WHEN 'C' THEN 2 WHEN 'A' THEN 3 WHEN 'IC' THEN 4
        WHEN 'NW' THEN 5 WHEN 'L' THEN 6 WHEN 'XR' THEN 7 WHEN 'E' THEN 8
        ELSE 99
      END,
      COALESCE(el.sort_order, 9999), COALESCE(el.name, ei.location_detail, ''),
      ei.name, COALESCE(ei.model_number, ''), ei.unit_number
  `;
  if (limit) { sql += ` LIMIT $${paramIndex++}`; params.push(Number(limit)); }
  if (offset) { sql += ` OFFSET $${paramIndex++}`; params.push(Number(offset)); }

  const rows = await queryAll(sql, params);

  // 貸出中機材の貸出情報を付加 (equipment_section='rental' のみ)
  for (const row of rows as any[]) {
    if (row.equipment_section === 'rental') {
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
    SELECT ei.eq_code, ei.name, ei.equipment_type_code, ei.equipment_section,
           em.name as manufacturer, ei.model_number, ei.serial_number, ei.status, ei.condition,
           COALESCE(el.name, ei.location_detail) as location
    FROM equipment_items ei
    LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
    ORDER BY ei.equipment_type_code, ei.name, ei.unit_number
  `) as Record<string, unknown>[];
  const columns = ['eq_code', 'name', 'equipment_type_code', 'equipment_section', 'manufacturer', 'model_number', 'serial_number', 'status', 'condition', 'location'];
  csvResponse(res, 'equipment_items.csv', generateCsv(rows, columns));
});

// 一括更新 (管理者専用) — /items/:id ルートより前に定義する必要あり
router.put('/items/bulk-update', requirePermission('equipment', 'manager'), async (req: Request, res: Response) => {
  const { ids, fields } = req.body as { ids?: unknown; fields?: Record<string, unknown> };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: { message: 'ids は空でない配列を指定してください' } });
    return;
  }
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    res.status(400).json({ success: false, error: { message: 'fields が空です' } });
    return;
  }

  const ALLOWED_FIELDS = new Set([
    'name', 'model_number', 'manufacturer_id',
    'branch_code', 'asset_class', 'fixed_asset_code', 'depreciation_years',
    'equipment_section', 'equipment_type_code', 'location_code',
    'location_id', 'purchased_at', 'warranty_years',
    'status', 'condition', 'notes', 'parent_id',
    'rack_position', 'rack_height', 'rack_slot', 'rack_side', 'color_id',
  ]);

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    setClauses.push(`${key}=$${i++}`);
    params.push(value === '' ? null : value);
  }
  if (setClauses.length === 0) {
    res.status(400).json({ success: false, error: { message: '更新可能なフィールドが指定されていません' } });
    return;
  }

  setClauses.push(`updated_by=$${i++}`);
  params.push((req as any).user?.id || null);
  setClauses.push('updated_at=NOW()');

  const idPlaceholders = ids.map((_, idx) => `$${i + idx}`).join(',');
  params.push(...ids);

  const sql = `UPDATE equipment_items SET ${setClauses.join(', ')} WHERE id IN (${idPlaceholders}) AND deleted_at IS NULL`;
  await execute(sql, params);
  res.json({ success: true, data: { updated: ids.length } });
});

router.get('/items/:id', async (req: Request, res: Response) => {
  const item = await queryOne(`
    SELECT ei.*,
           em.name as manufacturer_name,
           el.name as location_name,
           el.is_rack as location_is_rack, el.rack_units as location_rack_units,
           ec.color_hex, ec.name as color_name,
           CASE WHEN ei.purchased_at IS NOT NULL AND ei.warranty_years > 0
                THEN (ei.purchased_at + (ei.warranty_years || ' years')::interval)::date
                ELSE NULL END as warranty_end
    FROM equipment_items ei
    LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    LEFT JOIN equipment_colors ec ON ec.id = ei.color_id AND ec.deleted_at IS NULL
    WHERE ei.id = $1 AND ei.deleted_at IS NULL
  `, [req.params.id]);

  if (!item) return res.status(404).json({ success: false, error: { message: '機材が見つかりません' } });

  const lendings = await queryAll(
    "SELECT * FROM equipment_lendings WHERE equipment_id = $1 ORDER BY lent_at DESC LIMIT 20",
    [req.params.id]
  );
  const maintenance = await queryAll(
    "SELECT * FROM maintenance_records WHERE equipment_id = $1 ORDER BY reported_at DESC LIMIT 20",
    [req.params.id]
  );

  // 子機材 (parent_id ベース)
  const children = await queryAll(`
    SELECT id, eq_code, name, status, condition, unit_number, model_number, notes
    FROM equipment_items
    WHERE parent_id = $1 AND deleted_at IS NULL
    ORDER BY name, unit_number
  `, [req.params.id]);

  // 親機材
  const parent = (item as any).parent_id
    ? await queryOne(`SELECT id, eq_code, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL`, [(item as any).parent_id])
    : null;

  res.json({
    success: true,
    data: { ...(item as any), lendings, maintenance, children, parent },
  });
});

router.post('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuid();
    const {
      name, unit_number, parent_id,
      manufacturer_id, model_number, serial_number, asset_class,
      status, condition, location_id, location_detail, notes,
      branch_code, fixed_asset_code, depreciation_years,
      equipment_section, equipment_type_code, location_code,
      purchased_at, warranty_years,
      rack_position, rack_height, rack_slot, rack_side, color_id,
    } = req.body;

    if (!location_code || !equipment_type_code) {
      res.status(400).json({ success: false, error: { message: '拠点コード(location_code)と種別コード(equipment_type_code)は必須です' } });
      return;
    }
    const eq_code = await generateEqCode(location_code, equipment_type_code);

    // 親機材がある場合、設置場所は親から継承
    let effectiveLocationId = location_id || null;
    let effectiveLocationDetail = location_detail || null;
    if (parent_id) {
      const parentItem = await queryOne(
        'SELECT location_id, location_detail FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
        [parent_id]
      ) as any;
      if (parentItem) {
        effectiveLocationId = parentItem.location_id;
        effectiveLocationDetail = parentItem.location_detail;
      }
    }

    await execute(`
      INSERT INTO equipment_items (
        id, eq_code, name, unit_number, parent_id,
        manufacturer_id, model_number, serial_number, asset_class,
        status, condition, location_id, location_detail, notes,
        branch_code, fixed_asset_code, depreciation_years,
        equipment_section, equipment_type_code, location_code,
        purchased_at, warranty_years,
        rack_position, rack_height, rack_slot, rack_side, color_id,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14, $15,$16,$17, $18,$19,$20, $21,$22, $23,$24,$25,$26,$27, $28,$29)
    `, [
      id, eq_code, name, unit_number || null, parent_id || null,
      manufacturer_id || null, model_number || null, serial_number || null, asset_class || 'fixed_asset',
      status || 'active', condition || 'good', effectiveLocationId, effectiveLocationDetail, notes || null,
      branch_code || null, fixed_asset_code || null, depreciation_years || null,
      equipment_section || null, equipment_type_code || null, location_code || null,
      purchased_at || null, warranty_years || null,
      rack_position || null, rack_height || 1, rack_slot || 'full', rack_side || 'front', color_id || null,
      (req as any).user?.id || null, (req as any).user?.id || null,
    ]);
    res.status(201).json({ success: true, data: { id, eq_code } });
  } catch (err: any) {
    console.error('[POST /items]', err?.message, err?.detail);
    next(err);
  }
});

router.put('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name, unit_number, parent_id,
      manufacturer_id, model_number, serial_number, asset_class,
      status, condition, location_id, location_detail, notes,
      branch_code, fixed_asset_code, depreciation_years,
      equipment_section, equipment_type_code, location_code,
      purchased_at, warranty_years,
      rack_position, rack_height, rack_slot, rack_side, color_id,
    } = req.body;

    await execute(`
      UPDATE equipment_items SET
        name=$1, unit_number=$2, parent_id=$3,
        manufacturer_id=$4, model_number=$5, serial_number=$6, asset_class=$7,
        status=$8, condition=$9, location_id=$10, location_detail=$11, notes=$12,
        branch_code=$13, fixed_asset_code=$14, depreciation_years=$15,
        equipment_section=$16, equipment_type_code=$17, location_code=$18,
        purchased_at=$19, warranty_years=$20,
        rack_position=$21, rack_height=$22, rack_slot=$23, rack_side=$24, color_id=$25,
        updated_by=$26, updated_at=NOW()
      WHERE id=$27 AND deleted_at IS NULL
    `, [
      name, unit_number || null, parent_id !== undefined ? (parent_id || null) : null,
      manufacturer_id || null, model_number || null, serial_number || null, asset_class || 'fixed_asset',
      status || 'active', condition || 'good', location_id || null, location_detail || null, notes || null,
      branch_code || null, fixed_asset_code || null, depreciation_years ?? null,
      equipment_section || null, equipment_type_code || null, location_code || null,
      purchased_at || null, warranty_years ?? null,
      rack_position || null, rack_height || 1, rack_slot || 'full', rack_side || 'front', color_id || null,
      (req as any).user?.id || null, req.params.id,
    ]);

    // 子機材の設置場所を親に合わせて一括上書き
    await execute(
      `UPDATE equipment_items SET location_id=$1, location_detail=$2, updated_at=NOW(), updated_by=$3
       WHERE parent_id=$4 AND deleted_at IS NULL`,
      [location_id || null, location_detail || null, (req as any).user?.id || null, req.params.id]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('[PUT /items/:id]', err?.message, err?.detail);
    next(err);
  }
});

// 部分更新 (親子付け替え等で全フィールド送らなくてよい)
router.patch('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // eq_code の変更は system_admin のみ
    if ('eq_code' in req.body && (req as any).user?.role !== 'system_admin') {
      res.status(403).json({ success: false, error: { message: '機材IDの変更は管理者のみ可能です' } });
      return;
    }
    const PATCHABLE = new Set([
      'eq_code', 'name', 'unit_number', 'parent_id', 'manufacturer_id', 'model_number',
      'serial_number', 'asset_class', 'status', 'condition', 'location_id', 'location_detail',
      'notes', 'branch_code', 'fixed_asset_code', 'depreciation_years',
      'equipment_section', 'equipment_type_code', 'location_code', 'purchased_at', 'warranty_years',
      'rack_position', 'rack_height', 'rack_slot', 'rack_side', 'color_id',
    ]);
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(req.body)) {
      if (!PATCHABLE.has(key)) continue;
      setClauses.push(`${key}=$${i++}`);
      // 空文字は null に変換 (date/numeric カラムで DB エラーを防ぐ)
      params.push(value === '' || value === undefined ? null : value);
    }
    if (setClauses.length === 0) {
      res.status(400).json({ success: false, error: { message: '更新フィールドがありません' } });
      return;
    }
    setClauses.push(`updated_by=$${i++}`, 'updated_at=NOW()');
    params.push((req as any).user?.id || null);
    await execute(
      `UPDATE equipment_items SET ${setClauses.join(', ')} WHERE id=$${i} AND deleted_at IS NULL`,
      [...params, req.params.id]
    );
    // 設置場所が含まれる場合は子機材にも伝播
    if ('location_id' in req.body || 'location_detail' in req.body) {
      const loc = await queryOne(`SELECT location_id, location_detail FROM equipment_items WHERE id=$1`, [req.params.id]) as any;
      if (loc) {
        await execute(
          `UPDATE equipment_items SET location_id=$1, location_detail=$2, updated_at=NOW(), updated_by=$3 WHERE parent_id=$4 AND deleted_at IS NULL`,
          [loc.location_id, loc.location_detail, (req as any).user?.id || null, req.params.id]
        );
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH /items/:id]', err?.message, err?.detail, JSON.stringify(req.body).slice(0, 200));
    next(err);
  }
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

router.post('/lendings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuid();
    const { equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes } = req.body;

    // 機材存在確認 (貸出可否は equipment_section で判定、ここでは二重貸出のみチェック)
    const item = await queryOne("SELECT id, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL", [equipment_id]) as any;
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
  } catch (err: any) {
    console.error('[POST /lendings]', err?.message);
    next(err);
  }
});

router.put('/lendings/:id/return', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { condition_in, notes } = req.body;
    await execute(`
      UPDATE equipment_lendings SET
        status='returned', returned_at=NOW(), condition_in=$1, notes=COALESCE($2, notes),
        returned_by=$3, updated_at=NOW()
      WHERE id=$4 AND status='lent'
    `, [condition_in || null, notes || null, (req as any).user?.id || null, req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[PUT /lendings/:id/return]', err?.message);
    next(err);
  }
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

router.post('/maintenance', async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err: any) {
    console.error('[POST /maintenance]', err?.message);
    next(err);
  }
});

router.put('/maintenance/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err: any) {
    console.error('[PUT /maintenance/:id]', err?.message);
    next(err);
  }
});

// ============================================================
// 棚卸し
// ============================================================
router.get('/inventory-checks', async (_req: Request, res: Response) => {
  const rows = await queryAll("SELECT * FROM inventory_checks ORDER BY check_date DESC");
  res.json({ success: true, data: rows });
});

router.post('/inventory-checks', async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err: any) {
    console.error('[POST /inventory-checks]', err?.message);
    next(err);
  }
});

router.get('/inventory-checks/:id', async (req: Request, res: Response) => {
  const check = await queryOne("SELECT * FROM inventory_checks WHERE id=$1", [req.params.id]);
  if (!check) return res.status(404).json({ success: false, error: { message: '棚卸しが見つかりません' } });

  const items = await queryAll(`
    SELECT ici.*, ei.name as equipment_name, ei.eq_code, ei.unit_number,
           ei.location_detail, el.name as location_name,
           COALESCE(el.sort_order, 9999) as location_sort
    FROM inventory_check_items ici
    JOIN equipment_items ei ON ei.id = ici.equipment_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    WHERE ici.check_id = $1
    ORDER BY location_sort, el.name NULLS LAST, ei.location_detail NULLS LAST, ei.name, ei.unit_number
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
// ラック実装ビュー
// ============================================================
router.get('/racks', async (_req: Request, res: Response) => {
  const racks = await queryAll(`
    SELECT id, name, rack_units, rack_sort_order, location_code, building, floor, area
    FROM equipment_locations
    WHERE is_rack = true AND deleted_at IS NULL
    ORDER BY rack_sort_order, name
  `) as any[];

  const result = [];
  for (const rack of racks) {
    const items = await queryAll(`
      SELECT ei.id, ei.eq_code, ei.name, ei.model_number, ei.unit_number,
             ei.equipment_type_code, ei.rack_position, ei.rack_height,
             ei.rack_slot, ei.rack_side, ei.color_id,
             ec.color_hex, ec.name as color_name
      FROM equipment_items ei
      LEFT JOIN equipment_colors ec ON ec.id = ei.color_id AND ec.deleted_at IS NULL
      WHERE ei.location_id = $1
        AND ei.rack_position IS NOT NULL
        AND ei.deleted_at IS NULL
      ORDER BY ei.rack_position
    `, [rack.id]);
    result.push({ location: rack, items });
  }
  res.json({ success: true, data: result });
});

// ============================================================
// ダッシュボード統計
// ============================================================
router.get('/stats', async (_req: Request, res: Response) => {
  try {
  const toInt = (v: any) => parseInt(v?.count ?? v?.c ?? v ?? '0', 10) || 0;

  const totalItems = await queryOne("SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL");
  const activeItems = await queryOne("SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL AND status='active'");
  const inRepair = await queryOne("SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL AND status='in_repair'");
  const lentOut = await queryOne("SELECT COUNT(*)::int as c FROM equipment_lendings WHERE status='lent'");
  const overdue = await queryOne("SELECT COUNT(*)::int as c FROM equipment_lendings WHERE status='lent' AND due_date IS NOT NULL AND due_date < CURRENT_DATE::text");
  const openMaintenance = await queryOne("SELECT COUNT(*)::int as c FROM maintenance_records WHERE status IN ('reported', 'in_progress')");
  const pendingInventory = await queryOne("SELECT COUNT(*)::int as c FROM inventory_checks WHERE status IN ('draft', 'in_progress')");

  // Recent active lendings for dashboard
  let recentLendings: any[] = [];
  try {
    recentLendings = await queryAll(
      `SELECT el.id, el.borrower_name, el.due_date, el.lent_at,
              ei.name as equipment_name, ei.unit_number,
              p.name as project_name, p.gls_number
       FROM equipment_lendings el
       JOIN equipment_items ei ON ei.id = el.equipment_id
       LEFT JOIN projects p ON p.id = el.project_id
       WHERE el.status = 'lent'
       ORDER BY el.lent_at DESC LIMIT 5`
    );
  } catch { /* ignore join errors */ }

  // Recent maintenance (open)
  let recentMaintenance: any[] = [];
  try {
    recentMaintenance = await queryAll(
      `SELECT mr.id, mr.title, mr.record_type, mr.status, mr.created_at,
              ei.name as equipment_name
       FROM maintenance_records mr
       JOIN equipment_items ei ON ei.id = mr.equipment_id
       WHERE mr.status IN ('reported', 'in_progress')
       ORDER BY mr.created_at DESC LIMIT 5`
    );
  } catch { /* ignore join errors */ }

  res.json({
    success: true,
    data: {
      total_items: toInt(totalItems),
      active_items: toInt(activeItems),
      in_repair: toInt(inRepair),
      lent_out: toInt(lentOut),
      overdue: toInt(overdue),
      open_maintenance: toInt(openMaintenance),
      pending_inventory: toInt(pendingInventory),
      recent_lendings: recentLendings,
      recent_maintenance: recentMaintenance,
    },
  });
  } catch (err: any) {
    console.error('[equipment/stats] error:', err?.message, err?.stack);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err?.message || 'Stats query failed' } });
  }
});

export default router;
