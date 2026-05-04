// 本番環境用: マスター管理者アカウントだけを確実に作成
// メールアドレスは ADMIN_EMAIL 環境変数で指定する。未設定なら no-op (ソースコードに直書きしない)
import { queryOne, execute } from './connection';

export async function ensureAdminUser(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL || '').trim();
  if (!email) {
    console.log('[seed-admin] ADMIN_EMAIL が未設定のためスキップ (管理者は別途 SQL/CLI で作成してください)');
    return;
  }
  // 簡易バリデーション
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`[seed-admin] ADMIN_EMAIL の形式が不正です: ${email}`);
    return;
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
  if (existing) return;

  const id = require('crypto').randomUUID();
  await execute(
    `INSERT INTO users (id, name, email, role, status) VALUES (?, ?, ?, 'system_admin', 'invited')`,
    [id, 'システム管理者', email],
  );
  console.log(`[seed-admin] マスター管理者を作成 (status=invited — 招待メールからパスワード設定が必要)`);
}
