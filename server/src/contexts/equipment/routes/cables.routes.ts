// 機材ケーブル管理 CRUD
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
router.use(requireAuth, requirePermission('equipment'));

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const KIND_VALUES = new Set(['video', 'audio', 'network', 'lighting', 'power', 'other']);

const SELECT_SQL = `
  SELECT c.id, c.kind, c.location_id, c.name, c.manufacturer_id, c.model_number,
         c.length_m, c.color, c.quantity, c.storage_method, c.notes, c.sort_order,
         c.created_at, c.updated_at,
         loc.name AS location_name,
         mfr.name AS manufacturer_name
  FROM equipment_cables c
  LEFT JOIN equipment_locations    loc ON loc.id = c.location_id
  LEFT JOIN equipment_manufacturers mfr ON mfr.id = c.manufacturer_id
  WHERE c.deleted_at IS NULL
`;

router.get('/', wrap(async (req, res) => {
  const { search, kind, location_id, manufacturer_id } = req.query as Record<string, string | undefined>;
  const params: unknown[] = [];
  let sql = SELECT_SQL;
  let i = 1;
  if (kind && KIND_VALUES.has(kind)) {
    sql += ` AND c.kind = $${i}`;
    params.push(kind);
    i += 1;
  }
  if (location_id) {
    sql += ` AND c.location_id = $${i}`;
    params.push(location_id);
    i += 1;
  }
  if (manufacturer_id) {
    sql += ` AND c.manufacturer_id = $${i}`;
    params.push(manufacturer_id);
    i += 1;
  }
  if (search) {
    sql += ` AND (c.name ILIKE $${i} OR c.model_number ILIKE $${i} OR c.notes ILIKE $${i})`;
    params.push(`%${search}%`);
    i += 1;
  }
  sql += ' ORDER BY c.sort_order, c.kind, c.name';
  const rows = await queryAll(sql, params);
  res.json({ success: true, data: rows });
}));

const validatePayload = (body: Record<string, unknown>) => {
  const kind = String(body.kind ?? '');
  if (!KIND_VALUES.has(kind)) throw new AppError(400, 'VALIDATION_ERROR', '種別が不正です');
  if (!body.name || !String(body.name).trim()) throw new AppError(400, 'VALIDATION_ERROR', '商品名は必須です');
};

const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

router.post('/', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  validatePayload(req.body);
  const {
    kind, location_id, name, manufacturer_id, model_number,
    length_m, color, quantity, storage_method, notes, sort_order,
  } = req.body;
  const id = uuid();
  await execute(
    `INSERT INTO equipment_cables
     (id, kind, location_id, name, manufacturer_id, model_number,
      length_m, color, quantity, storage_method, notes, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, kind, location_id || null, String(name).trim(),
      manufacturer_id || null, model_number || null,
      toNumOrNull(length_m), color || null,
      toNumOrNull(quantity) ?? 0, storage_method || null,
      notes || null, toNumOrNull(sort_order) ?? 0,
    ],
  );
  const row = await queryOne(`${SELECT_SQL} AND c.id = $1`, [id]);
  res.status(201).json({ success: true, data: row });
}));

router.put('/:id', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  validatePayload(req.body);
  const {
    kind, location_id, name, manufacturer_id, model_number,
    length_m, color, quantity, storage_method, notes, sort_order,
  } = req.body;
  await execute(
    `UPDATE equipment_cables
     SET kind=$1, location_id=$2, name=$3, manufacturer_id=$4, model_number=$5,
         length_m=$6, color=$7, quantity=$8, storage_method=$9, notes=$10,
         sort_order=$11, updated_at=NOW()
     WHERE id=$12 AND deleted_at IS NULL`,
    [
      kind, location_id || null, String(name).trim(),
      manufacturer_id || null, model_number || null,
      toNumOrNull(length_m), color || null,
      toNumOrNull(quantity) ?? 0, storage_method || null,
      notes || null, toNumOrNull(sort_order) ?? 0,
      req.params.id,
    ],
  );
  const row = await queryOne(`${SELECT_SQL} AND c.id = $1`, [req.params.id]);
  res.json({ success: true, data: row });
}));

router.delete('/:id', requirePermission('equipment', 'manager'), wrap(async (req, res) => {
  await execute('UPDATE equipment_cables SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

export default router;
