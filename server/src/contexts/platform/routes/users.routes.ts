import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { sendMail, sendMailAsync } from '../../../shared/auth/email';
import { config } from '../../../config';

const router = Router();

// Apply auth to all user routes
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) {
    const safeSearch = String(search).slice(0, 100).replace(/[%_\\]/g, '\\$&');
    where += ` AND (name ILIKE ? ESCAPE '\\' OR email ILIKE ? ESCAPE '\\')`;
    params.push(`%${safeSearch}%`, `%${safeSearch}%`);
  }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM users ${where}`, params)) as any).c;
  const rows = await queryAll(`SELECT id, name, email, role, status, phone, created_at FROM users ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT id, name, email, role, status, phone, created_at FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireRole('system_admin'), async (req, res) => {
  const { name, email, role, phone } = req.body;
  if (!name || !email || !role) throw new AppError(400, 'VALIDATION_ERROR', '名前、メール、ロールは必須です');

  // 既存チェック (ソフト削除済みも含む)
  const existing = await queryOne('SELECT id, status, deleted_at FROM users WHERE email = ?', [email]) as any;
  if (existing && !existing.deleted_at && existing.status !== 'invited') {
    throw new AppError(409, 'ALREADY_EXISTS', 'このメールアドレスは既に登録されています');
  }
  // ソフト削除済みなら復活させる
  if (existing?.deleted_at) {
    await execute('UPDATE users SET deleted_at = NULL, status = ?, updated_at = NOW() WHERE id = ?', ['invited', existing.id]);
  }

  const id = existing?.id || uuidv4();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  if (existing) {
    await execute(
      `UPDATE users SET name=?, role=?, phone=?, invitation_token=?, invitation_expires_at=?, status='invited', updated_at=NOW() WHERE id=?`,
      [name, role, phone || null, token, expiresAt.toISOString(), id],
    );
  } else {
    await execute(
      `INSERT INTO users (id, name, email, role, phone, status, invitation_token, invitation_expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'invited', ?, ?, ?)`,
      [id, name, email, role, phone || null, token, expiresAt.toISOString(), req.user!.id],
    );
  }

  // 招待メール送信 (非同期 — API応答をブロックしない)
  const clientUrl = process.env.CLIENT_URL || config.clientUrl;
  const inviteUrl = `${clientUrl}/auth/accept-invitation?token=${token}`;
  sendMailAsync({
    to: email,
    subject: 'GMO ONAiR — アカウント招待',
    html: `<h2>GMO ONAiR へようこそ</h2><p><strong>${name}</strong> 様</p><p>GMO ONAiR へ招待されました。下記のリンクからパスワードを設定してください。</p><p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#005bac;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">アカウントを有効化</a></p><p style="color:#666;font-size:12px;">このリンクは7日間有効です。</p>`,
  });

  const row = await queryOne('SELECT id, name, email, role, status FROM users WHERE id = ?', [id]);
  res.status(201).json({
    success: true,
    data: row,
    message: `ユーザーを作成しました`,
    inviteUrl,
  });
});

router.put('/:id', requireRole('system_admin'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  const { name, email, role } = req.body;
  await execute(`UPDATE users SET name=?, email=?, role=?, updated_at=NOW(), updated_by=? WHERE id=?`, [name, email, role, req.user!.id, req.params.id]);
  const row = await queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireRole('system_admin'), async (req, res) => {
  await execute(`UPDATE users SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

// ============================================================
// パーミッション管理
// ============================================================

// ユーザーのパーミッション一覧
router.get('/:id/permissions', async (req, res) => {
  const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [req.params.id]);
  res.json({ success: true, data: perms });
});

// ユーザーのパーミッション一括更新
router.put('/:id/permissions', requireRole('system_admin'), async (req, res) => {
  const { permissions } = req.body; // { module: access_level } or { module: null } to remove
  if (!permissions || typeof permissions !== 'object') throw new AppError(400, 'VALIDATION_ERROR', 'permissions オブジェクトが必要です');

  // Delete removed permissions, then upsert remaining
  const modules = Object.keys(permissions);
  const toSet = Object.entries(permissions).filter(([, v]) => v) as [string, string][];
  const toRemove = modules.filter(m => !permissions[m]);

  if (toRemove.length > 0) {
    const placeholders = toRemove.map((_, i) => `?`).join(', ');
    await execute(`DELETE FROM user_permissions WHERE user_id = ? AND module IN (${placeholders})`, [req.params.id, ...toRemove]);
  }

  for (const [module, level] of toSet) {
    await execute(
      `INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, module) DO UPDATE SET access_level = EXCLUDED.access_level, updated_at = NOW()`,
      [uuidv4(), req.params.id, module, level]
    );
  }

  const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [req.params.id]);
  res.json({ success: true, data: perms });
});

// 現在ログインユーザーのパーミッション（クライアント用）
router.get('/me/permissions', async (req, res) => {
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
