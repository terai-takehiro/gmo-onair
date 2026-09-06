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
 * schedule に対して user がアクセス可能か（作成者 / 共有先 / **案件メンバー** / 管理者）を判定。
 * `canAccessDoc` と同じ形（04-schedule-impl.md §6-1）。
 * 全件見えるのは isQsheetAdmin（＝ system_admin）だけ — qsheet の manager でも
 * 他人の非共有表は見えない（documents 側と同じ約束）。
 *
 * ⚠️ **案件メンバーは自動で見える**（14-schedule-v2-plan.md §3-2・2026-09-06 決定）。
 * `qsheet_schedule_shares` に写さず、判定のたびに `project_members`／`projects.assigned_to`
 * を見る（メンバーの追加・削除に追随させるため）。番組（`qsheet_programs`）はメンバーを
 * 持たないので対象外 — 番組の表は今までどおり 作成者＋明示共有＋管理者のまま。
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
  if (share) return true;
  const member = await queryOne(
    `SELECT 1 FROM qsheet_schedules s WHERE s.id = $1 AND s.project_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = s.project_id AND pm.user_id = $2 AND pm.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM projects p WHERE p.id = s.project_id AND p.assigned_to = $2)
     )`,
    [scheduleId, user.id],
  );
  return !!member;
}

/**
 * AI 提案（`qsheet_ai_proposals`）に対して user がアクセス可能か。
 * 提案そのものは共有先を持たないので、**対象の台本 / スケジュール表のアクセス権限**に委ねる
 * （段7・07-ai-proposals-impl.md §1）。どちらも見つからない・アクセス不可なら false
 * （存在を秘匿するため、ルート側は 404 を返すこと）。
 */
export async function canAccessProposal(
  user: AccessUser,
  proposal: { document_id: string | null; schedule_id: string | null }
): Promise<boolean> {
  if (isQsheetAdmin(user)) return true;
  if (proposal.document_id) {
    const doc = await queryOne(
      'SELECT created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
      [proposal.document_id]
    );
    if (!doc) return false;
    return canAccessDoc(user, proposal.document_id, (doc.created_by as string) ?? null);
  }
  if (proposal.schedule_id) {
    const sch = await queryOne(
      'SELECT created_by FROM qsheet_schedules WHERE id = $1 AND deleted_at IS NULL',
      [proposal.schedule_id]
    );
    if (!sch) return false;
    return canAccessSchedule(user, proposal.schedule_id, (sch.created_by as string) ?? null);
  }
  return false;
}

/**
 * 壁打ちスレッド（`qsheet_ai_threads`）に対して user がアクセス可能か。
 * **本人のみ**（04-ai.md §14-8 の決定・段8）。チーム共有は第1版で作らない。
 * `system_admin` だけは既存の作法（`isQsheetAdmin`）に合わせて例外的に見える。
 */
export function canAccessThread(user: AccessUser, thread: { created_by: string }): boolean {
  return isQsheetAdmin(user) || thread.created_by === user.id;
}
