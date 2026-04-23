// 機材メーカーマスタ CRUD
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
    `SELECT id, name, contact_person, address, phone, email, sort_order, notes
     FROM equipment_manufacturers WHERE deleted_at IS NULL ORDER BY sort_order, name`,
  );
  res.json({ success: true, data: rows });
}));

router.post('/', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  const { name, contact_person, address, phone, email, sort_order, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  const id = uuid();
  await execute(
    `INSERT INTO equipment_manufacturers (id, name, contact_person, address, phone, email, sort_order, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, name, contact_person || null, address || null, phone || null, email || null, sort_order ?? 0, notes || null],
  );
  const row = await queryOne('SELECT * FROM equipment_manufacturers WHERE id = $1', [id]);
  res.status(201).json({ success: true, data: row });
}));

router.put('/:id', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  const { name, contact_person, address, phone, email, sort_order, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  await execute(
    `UPDATE equipment_manufacturers
     SET name=$1, contact_person=$2, address=$3, phone=$4, email=$5,
         sort_order=$6, notes=$7, updated_at=NOW()
     WHERE id=$8 AND deleted_at IS NULL`,
    [name, contact_person || null, address || null, phone || null, email || null, sort_order ?? 0, notes || null, req.params.id],
  );
  const row = await queryOne('SELECT * FROM equipment_manufacturers WHERE id = $1', [req.params.id]);
  res.json({ success: true, data: row });
}));

router.delete('/:id', requirePermission('equipment', 'manager'), wrap(async (req, res) => {
  await execute(
    'UPDATE equipment_manufacturers SET deleted_at = NOW() WHERE id = $1',
    [req.params.id],
  );
  res.json({ success: true });
}));

export default router;
