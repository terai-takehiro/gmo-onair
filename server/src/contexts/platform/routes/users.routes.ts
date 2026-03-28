import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name LIKE ? OR email LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM users ${where}`, params) as any).c;
  const rows = queryAll(`SELECT id, name, email, role, created_at FROM users ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne('SELECT id, name, email, role, created_at FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, requireRole('system_admin'), (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email || !role) throw new AppError(400, 'VALIDATION_ERROR', '名前、メール、ロールは必須です');
  const id = uuidv4();
  execute('INSERT INTO users (id, name, email, role, created_by) VALUES (?, ?, ?, ?, ?)', [id, name, email, role, req.user!.id]);
  const row = queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, requireRole('system_admin'), (req, res) => {
  const existing = queryOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  const { name, email, role } = req.body;
  execute(`UPDATE users SET name=?, email=?, role=?, updated_at=datetime('now'), updated_by=? WHERE id=?`, [name, email, role, req.user!.id, req.params.id]);
  const row = queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, requireRole('system_admin'), (req, res) => {
  execute(`UPDATE users SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
