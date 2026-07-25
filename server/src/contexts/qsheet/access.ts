// Qシート ドキュメントのアクセス制御ヘルパー (documents / pdf ルートで共用)
//   - 管理者 (system_admin) は全ドキュメント閲覧可
//   - それ以外は「作成者本人」または「共有されたユーザー」のみ閲覧可
import { queryOne } from '../../shared/db/connection';

interface AccessUser {
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
  if (share) return true;

  /**
   * **案件に紐づく Qシートは案件メンバーに既定で見える** (§4.12)。
   *
   * 従来は「作成者と管理者だけ」だったため、同じ案件を担当している人が
   * 共有設定をしてもらうまで台本を開けなかった (現場で毎回起きる)。
   * 共有テーブルは「案件の外の人にも見せる」ための足し算として残す。
   * 主担当 (`projects.assigned_to`) と担当メンバー (`project_members`) を案件メンバーとみなす。
   */
  const member = await queryOne(
    `SELECT 1
     FROM qsheet_documents d
     JOIN projects p ON p.id = d.project_id AND p.deleted_at IS NULL
     WHERE d.id = $1 AND d.project_id IS NOT NULL
       AND (
         p.assigned_to = $2
         OR EXISTS (
           SELECT 1 FROM project_members pm
           WHERE pm.project_id = p.id AND pm.user_id = $2 AND pm.deleted_at IS NULL
         )
       )`,
    [docId, user.id]
  );
  return !!member;
}
