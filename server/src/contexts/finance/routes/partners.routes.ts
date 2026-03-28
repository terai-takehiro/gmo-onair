import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name LIKE ? OR role_title LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM partners ${where}`, params) as any).c;
  const rows = queryAll(`SELECT * FROM partners ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const parsed = rows.map(r => ({ ...r, specialties: JSON.parse((r.specialties as string) || '[]') }));
  res.json(paginatedResponse(parsed, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne('SELECT * FROM partners WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'パートナーが見つかりません');
  res.json({ success: true, data: { ...row, specialties: JSON.parse((row.specialties as string) || '[]') } });
});

router.post('/', requireAuth, (req, res) => {
  const { name, email, phone, role_title, specialties, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '氏名は必須です');
  const id = uuidv4();
  execute('INSERT INTO partners (id, name, email, phone, role_title, specialties, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, email || null, phone || null, role_title || null, JSON.stringify(specialties || []), notes || null, req.user!.id]);
  const row = queryOne('SELECT * FROM partners WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: { ...row, specialties: JSON.parse((row!.specialties as string) || '[]') } });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM partners WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'パートナーが見つかりません');
  const { name, email, phone, role_title, specialties, notes } = req.body;
  execute(`UPDATE partners SET name=?, email=?, phone=?, role_title=?, specialties=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [name, email || null, phone || null, role_title || null, JSON.stringify(specialties || []), notes || null, req.user!.id, req.params.id]);
  const row = queryOne('SELECT * FROM partners WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: { ...row, specialties: JSON.parse((row!.specialties as string) || '[]') } });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE partners SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
