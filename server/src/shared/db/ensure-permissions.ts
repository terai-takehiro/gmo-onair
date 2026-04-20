/**
 * Idempotent permission bootstrap — runs on every server startup.
 *
 * 保険として毎回起動時に以下を実行:
 * 1. 旧ロール (viewer/external_client/editor/manager 等) を staff に統一
 * 2. CHECK 制約を NOT VALID で再作成 (既存制約が古い場合に備える)
 * 3. 全アクティブ staff ユーザーに欠けているデフォルト権限を付与
 *
 * ON CONFLICT DO NOTHING で既存設定は保持。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, execute } from './connection';

const DEFAULT_PERMS: Record<string, string> = {
  sales: 'reader',
  budget: 'reader',
  studio: 'editor',
  equipment: 'reader',
  qsheet: 'editor',
  techsheet: 'editor',
  interactive: 'editor',
};

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

    // 4. 欠けている権限を付与
    const staff = await queryAll(
      `SELECT id FROM users WHERE role = 'staff' AND deleted_at IS NULL`,
    );
    let inserted = 0;
    for (const u of staff) {
      for (const [mod, level] of Object.entries(DEFAULT_PERMS)) {
        const before = await queryAll(
          `SELECT 1 FROM user_permissions WHERE user_id = ? AND module = ?`,
          [u.id as string, mod],
        );
        if (before.length === 0) {
          await execute(
            `INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, module) DO NOTHING`,
            [uuidv4(), u.id as string, mod, level],
          );
          inserted++;
        }
      }
    }

    console.log(
      `[ensure-permissions] staff users: ${staff.length}, permissions inserted: ${inserted}`,
    );
  } catch (err) {
    console.error('[ensure-permissions] failed:', err);
    // サーバー起動は止めない — 権限修復は UI からもリトライ可能
  }
}
