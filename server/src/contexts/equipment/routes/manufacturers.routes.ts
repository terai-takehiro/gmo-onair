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
    'SELECT id, name, sort_order, notes FROM equipment_manufacturers WHERE deleted_at IS NULL ORDER BY sort_order, name',
  );
  res.json({ success: true, data: rows });
}));

router.post('/', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  const { name, sort_order, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  const id = uuid();
  await execute(
    'INSERT INTO equipment_manufacturers (id, name, sort_order, notes) VALUES ($1, $2, $3, $4)',
    [id, name, sort_order ?? 0, notes || null],
  );
  const row = await queryOne('SELECT * FROM equipment_manufacturers WHERE id = $1', [id]);
  res.status(201).json({ success: true, data: row });
}));

router.put('/:id', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  const { name, sort_order, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  await execute(
    'UPDATE equipment_manufacturers SET name = $1, sort_order = $2, notes = $3, updated_at = NOW() WHERE id = $4 AND deleted_at IS NULL',
    [name, sort_order ?? 0, notes || null, req.params.id],
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
