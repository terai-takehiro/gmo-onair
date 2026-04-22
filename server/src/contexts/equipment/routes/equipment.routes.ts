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
  const { name, description, building, floor, area, sort_order, rack_units, rack_sort_order, branch_id, rack_type_id } = req.body;
  const id = uuid();
  const isRack = !!rack_type_id;
  await execute(
    `INSERT INTO equipment_locations (id, name, description, building, floor, area, sort_order, is_rack, rack_units, rack_sort_order, branch_id, rack_type_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, name, description || null, building || null, floor || null, area || null, sort_order || 0,
     isRack, isRack ? (rack_units || null) : null, rack_sort_order || 0,
     branch_id || null, rack_type_id || null]
  );
  res.status(201).json({ success: true, data: { id } });
});

router.put('/locations/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  const { name, description, building, floor, area, sort_order, rack_units, rack_sort_order, branch_id, rack_type_id } = req.body;
  const isRack = !!rack_type_id;
  await execute(
    `UPDATE equipment_locations
     SET name=$1, description=$2, building=$3, floor=$4, area=$5, sort_order=$6,
         is_rack=$7, rack_units=$8, rack_sort_order=$9, branch_id=$10, rack_type_id=$11, updated_at=NOW()
     WHERE id=$12`,
    [name, description || null, building || null, floor || null, area || null, sort_order || 0,
     isRack, isRack ? (rack_units || null) : null, rack_sort_order || 0,
     branch_id || null, rack_type_id || null, req.params.id]
  );
  res.json({ success: true });
});

// ============================================================
// 拠点マスタ CRUD
// ============================================================
router.get('/branches', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await queryAll('SELECT * FROM equipment_branches WHERE deleted_at IS NULL ORDER BY sort_order, name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/branches', requirePermission('equipment', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, error: '名前は必須です' });
    const id = uuid();
    await execute('INSERT INTO equipment_branches (id, name, sort_order) VALUES ($1,$2,$3)',
      [id, name, sort_order || 0]);
    res.status(201).json({ success: true, data: { id } });
  } catch (err) { next(err); }
});

router.put('/branches/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, sort_order } = req.body;
    await execute('UPDATE equipment_branches SET name=$1, sort_order=$2 WHERE id=$3',
      [name, sort_order || 0, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/branches/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await execute('UPDATE equipment_branches SET deleted_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// ラック種別マスタ CRUD
// ============================================================
router.get('/rack-types', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await queryAll('SELECT * FROM equipment_rack_types WHERE deleted_at IS NULL ORDER BY sort_order, name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/rack-types', requirePermission('equipment', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, error: '名前は必須です' });
    const id = uuid();
    await execute('INSERT INTO equipment_rack_types (id, name, sort_order) VALUES ($1,$2,$3)',
      [id, name, sort_order || 0]);
    res.status(201).json({ success: true, data: { id } });
  } catch (err) { next(err); }
});

router.put('/rack-types/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, sort_order } = req.body;
    await execute('UPDATE equipment_rack_types SET name=$1, sort_order=$2 WHERE id=$3',
      [name, sort_order || 0, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/rack-types/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await execute('UPDATE equipment_rack_types SET deleted_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/locations/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  await execute("UPDATE equipment_locations SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// 所管コード一覧（distinct）
router.get('/branch-codes', async (_req: Request, res: Response) => {
  const rows = await queryAll(
    `SELECT DISTINCT branch_code FROM equipment_items
     WHERE branch_code IS NOT NULL AND branch_code != '' AND deleted_at IS NULL
     ORDER BY branch_code`
  );
  res.json({ success: true, data: rows.map((r: any) => r.branch_code as string) });
});

// ============================================================
// 機材アイテム CRUD
// ============================================================
router.get('/items', async (req: Request, res: Response) => {
  const { status, search, limit, offset, equipment_section, equipment_type_code, include_children, parent_id, is_rental_listed } = req.query;
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
           (SELECT COUNT(*)::int FROM equipment_items c WHERE c.parent_id = ei.id AND c.deleted_at IS NULL) AS children_count,
           COALESCE(p.is_rental_listed, ei.is_rental_listed) AS effective_rental_listed
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
  if (is_rental_listed === 'true') { sql += ` AND COALESCE(p.is_rental_listed, ei.is_rental_listed) = true`; }
  if (search) {
    sql += ` AND (ei.name ILIKE $${paramIndex} OR ei.eq_code ILIKE $${paramIndex + 1} OR em.name ILIKE $${paramIndex + 2} OR ei.model_number ILIKE $${paramIndex + 3} OR ei.serial_number ILIKE $${paramIndex + 4})`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
    paramIndex += 5;
  }

  // Count (wrap full query to preserve all JOINs/WHERE conditions)
  const countSql = `SELECT COUNT(*) as total FROM (${sql}) _cnt`;
  const countRow = await queryOne(countSql, params) as any;

  // 並び順: 設置場所の表示順 → 設置場所名 → 機材名(五十音) → 型名 → no
  sql += `
    ORDER BY
      COALESCE(el.sort_order, 9999),
      COALESCE(el.name, ei.location_detail, ''),
      ei.name,
      COALESCE(ei.model_number, ''), ei.unit_number
  `;
  if (limit) { sql += ` LIMIT $${paramIndex++}`; params.push(Number(limit)); }
  if (offset) { sql += ` OFFSET $${paramIndex++}`; params.push(Number(offset)); }

  const rows = await queryAll(sql, params);

  // 貸出中機材の貸出情報を付加 (effective_rental_listed=true の機材) — バッチで1クエリ
  // 子機材は親の is_rental_listed を継承するため effective_rental_listed を使用
  const lendableIds = (rows as any[]).filter(r => r.effective_rental_listed).map(r => r.id);
  if (lendableIds.length > 0) {
    const lendingRows = await queryAll(`
      SELECT DISTINCT ON (equipment_id)
        id, equipment_id, borrower_name, project_id, lent_at, due_date
      FROM equipment_lendings
      WHERE equipment_id = ANY($1::text[]) AND status = 'lent'
      ORDER BY equipment_id, lent_at DESC
    `, [lendableIds]) as any[];
    const lendingMap = new Map(lendingRows.map(l => [l.equipment_id, l]));
    for (const row of rows as any[]) {
      if ((row as any).effective_rental_listed) {
        (row as any).current_lending = lendingMap.get(row.id) || null;
      }
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

// 貸出設定一括更新 (グループ単位) — /items/:id ルートより前に定義
router.put('/items/batch-rental', async (req: Request, res: Response) => {
  const { ids, rental_category_id, rental_display_name } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: { message: 'ids は空でない配列を指定してください' } });
    return;
  }
  const placeholders = ids.map((_: unknown, i: number) => `$${i + 1}`).join(', ');
  await execute(
    `UPDATE equipment_items SET
       rental_category_id = $${ids.length + 1},
       rental_display_name = $${ids.length + 2},
       updated_at = NOW(), updated_by = $${ids.length + 3}
     WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    [...ids, rental_category_id || null, rental_display_name || null, (req as any).user?.id || null]
  );
  res.json({ success: true });
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
    'display_config',
  ]);

  // サーバー側 enum バリデーション
  const ENUM_RULES: Record<string, string[]> = {
    status:             ['active', 'in_repair', 'retired', 'disposed', 'lost'],
    condition:          ['excellent', 'good', 'fair', 'poor'],
    asset_class:        ['fixed_asset', 'consumable', 'leased', 'transferred'],
    equipment_section:  ['equipment', 'rental'],
    equipment_type_code:['V', 'C', 'A', 'IC', 'NW', 'L', 'XR', 'E'],
    rack_slot:          ['full', 'left-1_2', 'right-1_2', 'left-1_3', 'mid-1_3', 'right-1_3'],
    rack_side:          ['front', 'back'],
  };
  for (const [key, allowed] of Object.entries(ENUM_RULES)) {
    if (key in fields && fields[key] !== null && fields[key] !== '') {
      if (!allowed.includes(fields[key] as string)) {
        res.status(400).json({ success: false, error: { message: `${key} の値が不正です: ${fields[key]}` } });
        return;
      }
    }
  }

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
           erc.name as rental_category_name,
           CASE WHEN ei.purchased_at IS NOT NULL AND ei.warranty_years > 0
                THEN (ei.purchased_at + (ei.warranty_years || ' years')::interval)::date
                ELSE NULL END as warranty_end
    FROM equipment_items ei
    LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    LEFT JOIN equipment_colors ec ON ec.id = ei.color_id AND ec.deleted_at IS NULL
    LEFT JOIN equipment_rental_categories erc ON erc.id = ei.rental_category_id
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
      'display_config', 'rental_category_id', 'rental_display_name',
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

