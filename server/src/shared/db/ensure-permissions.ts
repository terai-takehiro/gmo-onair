/**
 * Idempotent permission bootstrap — runs on every server startup.
 *
 * 毎回起動時に以下を実行:
 * 1. 旧ロール (viewer/external_client/editor/manager 等) を staff に統一
 * 2. CHECK 制約を NOT VALID で再作成 (既存制約が古い場合に備える)
 * 3. アクセスレベル正規化 (exporter→reader, owner→manager)
 *
 * 権限行の追加・補完は行わない。管理者が設定した権限をそのまま保持する。
 */
import { execute } from './connection';

export async function ensureStaffPermissions(): Promise<void> {
  try {
    // 1. 旧ロール → staff
    await execute(
      `UPDATE users SET role = 'staff', updated_at = NOW() WHERE role NOT IN ('system_admin', 'staff')`,
    );

    // 2. CHECK 制約を NOT VALID で再作成
    await execute(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await execute(
      `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('system_admin', 'staff')) NOT VALID`,
    );

    // 3. アクセスレベル正規化
    await execute(
      `UPDATE user_permissions SET access_level = 'reader', updated_at = NOW() WHERE access_level = 'exporter'`,
    );
    await execute(
      `UPDATE user_permissions SET access_level = 'manager', updated_at = NOW() WHERE access_level = 'owner'`,
    );
    await execute(
      `ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_access_level_check`,
    );
    await execute(
      `ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_access_level_check CHECK (access_level IN ('reader', 'editor', 'manager')) NOT VALID`,
    );

    console.log(`[ensure-permissions] role/level normalization complete`);
  } catch (err) {
    console.error('[ensure-permissions] failed:', err);
    // サーバー起動は止めない
  }
}
