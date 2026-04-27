import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { sendMail, sendMailAsync } from '../../../shared/auth/email';
import { config } from '../../../config';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();

// Apply auth to all user routes
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
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
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await queryOne('SELECT id, name, email, role, status, phone, created_at FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  res.json({ success: true, data: row });
}));

router.post('/', requireRole('system_admin'), wrap(async (req, res) => {
  const { name, email, role, phone } = req.body;
  if (!name || !email || !role) throw new AppError(400, 'VALIDATION_ERROR', '名前、メール、ロールは必須です');
  if (!['system_admin', 'staff'].includes(role)) throw new AppError(400, 'VALIDATION_ERROR', '無効なロールです');

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
  });
}));

router.put('/:id', requireRole('system_admin'), wrap(async (req, res) => {
  const existing = await queryOne('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');
  const { name, email, role } = req.body;
  if (!['system_admin', 'staff'].includes(role)) throw new AppError(400, 'VALIDATION_ERROR', '無効なロールです');
  await execute(`UPDATE users SET name=?, email=?, role=?, updated_at=NOW(), updated_by=? WHERE id=?`, [name, email, role, req.user!.id, req.params.id]);

  const row = await queryOne('SELECT id, name, email, role FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
}));

router.delete('/:id', requireRole('system_admin'), wrap(async (req, res) => {
  await execute(`UPDATE users SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
}));

// 特定モジュールへのアクセス権を持つユーザー一覧 (プルダウン用)
router.get('/by-module/:module', wrap(async (req, res) => {
  const mod = req.params.module;
  const rows = await queryAll(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     LEFT JOIN user_permissions p ON p.user_id = u.id AND p.module = ?
     WHERE u.deleted_at IS NULL AND u.status = 'active'
       AND (u.role = 'system_admin' OR p.access_level IS NOT NULL)
     ORDER BY u.name`,
    [mod],
  );
  res.json({ success: true, data: rows });
}));

// ============================================================
// 診断 & 修復 (system_admin only)
// ============================================================

// 権限システムの状態確認
router.get('/admin/diagnostics', requireRole('system_admin'), wrap(async (_req, res) => {
  const migrations = await queryAll('SELECT name FROM _migrations ORDER BY name');
  const roleCounts = await queryAll(
    "SELECT role, COUNT(*)::int as count, COUNT(*) FILTER (WHERE deleted_at IS NULL)::int as active FROM users GROUP BY role"
  );
  const staffUsers = await queryAll(
    `SELECT u.id, u.name, u.email, u.role,
            COUNT(p.module)::int as perm_count,
            ARRAY_AGG(p.module || ':' || p.access_level) FILTER (WHERE p.module IS NOT NULL) as perms
     FROM users u
     LEFT JOIN user_permissions p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND u.role = 'staff'
     GROUP BY u.id, u.name, u.email, u.role
     ORDER BY u.name`
  );
  const totalPerms = ((await queryOne('SELECT COUNT(*)::int as c FROM user_permissions')) as any).c;
  res.json({
    success: true,
    data: {
      migrations: migrations.map(m => m.name),
      roleCounts,
      staffUsers,
      totalPermissions: totalPerms,
    },
  });
}));

// 全スタッフユーザーに欠けているデフォルト権限を一括付与
router.post('/admin/repair-permissions', requireRole('system_admin'), wrap(async (_req, res) => {
  // 1. 旧ロール → staff に強制移行 (soft-deleted 含む)
  const rolesBefore = await queryAll(
    `SELECT role, COUNT(*)::int as c FROM users WHERE role NOT IN ('system_admin', 'staff') GROUP BY role`
  );
  await execute(
    `UPDATE users SET role = 'staff', updated_at = NOW() WHERE role NOT IN ('system_admin', 'staff')`
  );

  // 2. CHECK 制約を NOT VALID で再作成 (古い制約が残っていた場合に備える)
  await execute(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await execute(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('system_admin', 'staff')) NOT VALID`);

  // 3. access_level 正規化
  await execute(`UPDATE user_permissions SET access_level = 'reader', updated_at = NOW() WHERE access_level = 'exporter'`);
  await execute(`UPDATE user_permissions SET access_level = 'manager', updated_at = NOW() WHERE access_level = 'owner'`);
  await execute(`ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_access_level_check`);
  await execute(`ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_access_level_check CHECK (access_level IN ('reader', 'editor', 'manager')) NOT VALID`);

  // 4. 全 staff ユーザーに欠けている権限を付与
  const defaultPerms: Record<string, string> = {
    sales: 'reader', budget: 'reader', studio: 'editor',
    equipment: 'reader', qsheet: 'editor', techsheet: 'editor', interactive: 'editor',
    liveops: 'reader', awards: 'reader',
  };
  const staffUsers = await queryAll(
    `SELECT id FROM users WHERE role = 'staff' AND deleted_at IS NULL`
  );
  const beforeCount = ((await queryOne(`SELECT COUNT(*)::int as c FROM user_permissions`)) as any).c;
  for (const u of staffUsers) {
    for (const [mod, level] of Object.entries(defaultPerms)) {
      await execute(
        `INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, module) DO NOTHING`,
        [uuidv4(), u.id as string, mod, level]
      );
    }
  }
  const afterCount = ((await queryOne(`SELECT COUNT(*)::int as c FROM user_permissions`)) as any).c;

  res.json({
    success: true,
    data: {
      rolesFixed: rolesBefore,
      staffCount: staffUsers.length,
      permissionsBefore: beforeCount,
      permissionsAfter: afterCount,
      permissionsInserted: afterCount - beforeCount,
    },
    message: '権限を修復しました',
  });
}));

// ============================================================
// パーミッション管理
// ============================================================

// ★ /me/permissions は /:id/permissions より先に定義（Express ルート優先順位）
router.get('/me/permissions', wrap(async (req, res) => {
  if (req.user!.role === 'system_admin') {
    res.json({ success: true, data: { _all: 'full' } });
    return;
  }
  const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [req.user!.id]);
  const permMap: Record<string, string> = {};
  for (const p of perms) {
    permMap[p.module as string] = p.access_level as string;
  }
  res.json({ success: true, data: permMap });
}));

// ユーザーのパーミッション一覧
router.get('/:id/permissions', wrap(async (req, res) => {
  const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [req.params.id]);
  res.json({ success: true, data: perms });
}));

// ユーザーのパーミッション一括更新
router.put('/:id/permissions', requireRole('system_admin'), wrap(async (req, res) => {
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
}));

export default router;