router.post('/lendings/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { equipment_ids, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes } = req.body;
    if (!Array.isArray(equipment_ids) || equipment_ids.length === 0) {
      return res.status(400).json({ success: false, error: { message: '機材を1台以上選択してください' } });
    }
    if (!borrower_name) {
      return res.status(400).json({ success: false, error: { message: '借用者名は必須です' } });
    }
    const errors: string[] = [];
    const createdIds: string[] = [];
    for (const equipment_id of equipment_ids) {
      const item = await queryOne(
        "SELECT id, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL", [equipment_id]
      ) as any;
      if (!item) { errors.push(`ID:${equipment_id} が見つかりません`); continue; }
      const activeLending = await queryOne(
        "SELECT id FROM equipment_lendings WHERE equipment_id = $1 AND status = 'lent'", [equipment_id]
      );
      if (activeLending) { errors.push(`${item.name} は既に貸出中です`); continue; }
      const id = uuid();
      await execute(`
        INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes, status, lent_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [id, equipment_id, project_id || null, borrower_name, purpose || null, lent_at,
          due_date || null, condition_out || null, notes || null, 'lent', (req as any).user?.id || null]);
      createdIds.push(id);
    }
    if (createdIds.length === 0) {
      return res.status(400).json({ success: false, error: { message: errors.join('、') } });
    }
    res.status(201).json({ success: true, data: { created_count: createdIds.length, errors: errors.length > 0 ? errors : undefined } });
  } catch (err: any) {
    console.error('[POST /lendings/batch]', err?.message);
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
router.get('/inventory-checks', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await queryAll("SELECT * FROM inventory_checks ORDER BY check_date DESC");
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/inventory-checks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuid();
    const { title, check_date, notes } = req.body;

    await execute(
      "INSERT INTO inventory_checks (id, title, check_date, status, checked_by, notes) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, title, check_date, 'draft', (req as any).user?.id || null, notes || null]
    );

    // Auto-populate check items from active equipment — バッチINSERTで1クエリ
    const items = await queryAll(`
      SELECT ei.id, el.name as location_name, ei.location_detail
      FROM equipment_items ei
      LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
      WHERE ei.deleted_at IS NULL AND ei.status != 'disposed'
    `) as any[];
    if (items.length > 0) {
      const vals: string[] = [];
      const prms: any[] = [];
      items.forEach((item, idx) => {
        const base = idx * 4;
        vals.push(`($${base+1},$${base+2},$${base+3},$${base+4})`);
        prms.push(uuid(), id, item.id, item.location_name || item.location_detail || null);
      });
      await execute(
        `INSERT INTO inventory_check_items (id, check_id, equipment_id, expected_location) VALUES ${vals.join(',')}`,
        prms
      );
    }
    res.status(201).json({ success: true, data: { id } });
  } catch (err: any) {
    console.error('[POST /inventory-checks]', err?.message);
    next(err);
  }
});

router.get('/inventory-checks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err) { next(err); }
});

router.put('/inventory-checks/:id/items/:itemId', requirePermission('equipment', 'editor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { found, actual_location, condition, note } = req.body;
    await execute(`
      UPDATE inventory_check_items SET found=$1, actual_location=$2, condition=$3, note=$4, checked_at=NOW()
      WHERE id=$5 AND check_id=$6
    `, [found, actual_location || null, condition || null, note || null, req.params.itemId, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put('/inventory-checks/:id/status', requirePermission('equipment', 'editor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const VALID_STATUSES = ['draft', 'in_progress', 'completed'];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'status の値が不正です' } });
    }
    await execute("UPDATE inventory_checks SET status=$1, updated_at=NOW() WHERE id=$2", [status, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/inventory-checks/:id', requirePermission('equipment', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const check = await queryOne("SELECT id FROM inventory_checks WHERE id=$1", [req.params.id]);
    if (!check) return res.status(404).json({ success: false, error: { message: '棚卸しが見つかりません' } });
    await execute("DELETE FROM inventory_check_items WHERE check_id=$1", [req.params.id]);
    await execute("DELETE FROM inventory_checks WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// 棚卸し機材同期（新たに追加された機材をチェックに追加）
router.post('/inventory-checks/:id/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const check = await queryOne("SELECT id FROM inventory_checks WHERE id=$1", [req.params.id]);
    if (!check) return res.status(404).json({ success: false, error: { message: '棚卸しが見つかりません' } });

    const existing = await queryAll(
      "SELECT equipment_id FROM inventory_check_items WHERE check_id=$1",
      [req.params.id]
    ) as any[];
    const existingIds = new Set(existing.map((e: any) => e.equipment_id));

    const allItems = await queryAll(`
      SELECT ei.id, el.name as location_name, ei.location_detail
      FROM equipment_items ei
      LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
      WHERE ei.deleted_at IS NULL AND ei.status != 'disposed'
    `);

    const toInsert = (allItems as any[]).filter(item => !existingIds.has(item.id));
    if (toInsert.length > 0) {
      const vals: string[] = [];
      const prms: any[] = [];
      toInsert.forEach((item, idx) => {
        const base = idx * 4;
        vals.push(`($${base+1},$${base+2},$${base+3},$${base+4})`);
        prms.push(uuid(), req.params.id, item.id, item.location_name || item.location_detail || null);
      });
      await execute(
        `INSERT INTO inventory_check_items (id, check_id, equipment_id, expected_location) VALUES ${vals.join(',')}`,
        prms
      );
    }

    res.json({ success: true, data: { added: toInsert.length } });
  } catch (err: any) {
    console.error('[POST /inventory-checks/:id/sync]', err?.message);
    next(err);
  }
});

// ============================================================
// ラック実装ビュー
// ============================================================
router.get('/racks', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const racks = await queryAll(`
      SELECT el.id, el.name, el.rack_units, el.rack_sort_order, el.building, el.floor, el.area,
             el.branch_id, el.rack_type_id,
             eb.name as branch_name,
             ert.name as rack_type_name
      FROM equipment_locations el
      LEFT JOIN equipment_branches eb ON eb.id = el.branch_id
      LEFT JOIN equipment_rack_types ert ON ert.id = el.rack_type_id
      WHERE el.rack_type_id IS NOT NULL AND el.deleted_at IS NULL
      ORDER BY el.rack_sort_order, el.name
    `) as any[];

    // バッチ取得: ラック数に関係なく2クエリで完結
    const rackIds = racks.map((r: any) => r.id);
    const [allItems, allBlanks] = rackIds.length > 0 ? await Promise.all([
      queryAll(`
        SELECT ei.id, ei.eq_code, ei.name, ei.model_number, ei.serial_number, ei.unit_number,
               ei.equipment_type_code, ei.rack_position, ei.rack_height,
               ei.rack_slot, ei.rack_side, ei.color_id, ei.notes,
               ei.status, ei.condition, ei.display_config,
               ei.location_id,
               ec.color_hex, ec.name as color_name,
               em.name as manufacturer_name
        FROM equipment_items ei
        LEFT JOIN equipment_colors ec ON ec.id = ei.color_id AND ec.deleted_at IS NULL
        LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
        WHERE ei.location_id = ANY($1::text[])
          AND ei.rack_position IS NOT NULL
          AND ei.deleted_at IS NULL
        ORDER BY ei.location_id, ei.rack_position
      `, [rackIds]),
      queryAll(`
        SELECT id, location_id, rack_position, rack_height, rack_slot, rack_side, panel_type, label
        FROM rack_blank_panels
        WHERE location_id = ANY($1::text[])
        ORDER BY location_id, rack_position
      `, [rackIds]),
    ]) : [[], []];

    // メモリ上でラック別にグループ化
    const itemsByRack = new Map<string, any[]>();
    const blanksByRack = new Map<string, any[]>();
    for (const item of allItems as any[]) {
      if (!itemsByRack.has(item.location_id)) itemsByRack.set(item.location_id, []);
      itemsByRack.get(item.location_id)!.push(item);
    }
    for (const blank of allBlanks as any[]) {
      if (!blanksByRack.has(blank.location_id)) blanksByRack.set(blank.location_id, []);
      blanksByRack.get(blank.location_id)!.push(blank);
    }

    const result = racks.map((rack: any) => ({
      location: rack,
      items: itemsByRack.get(rack.id) ?? [],
      blanks: blanksByRack.get(rack.id) ?? [],
    }));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/racks/:locationId/blanks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rack_position, rack_height, rack_slot, rack_side, panel_type, label } = req.body;
    const id = uuid();
    await execute(
      `INSERT INTO rack_blank_panels (id, location_id, rack_position, rack_height, rack_slot, rack_side, panel_type, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, req.params.locationId, rack_position, rack_height || 1, rack_slot || 'full', rack_side || 'front', panel_type || 'blank', label || null]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (err) { next(err); }
});

router.delete('/racks/blanks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await execute('DELETE FROM rack_blank_panels WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
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

// ============================================================
// 型番別グループ一覧 / 貸出機材一覧
// ============================================================
router.get('/model-groups', async (req: Request, res: Response) => {
  const { q, type, section, category } = req.query;
  const params: any[] = [];
  let paramIndex = 1;

  let where = 'WHERE ei.deleted_at IS NULL AND COALESCE(parent_ei.is_rental_listed, ei.is_rental_listed) = true';

  if (q) {
    const s = `%${q}%`;
    where += ` AND (ei.name ILIKE $${paramIndex} OR ei.model_number ILIKE $${paramIndex + 1} OR em.name ILIKE $${paramIndex + 2})`;
    params.push(s, s, s);
    paramIndex += 3;
  }
  if (section) {
    where += ` AND ei.equipment_section = $${paramIndex}`;
    params.push(section);
    paramIndex++;
  }
  if (type) {
    where += ` AND ei.equipment_type_code = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }
  if (category === '_none') {
    where += ` AND ei.rental_category_id IS NULL`;
  } else if (category) {
    where += ` AND ei.rental_category_id = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  const rows = await queryAll(`
    SELECT
      ei.name,
      COALESCE(ei.model_number, '') AS model_number,
      MIN(em.name) AS manufacturer_name,
      ei.equipment_type_code,
      MIN(ei.rental_category_id) AS rental_category_id,
      MIN(erc.name) AS rental_category_name,
      MIN(erc.sort_order) AS rental_category_sort_order,
      MIN(NULLIF(ei.rental_display_name, '')) AS rental_display_name,
      COUNT(*)::int AS total_count,
      json_agg(
        json_build_object(
          'id', ei.id,
          'eq_code', ei.eq_code,
          'unit_number', ei.unit_number,
          'serial_number', ei.serial_number,
          'status', ei.status,
          'condition', ei.condition,
          'location_name', el.name,
          'location_detail', ei.location_detail,
          'rental_display_name', ei.rental_display_name
        ) ORDER BY ei.unit_number NULLS LAST, ei.eq_code
      ) AS units
    FROM equipment_items ei
    LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id
    LEFT JOIN equipment_rental_categories erc ON erc.id = ei.rental_category_id
    LEFT JOIN equipment_items parent_ei ON parent_ei.id = ei.parent_id AND parent_ei.deleted_at IS NULL
    ${where}
    GROUP BY ei.name, COALESCE(ei.model_number, ''), ei.equipment_type_code
    ORDER BY MIN(erc.sort_order) NULLS LAST, ei.name, COALESCE(ei.model_number, '')
  `, params);

  res.json({ success: true, data: rows });
});

// ============================================================
// 貸出カテゴリ CRUD
// ============================================================

router.get('/rental-categories', async (_req: Request, res: Response) => {
  const rows = await queryAll(`SELECT * FROM equipment_rental_categories ORDER BY sort_order ASC, created_at ASC`);
  res.json({ success: true, data: rows });
});

router.post('/rental-categories', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ success: false, error: { message: 'カテゴリ名は必須です' } }); return; }
  const maxRow = await queryOne(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM equipment_rental_categories`) as any;
  const sortOrder = (maxRow?.m ?? -1) + 1;
  const id = (await queryOne(`INSERT INTO equipment_rental_categories (name, sort_order) VALUES ($1, $2) RETURNING id`, [name, sortOrder])) as any;
  const row = await queryOne(`SELECT * FROM equipment_rental_categories WHERE id = $1`, [id.id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/rental-categories/reorder', async (req: Request, res: Response) => {
  const { order } = req.body;
  if (!Array.isArray(order)) { res.status(400).json({ success: false, error: { message: 'orderは配列で指定してください' } }); return; }
  for (const item of order) {
    await execute(`UPDATE equipment_rental_categories SET sort_order=$1, updated_at=NOW() WHERE id=$2`, [item.sort_order, item.id]);
  }
  res.json({ success: true });
});

router.put('/rental-categories/:id', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ success: false, error: { message: 'カテゴリ名は必須です' } }); return; }
  await execute(`UPDATE equipment_rental_categories SET name=$1, updated_at=NOW() WHERE id=$2`, [name, req.params.id]);
  const row = await queryOne(`SELECT * FROM equipment_rental_categories WHERE id = $1`, [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/rental-categories/:id', async (req: Request, res: Response) => {
  // このカテゴリを使っている機材のrental_category_idをNULLに
  await execute(`UPDATE equipment_items SET rental_category_id=NULL WHERE rental_category_id=$1`, [req.params.id]);
  await execute(`DELETE FROM equipment_rental_categories WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// カスタム列定義 CRUD
// ============================================================

// GET /equipment/custom-columns — 自分が使える列を返す (shared全件 + 自分のpersonal)
router.get('/custom-columns', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const rows = await queryAll(
      `SELECT id, name, col_type, scope, created_by, sort_order, created_at
       FROM equipment_custom_columns
       WHERE scope = 'shared' OR created_by = $1
       ORDER BY scope DESC, sort_order ASC, created_at ASC`,
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// POST /equipment/custom-columns — 新規列作成
router.post('/custom-columns', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { name, col_type = 'text', scope = 'personal', sort_order = 0 } = req.body;
    if (!name) return res.status(400).json({ success: false, error: { message: '列名は必須です' } });
    if (!['text', 'checkbox', 'number'].includes(col_type)) return res.status(400).json({ success: false, error: { message: '無効な列タイプです' } });
    if (!['personal', 'shared'].includes(scope)) return res.status(400).json({ success: false, error: { message: '無効なスコープです' } });

    const row = await queryOne(
      `INSERT INTO equipment_custom_columns (name, col_type, scope, created_by, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, col_type, scope, created_by, sort_order, created_at`,
      [name, col_type, scope, userId, sort_order]
    );
    res.status(201).json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// PUT /equipment/custom-columns/:id — 列定義更新
router.put('/custom-columns/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const { name, col_type, scope, sort_order } = req.body;

    const existing = await queryOne('SELECT * FROM equipment_custom_columns WHERE id = $1', [id]) as any;
    if (!existing) return res.status(404).json({ success: false, error: { message: '列が見つかりません' } });
    // 自分のpersonal列、またはshared列（管理者に限らず作成者が変更可）
    if (existing.created_by !== userId && existing.scope === 'personal') {
      return res.status(403).json({ success: false, error: { message: '他人のpersonal列は変更できません' } });
    }

    const updated = await queryOne(
      `UPDATE equipment_custom_columns
       SET name = COALESCE($1, name),
           col_type = COALESCE($2, col_type),
           scope = COALESCE($3, scope),
           sort_order = COALESCE($4, sort_order),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, col_type, scope, created_by, sort_order`,
      [name ?? null, col_type ?? null, scope ?? null, sort_order ?? null, id]
    );
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// DELETE /equipment/custom-columns/:id — 列削除（値も cascade 削除）
router.delete('/custom-columns/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM equipment_custom_columns WHERE id = $1', [id]) as any;
    if (!existing) return res.status(404).json({ success: false, error: { message: '列が見つかりません' } });
    if (existing.created_by !== userId) {
      return res.status(403).json({ success: false, error: { message: '作成者のみ削除できます' } });
    }
    await execute('DELETE FROM equipment_custom_columns WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ============================================================
// カスタム列の値 読み書き
// ============================================================

// GET /equipment/custom-values?equipment_ids=id1,id2
router.get('/custom-values', async (req: Request, res: Response) => {
  try {
    const rawIds = String(req.query.equipment_ids ?? '');
    if (!rawIds) return res.json({ success: true, data: [] });
    const ids = rawIds.split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ success: true, data: [] });
    // parameterized IN clause
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const rows = await queryAll(
      `SELECT equipment_id, column_id, value FROM equipment_custom_values WHERE equipment_id IN (${placeholders})`,
      ids
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// PUT /equipment/custom-values/:columnId/:equipmentId — upsert 単一値
router.put('/custom-values/:columnId/:equipmentId', async (req: Request, res: Response) => {
  try {
    const { columnId, equipmentId } = req.params;
    const { value } = req.body;
    await execute(
      `INSERT INTO equipment_custom_values (equipment_id, column_id, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (equipment_id, column_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [equipmentId, columnId, value ?? null]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});


// ============================================================
// 貸出機材設定 (is_rental_listed フラグ管理)
// ============================================================
router.get('/rental-settings', async (req: Request, res: Response) => {
  const { q, type } = req.query;
  const params: any[] = [];
  let paramIndex = 1;
  let where = 'WHERE ei.deleted_at IS NULL AND ei.parent_id IS NULL';
  if (q) {
    where += ` AND (ei.name ILIKE $${paramIndex} OR ei.model_number ILIKE $${paramIndex + 1} OR em.name ILIKE $${paramIndex + 2})`;
    const s = `%${q}%`;
    params.push(s, s, s);
    paramIndex += 3;
  }
  if (type) {
    where += ` AND ei.equipment_type_code = $${paramIndex++}`;
    params.push(type);
  }
  const rows = await queryAll(`
    SELECT ei.id, ei.name, ei.model_number, ei.unit_number, ei.eq_code,
           ei.equipment_type_code, ei.equipment_section, ei.status, ei.is_rental_listed,
           em.name AS manufacturer_name, el.name AS location_name
    FROM equipment_items ei
    LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    ${where}
    ORDER BY ei.name, COALESCE(ei.model_number,''), ei.unit_number NULLS LAST, ei.eq_code
  `, params);
  res.json({ success: true, data: rows });
});

router.put('/rental-settings/:id', requirePermission('equipment', 'owner'), async (req: Request, res: Response) => {
  const { is_rental_listed } = req.body;
  await execute(
    'UPDATE equipment_items SET is_rental_listed=$1, updated_at=NOW() WHERE id=$2',
    [!!is_rental_listed, req.params.id]
  );
  res.json({ success: true });
});

export default router;
