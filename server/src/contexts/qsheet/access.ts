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
 * 運営マニュアル（`qsheet_manuals`）に対して user がアクセス可能か（作成者 / **案件メンバー** / 管理者）を判定。
 * `canAccessSchedule` と同じ形（production-manual.md §7-1）。
 *
 * ⚠️ **明示共有は無い**（`qsheet_schedule_shares` のような `qsheet_manual_shares` テーブルは作らない —
 * §7-1 の決定「案件メンバー全員に自動で見える」だけで個別共有は持たない）。
 * ⚠️ 番組（`program_id` が入っている冊子）は project_id を持たないため案件メンバー判定の対象外 —
 * 作成者本人 または `system_admin` にしか見えない（`canAccessSchedule` の番組と同じ制約）。
 */
export async function canAccessManual(
  user: AccessUser,
  manualId: string,
  createdBy: string | null
): Promise<boolean> {
  if (isQsheetAdmin(user)) return true;
  if (createdBy && createdBy === user.id) return true;
  const member = await queryOne(
    `SELECT 1 FROM qsheet_manuals m WHERE m.id = $1 AND m.project_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = m.project_id AND pm.user_id = $2 AND pm.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM projects p WHERE p.id = m.project_id AND p.assigned_to = $2)
     )`,
    [manualId, user.id],
  );
  return !!member;
}

/**
 * 冊子の**新規作成**で project_id に指定してよいか（案件メンバー / assigned_to / 管理者）。
 * `canAccessManual` と違い、まだ存在しない冊子の project_id を検査するので manualId を取らない
 * （レビュー指摘: `POST /manuals` が project_id を無検査で受けていた — 指定した本人が
 * `created_by` になり `canAccessManual` を通ってしまうため、他案件になりすまして作成すると
 * `resolve`（差し込み・段C）経由でその案件の配信の鍵・収録設定・レンタル機材等が読めてしまう）。
 *
 * program_id は対象外——`qsheet_programs` は「行単位の権限を持たない」設計
 * （`programs.routes.ts` 冒頭のコメント）で、qsheet の reader/editor なら誰でも全件に
 * 到達できるため、manual 作成時点で追加の制限を課す理由が無い（既存の到達可能性を
 * 超えて漏れるものが無い）。
 */
export async function canAssignManualProject(user: AccessUser, projectId: string): Promise<boolean> {
  if (isQsheetAdmin(user)) return true;
  const member = await queryOne(
    `SELECT 1 FROM projects p WHERE p.id = $1 AND (
       EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2 AND pm.deleted_at IS NULL)
       OR p.assigned_to = $2
     )`,
    [projectId, user.id],
  );
  return !!member;
}

/**
 * 会場図面（`qsheet_venue_layouts`）に対して user がアクセス可能か（作成者 / **案件メンバー** / 管理者）を判定。
 * `canAccessManual` と完全に同じ形（venue-layout.md §5-5「行の可視性は canAccessManual を写した
 * canAccessVenueLayout」）。
 *
 * ⚠️ 明示共有は無い（運営マニュアルと同じ）。番組（`program_id`）の図面は project_id を持たない
 * ため案件メンバー判定の対象外 —— 作成者本人 または `system_admin` にしか見えない
 * （`canAccessManual` の番組と同じ制約。冊子の resolver が `sourceId` の図面を読むときも
 * この関数で再検査する——`manual-resolvers/venue.resolver.ts` 参照）。
 */
export async function canAccessVenueLayout(
  user: AccessUser,
  layoutId: string,
  createdBy: string | null
): Promise<boolean> {
  if (isQsheetAdmin(user)) return true;
  if (createdBy && createdBy === user.id) return true;
  const member = await queryOne(
    `SELECT 1 FROM qsheet_venue_layouts v WHERE v.id = $1 AND v.project_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = v.project_id AND pm.user_id = $2 AND pm.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM projects p WHERE p.id = v.project_id AND p.assigned_to = $2)
     )`,
    [layoutId, user.id],
  );
  return !!member;
}

/**
 * 会場図面の**新規作成**で project_id に指定してよいか（案件メンバー / assigned_to / 管理者）。
 * `canAssignManualProject` と完全に同じ形——まだ存在しない図面の project_id を検査するので
 * layoutId を取らない（POST /manuals のレビュー指摘と同型の「project_id のなりすまし」を
 * 防ぐ関所。§5-5・§12-1）。
 */
export async function canAssignVenueLayoutProject(user: AccessUser, projectId: string): Promise<boolean> {
  if (isQsheetAdmin(user)) return true;
  const member = await queryOne(
    `SELECT 1 FROM projects p WHERE p.id = $1 AND (
       EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2 AND pm.deleted_at IS NULL)
       OR p.assigned_to = $2
     )`,
    [projectId, user.id],
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
