import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name ILIKE ? OR email ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM users ${where}`, params)) as any).c;
  const rows = await queryAll(`SELECT id, name, email, role, created_at FROM users ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT id, name, email, role, created_at FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, requireRole('system_admin'), async (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email || !role) throw new AppError(400, 'VALIDATION_ERROR', '名前、メール、ロールは必須です');
  const id = uuidv4();
  await execute('INSERT INTO users (id, name, email, role, created_by) VALUES (?, ?, ?, ?, ?)', [id, name, email, role, req.user!.id]);
  const row = await queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, requireRole('system_admin'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  const { name, email, role } = req.body;
  await execute(`UPDATE users SET name=?, email=?, role=?, updated_at=NOW(), updated_by=? WHERE id=?`, [name, email, role, req.user!.id, req.params.id]);
  const row = await queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, requireRole('system_admin'), async (req, res) => {
  await execute(`UPDATE users SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

// ============================================================
// パーミッション管理
// ============================================================

// ユーザーのパーミッション一覧
router.get('/:id/permissions', requireAuth, async (req, res) => {
  const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [req.params.id]);
  res.json({ success: true, data: perms });
});

// ユーザーのパーミッション一括更新
router.put('/:id/permissions', requireAuth, requireRole('system_admin'), async (req, res) => {
  const { permissions } = req.body; // { module: access_level } or { module: null } to remove
  if (!permissions || typeof permissions !== 'object') throw new AppError(400, 'VALIDATION_ERROR', 'permissions オブジェクトが必要です');

  for (const [module, level] of Object.entries(permissions)) {
    if (!level) {
      // パーミッション削除
      await execute('DELETE FROM user_permissions WHERE user_id = ? AND module = ?', [req.params.id, module]);
    } else {
      // upsert
      const existing = await queryOne('SELECT id FROM user_permissions WHERE user_id = ? AND module = ?', [req.params.id, module]);
      if (existing) {
        await execute('UPDATE user_permissions SET access_level = ?, updated_at = NOW() WHERE user_id = ? AND module = ?', [level, req.params.id, module]);
      } else {
        await execute('INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?)', [uuidv4(), req.params.id, module, level]);
      }
    }
  }

  const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [req.params.id]);
  res.json({ success: true, data: perms });
});

// 現在ログインユーザーのパーミッション（クライアント用）
router.get('/me/permissions', requireAuth, async (req, res) => {
  if (req.user!.role === 'system_admin') {
    // system_admin は全モジュールfull
    res.json({ success: true, data: { _all: 'full' } });
    return;
  }
  const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [req.user!.id]);
  const permMap: Record<string, string> = {};
  for (const p of perms) {
    permMap[p.module as string] = p.access_level as string;
  }
  res.json({ success: true, data: permMap });
});

export default router;
