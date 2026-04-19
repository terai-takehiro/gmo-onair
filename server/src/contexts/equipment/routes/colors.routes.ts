// 機材色マスタ CRUD
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
router.use(requireAuth, requirePermission('equipment'));

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/', wrap(async (_req, res) => {
  const rows = await queryAll(
    `SELECT id, name, color_hex, description, sort_order
     FROM equipment_colors WHERE deleted_at IS NULL ORDER BY sort_order, name`,
  );
  res.json({ success: true, data: rows });
}));

router.post('/', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  const { name, color_hex, description, sort_order } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  if (!color_hex) throw new AppError(400, 'VALIDATION_ERROR', 'カラーコードは必須です');
  const id = uuid();
  await execute(
    `INSERT INTO equipment_colors (id, name, color_hex, description, sort_order)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, name, color_hex, description || null, sort_order ?? 0],
  );
  const row = await queryOne('SELECT * FROM equipment_colors WHERE id = $1', [id]);
  res.status(201).json({ success: true, data: row });
}));

router.put('/:id', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  const { name, color_hex, description, sort_order } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  if (!color_hex) throw new AppError(400, 'VALIDATION_ERROR', 'カラーコードは必須です');
  await execute(
    `UPDATE equipment_colors
     SET name=$1, color_hex=$2, description=$3, sort_order=$4, updated_at=NOW()
     WHERE id=$5 AND deleted_at IS NULL`,
    [name, color_hex, description || null, sort_order ?? 0, req.params.id],
  );
  const row = await queryOne('SELECT * FROM equipment_colors WHERE id = $1', [req.params.id]);
  res.json({ success: true, data: row });
}));

router.delete('/:id', requirePermission('equipment', 'manager'), wrap(async (req, res) => {
  await execute(
    'UPDATE equipment_colors SET deleted_at = NOW() WHERE id = $1',
    [req.params.id],
  );
  res.json({ success: true });
}));

export default router;
