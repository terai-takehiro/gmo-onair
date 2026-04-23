// 本番環境用: マスター管理者アカウントだけを確実に作成
import { queryOne, execute } from './connection';

export async function ensureAdminUser(): Promise<void> {
  const email = 'account@gmo-globalstudio.com';
  const existing = await queryOne('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
  if (existing) return; // 既に存在

  const id = require('crypto').randomUUID();
  await execute(
    `INSERT INTO users (id, name, email, role, status) VALUES (?, ?, ?, 'system_admin', 'invited')`,
    [id, 'システム管理者', email],
  );
  console.log(`[seed-admin] マスター管理者を作成: ${email} (status=invited — 招待メールからパスワード設定が必要)`);
}
