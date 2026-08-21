// Qシート ドキュメントのアクセス制御ヘルパー (documents / pdf ルートで共用)
//   - 管理者 (system_admin) は全ドキュメント閲覧可
//   - それ以外は「作成者本人」または「共有されたユーザー」のみ閲覧可
import { queryOne } from '../../shared/db/connection';

export interface AccessUser {
  id: string;
  role: string;
  permissions?: Record<string, string>;
}

// 全件閲覧できる「管理者」は system_admin のみ (qsheet manager/owner でも他人の非共有シートは見えない)
export function isQsheetAdmin(user: AccessUser): boolean {
  return user.role === 'system_admin';
}

/** doc に対して user がアクセス可能か (作成者 / 共有先 / 管理者) を判定 */
export async function canAccessDoc(
  user: AccessUser,
  docId: string,
  createdBy: string | null
): Promise<boolean> {
  if (isQsheetAdmin(user)) return true;
  if (createdBy && createdBy === user.id) return true;
  const share = await queryOne(
    'SELECT 1 FROM qsheet_document_shares WHERE document_id = $1 AND user_id = $2',
    [docId, user.id]
  );
  return !!share;
}

/**
 * schedule に対して user がアクセス可能か（作成者 / 共有先 / 管理者）を判定。
 * `canAccessDoc` と同じ形（04-schedule-impl.md §6-1）。
 * 全件見えるのは isQsheetAdmin（＝ system_admin）だけ — qsheet の manager でも
 * 他人の非共有表は見えない（documents 側と同じ約束）。
 */
export async function canAccessSchedule(
  user: AccessUser,
  scheduleId: string,
  createdBy: string | null
): Promise<boolean> {
  if (isQsheetAdmin(user)) return true;
  if (createdBy && createdBy === user.id) return true;
  const share = await queryOne(
    'SELECT 1 FROM qsheet_schedule_shares WHERE schedule_id = $1 AND user_id = $2',
    [scheduleId, user.id]
  );
  return !!share;
}
