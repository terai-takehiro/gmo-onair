import { queryOne } from '../db/connection';
import { meetsPermissionLevel } from '../middleware/auth';

/** 本番送出・計時の操作はHTTPと同じmanager以上。接続後の権限変更も反映する。 */
export async function canControlProduction(userId: unknown): Promise<boolean> {
  if (typeof userId !== 'string' || !userId) return false;
  try {
    const user = await queryOne(
      `SELECT u.role, p.access_level FROM users u
       LEFT JOIN user_permissions p ON p.user_id = u.id AND p.module = 'qsheet'
       WHERE u.id = ? AND u.deleted_at IS NULL AND u.status = 'active'`, [userId],
    );
    return !!user && meetsPermissionLevel(user.role as string, user.access_level as string | undefined, 'manager');
  } catch { return false; }
}
