import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';
import { paginatedResponse } from '../../../shared/services/pagination';
import {
  EQUIPMENT_LENDING_STATUS, EQUIPMENT_STATUS,
  MAINTENANCE_STATUS, INVENTORY_STATUS,
} from '../../../shared/constants/statuses';
import { lendingService } from '../services/lending.service';
import { maintenanceService } from '../services/maintenance.service';
import { inventoryService } from '../services/inventory.service';
import { itemService } from '../services/item.service';
import { statsService } from '../services/stats.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('equipment'));

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
// 機材アイテム CRUD (itemService に集約)
// ============================================================
router.get('/items', async (req, res, next) => {
  try {
    const { rows, total } = await itemService.list({
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      equipment_section: req.query.equipment_section as string | undefined,
      equipment_type_code: req.query.equipment_type_code as string | undefined,
      include_children: req.query.include_children as string | undefined,
      parent_id: req.query.parent_id as string | undefined,
      is_rental_listed: req.query.is_rental_listed as string | undefined,
    });
    // limit/offset から page を逆算 (この旧 API は page を直接受けない)
    const limitNum = req.query.limit ? Number(req.query.limit) : 0;
    const offsetNum = req.query.offset ? Number(req.query.offset) : 0;
    const pageNum = limitNum > 0 ? Math.floor(offsetNum / limitNum) + 1 : 1;
    res.json(paginatedResponse(rows, total, pageNum, limitNum || total || 1));
  } catch (err) { next(err); }
});

// CSV Export (must be before /items/:id to avoid route conflict)
router.get('/items/export', requirePermission('equipment', 'exporter'), async (_req, res, next) => {
  try {
    const rows = await itemService.listForExport();
    const columns = ['eq_code', 'name', 'equipment_type_code', 'equipment_section', 'manufacturer', 'model_number', 'serial_number', 'status', 'condition', 'location'];
    csvResponse(res, 'equipment_items.csv', generateCsv(rows, columns));
  } catch (err) { next(err); }
});

// 貸出設定一括更新 (グループ単位) — /items/:id ルートより前に定義
router.put('/items/batch-rental', async (req, res, next) => {
  try {
    await itemService.batchRental(
      req.body?.ids,
      req.body?.rental_category_id ?? null,
      req.body?.rental_display_name ?? null,
      req.user?.id ?? null,
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// 一括更新 (管理者専用) — /items/:id ルートより前に定義する必要あり
router.put('/items/bulk-update', requirePermission('equipment', 'manager'), async (req, res, next) => {
  try {
    const result = await itemService.bulkUpdate(req.body?.ids, req.body?.fields, req.user?.id ?? null);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/items/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await itemService.getById(req.params.id as string) });
  } catch (err) { next(err); }
});

router.post('/items', async (req, res, next) => {
  try {
    const result = await itemService.create(req.body, req.user?.id ?? null);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/items/:id', async (req, res, next) => {
  try {
    await itemService.update(req.params.id as string, req.body, req.user?.id ?? null);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// 部分更新 (親子付け替え等で全フィールド送らなくてよい)
router.patch('/items/:id', async (req, res, next) => {
  try {
    await itemService.patch(
      req.params.id as string,
      req.body,
      req.user?.id ?? null,
      req.user?.role,
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    await itemService.delete(req.params.id as string, req.user?.id ?? null);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// 貸出管理 (lendingService に集約)
// ============================================================
router.get('/lendings', async (req, res, next) => {
  try {
    const rows = await lendingService.list({
      status: req.query.status as string | undefined,
      equipment_id: req.query.equipment_id as string | undefined,
      project_id: req.query.project_id as string | undefined,
    });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/lendings', async (req, res, next) => {
  try {
    const result = await lendingService.create(req.body, req.user?.id ?? null);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/lendings/batch', async (req, res, next) => {
  try {
    const result = await lendingService.createBatch(req.body, req.user?.id ?? null);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/lendings/:id/return', async (req, res, next) => {
  try {
    await lendingService.returnLending(req.params.id as string, req.body, req.user?.id ?? null);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/lendings/:id', async (req, res, next) => {
  try {
    await lendingService.delete(req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// メンテナンス記録 (maintenanceService に集約)
// ============================================================
router.get('/maintenance', async (req, res, next) => {
  try {
    const rows = await maintenanceService.list({
      equipment_id: req.query.equipment_id as string | undefined,
      status: req.query.status as string | undefined,
      record_type: req.query.record_type as string | undefined,
    });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/maintenance', async (req, res, next) => {
  try {
    const result = await maintenanceService.create(req.body, req.user?.id ?? null);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/maintenance/:id', async (req, res, next) => {
  try {
    await maintenanceService.update(req.params.id as string, req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// 棚卸し (inventoryService に集約)
// ============================================================
router.get('/inventory-checks', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await inventoryService.list() });
  } catch (err) { next(err); }
});

router.post('/inventory-checks', async (req, res, next) => {
  try {
    const result = await inventoryService.create(req.body, req.user?.id ?? null);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/inventory-checks/:id', async (req, res, next) => {
  try {
    res.json({ success: true, data: await inventoryService.getById(req.params.id as string) });
  } catch (err) { next(err); }
});

router.put('/inventory-checks/:id/items/:itemId', requirePermission('equipment', 'editor'), async (req, res, next) => {
  try {
    await inventoryService.updateItem(req.params.id as string, req.params.itemId as string, req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put('/inventory-checks/:id/status', requirePermission('equipment', 'editor'), async (req, res, next) => {
  try {
    await inventoryService.updateStatus(req.params.id as string, req.body?.status);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/inventory-checks/:id', requirePermission('equipment', 'manager'), async (req, res, next) => {
  try {
    await inventoryService.delete(req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// 棚卸し機材同期（新たに追加された機材をチェックに追加）
router.post('/inventory-checks/:id/sync', async (req, res, next) => {
  try {
    res.json({ success: true, data: await inventoryService.sync(req.params.id as string) });
  } catch (err) { next(err); }
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
router.get('/stats', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await statsService.getDashboardStats() });
  } catch (err) { next(err); }
});

// ============================================================
// 型番別グループ一覧 / 貸出機材一覧
// ============================================================
router.get('/model-groups', async (req: Request, res: Response) => {
  const { q, type, section, category } = req.query;
  const params: any[] = [];
  let paramIndex = 1;

  let where = `WHERE ei.deleted_at IS NULL
    AND COALESCE(parent_ei.is_rental_listed, ei.is_rental_listed) = true
    AND ei.equipment_section = 'rental'
    AND ei.parent_id IS NULL`;

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
          'rental_display_name', ei.rental_display_name,
          'children', (
            SELECT COALESCE(json_agg(json_build_object(
              'id', c.id, 'eq_code', c.eq_code, 'name', c.name,
              'unit_number', c.unit_number, 'status', c.status
            ) ORDER BY c.name, c.unit_number NULLS LAST), '[]'::json)
            FROM equipment_items c
            WHERE c.parent_id = ei.id AND c.deleted_at IS NULL
          )
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
  const { columnId, equipmentId } = req.params;
  const { value } = req.body;
  try {
    await execute(
      `INSERT INTO equipment_custom_values (equipment_id, column_id, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (equipment_id, column_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [equipmentId, columnId, value ?? null]
    );
    res.json({ success: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[custom-values PUT failed]', { columnId, equipmentId, value, code: err?.code, detail: err?.detail, message: err?.message });
    res.status(500).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        detail: err.detail,
        constraint: err.constraint,
      },
    });
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
