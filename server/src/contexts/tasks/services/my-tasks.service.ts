// 個人軸のタスクと依頼 — 「自分のタスク」「受けた/出した依頼」を扱う。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D1 / D2 / D3 / D9)
//
// project-tasks.service.ts は「案件のタスク」を案件軸で扱う。
// こちらは **人軸** で、案件タスクと個人タスク (project_id IS NULL) を混ぜて返す。
// dailyops の HTTP ルートと MCP がこの service を共有する (UI と AI を同一コードパスに)。
//
// 権限の注意 (要件 D0):
//   自分に割り当てられた案件タスクは sales 権限が無い人にも見せる必要があるため、
//   取得は assigned_to / requester_id が本人であることでスコープし sales 権限を要求しない。
//   ただし返すのは案件名と GLS 番号までで、金額は一切返さない。

import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

/** 期限が入っていない既存行を読むときに補う時刻 (終業時刻)。要件 D9 */
export const DEFAULT_DUE_HOUR = 18;

export type DelegationStatus = 'requested' | 'accepted' | 'declined' | 'consulting' | 'done';

export interface MyTask {
  id: string;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  importance: number;
  urgency: number;
  /** importance × urgency (期限が無ければ urgency は 1 として扱う)。1〜9 */
  priority_score: number;
  /** 9 マスのどのマスか。'3x1' = 重要 高 × 緊急 低 */
  priority_cell: string;
  is_completed: boolean;
  assigned_to: string | null;
  assigned_to_name: string | null;
  requester_id: string | null;
  requester_name: string | null;
  delegation_status: DelegationStatus | null;
  requested_at: string | null;
  accepted_at: string | null;
  source: string | null;
  source_ref: string | null;
  visibility: 'team' | 'private';
  is_overdue: boolean;
  created_at: string;
}

// 期限は due_at を正とし、未設定なら既存 due_date を「その日の 18:00」として補う。
// DB は書き換えず読み取り時だけ補完する (要件 D9)。
const DUE_EXPR = `COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)`;

// 期限が無ければ緊急度は 1 (低) として扱う。期限が無いのに緊急とは言えないため (要件 D9)。
// migration 135 の式インデックスと **同じ式** にしておく (ズレるとインデックスが効かない)。
const SCORE_EXPR = `(t.importance * CASE WHEN ${DUE_EXPR} IS NULL THEN 1 ELSE t.urgency END)`;

const SELECT_MY_TASK = `
  SELECT
    t.id, t.project_id, p.name AS project_name, p.gls_number,
    t.title, t.description,
    ${DUE_EXPR}::text            AS due_at,
    t.importance, t.urgency,
    ${SCORE_EXPR}                AS priority_score,
    t.is_completed,
    t.assigned_to, au.name       AS assigned_to_name,
    t.requester_id, ru.name      AS requester_name,
    t.delegation_status, t.requested_at, t.accepted_at,
    t.source, t.source_ref, t.visibility,
    (${DUE_EXPR} IS NOT NULL AND ${DUE_EXPR} < NOW() AND t.is_completed = FALSE) AS is_overdue,
    t.created_at
  FROM project_tasks t
  LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
  LEFT JOIN users au   ON au.id = t.assigned_to
  LEFT JOIN users ru   ON ru.id = t.requester_id
`;

// 同点の崩し方: ① 期限が近い順 → ② 重要度が高い順。
// ②で緊急度ではなく重要度を優先するのは、緊急に流されて重要が後回しになるのを防ぐため
// (これが 3 段階にした意味)。要件 D2。
const ORDER_BY_PRIORITY = `
  ORDER BY ${SCORE_EXPR} DESC,
           ${DUE_EXPR} ASC NULLS LAST,
           t.importance DESC,
           t.created_at DESC
`;

function decorate(row: Record<string, unknown>): MyTask {
  const importance = Number(row.importance ?? 2);
  const urgency = Number(row.urgency ?? 2);
  const effectiveUrgency = row.due_at ? urgency : 1;
  return {
    ...(row as unknown as MyTask),
    importance,
    urgency,
    priority_score: Number(row.priority_score ?? importance * effectiveUrgency),
    priority_cell: `${importance}x${effectiveUrgency}`,
  };
}

export interface MyTaskFilter {
  /** 完了済みも含めるか (既定 false) */
  includeCompleted?: boolean;
  /** 期限超過のみ */
  overdueOnly?: boolean;
  /** 期限が today 以前 (今日やること) */
  dueToday?: boolean;
  limit?: number;
}

export const myTasksService = {
  /**
   * 自分のタスク (案件タスク + 個人タスクを混ぜる)。
   * スコア順に並べて返す。9 マスのボードは priority_cell でグループ化して描く。
   */
  async listMyTasks(userId: string, filter: MyTaskFilter = {}): Promise<MyTask[]> {
    const params: unknown[] = [userId];
    let where = `WHERE t.deleted_at IS NULL
                   AND t.parent_task_id IS NULL
                   AND t.assigned_to = ?`;
    if (!filter.includeCompleted) where += ' AND t.is_completed = FALSE';
    // 辞退・相談中のものは受け手の「自分のタスク」から外す (依頼者に差し戻されている)
    where += ` AND (t.delegation_status IS NULL
                    OR t.delegation_status NOT IN ('declined', 'consulting'))`;
    if (filter.overdueOnly) where += ` AND ${DUE_EXPR} IS NOT NULL AND ${DUE_EXPR} < NOW()`;
    if (filter.dueToday) where += ` AND ${DUE_EXPR} IS NOT NULL AND ${DUE_EXPR} < (CURRENT_DATE + 1)`;

    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
    const rows = await queryAll(
      `${SELECT_MY_TASK} ${where} ${ORDER_BY_PRIORITY} LIMIT ?`,
      [...params, limit]
    );
    return rows.map(decorate);
  },

  /**
   * 依頼の一覧。
   * received = 自分が受けた依頼 / sent = 自分が出した依頼。
   * 辞退・相談中も含める (消さずに差し戻して残すため。要件 D3)。
   */
  async listMyDelegations(
    userId: string,
    direction: 'received' | 'sent',
    opts: { includeDone?: boolean; limit?: number } = {}
  ): Promise<MyTask[]> {
    const col = direction === 'received' ? 't.assigned_to' : 't.requester_id';
    // 依頼として成立している行だけ (requester_id があるもの)
    let where = `WHERE t.deleted_at IS NULL
                   AND t.parent_task_id IS NULL
                   AND t.requester_id IS NOT NULL
                   AND ${col} = ?`;
    if (!opts.includeDone) where += ' AND t.is_completed = FALSE';

    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
    const rows = await queryAll(
      // 未承諾を先に出す (待たせているものから片づけるため)
      `${SELECT_MY_TASK} ${where}
       ORDER BY (t.delegation_status = 'requested') DESC,
                ${SCORE_EXPR} DESC,
                ${DUE_EXPR} ASC NULLS LAST
       LIMIT ?`,
      [userId, limit]
    );
    return rows.map(decorate);
  },

  /** タスク 1 件 (人軸のビューで返す) */
  async get(id: string): Promise<MyTask> {
    const row = await queryOne(
      `${SELECT_MY_TASK} WHERE t.id = ? AND t.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
    return decorate(row);
  },

  /**
   * 依頼または個人タスクを 1 件作る。
   *
   * - project_id を省略すると個人タスク (案件に紐づかない)
   * - requester_id を渡すと「依頼」になり delegation_status='requested' で始まる
   * - **依頼のときは due_at を必須にする** (「いつまでに」の無い依頼は指示として
   *   成立していない。要件 D9)
   */
  async createTask(
    data: {
      title: string;
      description?: string | null;
      project_id?: string | null;
      assigned_to: string;
      requester_id?: string | null;
      due_at?: string | null;
      importance?: number;
      urgency?: number;
      source?: string | null;
      source_ref?: string | null;
      visibility?: 'team' | 'private';
    },
    userId: string
  ): Promise<MyTask> {
    if (!data.title?.trim()) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');
    if (!data.assigned_to) throw new AppError(400, 'VALIDATION_ERROR', '担当者は必須です');

    const isDelegation = !!data.requester_id;
    if (isDelegation && !data.due_at) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '依頼には期限が必要です。何月何日何時何分までかを指定してください'
      );
    }
    if (data.importance != null && (data.importance < 1 || data.importance > 3)) {
      throw new AppError(400, 'VALIDATION_ERROR', '重要度は 1〜3 で指定してください');
    }
    if (data.urgency != null && (data.urgency < 1 || data.urgency > 3)) {
      throw new AppError(400, 'VALIDATION_ERROR', '緊急度は 1〜3 で指定してください');
    }
    if (data.project_id) {
      const proj = await queryOne(
        'SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL',
        [data.project_id]
      );
      if (!proj) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    }
    const assignee = await queryOne('SELECT id FROM users WHERE id = ?', [data.assigned_to]);
    if (!assignee) throw new AppError(404, 'NOT_FOUND', '担当者のユーザーが見つかりません');

    const id = uuidv4();
    await execute(
      `INSERT INTO project_tasks
         (id, project_id, title, description, task_type,
          assigned_to, requester_id, requested_at, delegation_status,
          due_at, importance, urgency, source, source_ref, visibility,
          sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'free',
               ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?,
               0, ?, ?)`,
      [
        id,
        data.project_id ?? null,
        data.title.trim(),
        data.description ?? null,
        data.assigned_to,
        data.requester_id ?? null,
        isDelegation ? new Date().toISOString() : null,
        isDelegation ? 'requested' : null,
        data.due_at ?? null,
        data.importance ?? 2,
        data.urgency ?? 2,
        data.source ?? null,
        data.source_ref ?? null,
        data.visibility ?? 'team',
        userId,
        userId,
      ]
    );
    return this.get(id);
  },

  /**
   * 依頼への返答。
   * **辞退・相談でも行を消さない。** 消えたら「頼んだのに忘れられた」に戻るため、
   * 依頼者の「出した依頼」に差し戻しとして残す (要件 D3)。
   */
  async respondToDelegation(
    taskId: string,
    userId: string,
    decision: 'accepted' | 'declined' | 'consulting',
    note?: string | null
  ): Promise<MyTask> {
    const row = await queryOne(
      `SELECT id, assigned_to, requester_id, delegation_status
       FROM project_tasks WHERE id = ? AND deleted_at IS NULL`,
      [taskId]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
    if (!row.requester_id) throw new AppError(400, 'VALIDATION_ERROR', 'これは依頼ではないため返答できません');
    if (row.assigned_to !== userId) {
      throw new AppError(403, 'FORBIDDEN', '自分が受けた依頼にだけ返答できます');
    }

    // 返答の内容は description に追記して残す (やり取りの記録として消さない)
    const appended = note?.trim()
      ? `\n\n[${decision === 'accepted' ? '承諾' : decision === 'declined' ? '辞退' : '相談'}] ${note.trim()}`
      : '';

    await execute(
      `UPDATE project_tasks
       SET delegation_status = ?,
           accepted_at = CASE WHEN ? = 'accepted' THEN NOW() ELSE NULL END,
           description = COALESCE(description, '') || ?,
           updated_at = NOW(), updated_by = ?
       WHERE id = ?`,
      [decision, decision, appended, userId, taskId]
    );
    return this.get(taskId);
  },

  /**
   * タスクを直す (人軸)。
   *
   * 権限は **担当者本人または依頼者** に限る。case タスクでも sales 権限は要求しない
   * (要件 D0: 自分に割り当てられたものは触れないと使えない)。
   * ただし案件の付け替えはここではやらない (案件軸の責務なので project-tasks 側)。
   */
  async updateMyTask(
    taskId: string,
    userId: string,
    patch: {
      title?: string;
      description?: string | null;
      due_at?: string | null;
      importance?: number;
      urgency?: number;
      visibility?: 'team' | 'private';
      is_completed?: boolean;
    }
  ): Promise<MyTask> {
    const row = await queryOne(
      `SELECT id, assigned_to, requester_id, delegation_status
       FROM project_tasks WHERE id = ? AND deleted_at IS NULL`,
      [taskId]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
    if (row.assigned_to !== userId && row.requester_id !== userId) {
      throw new AppError(403, 'FORBIDDEN', '自分のタスクか自分が出した依頼だけ直せます');
    }
    if (patch.importance != null && (patch.importance < 1 || patch.importance > 3)) {
      throw new AppError(400, 'VALIDATION_ERROR', '重要度は 1〜3 で指定してください');
    }
    if (patch.urgency != null && (patch.urgency < 1 || patch.urgency > 3)) {
      throw new AppError(400, 'VALIDATION_ERROR', '緊急度は 1〜3 で指定してください');
    }
    // 依頼から期限を消させない。「いつまでに」の無い依頼は指示として成立していない (要件 D9)
    if (row.requester_id && patch.due_at === null) {
      throw new AppError(
        400, 'VALIDATION_ERROR',
        '依頼の期限は空にできません。何月何日何時何分までかを指定してください'
      );
    }
    if (patch.title !== undefined && !patch.title.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
    if (patch.title !== undefined) set('title', patch.title.trim());
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.due_at !== undefined) set('due_at', patch.due_at);
    if (patch.importance !== undefined) set('importance', patch.importance);
    if (patch.urgency !== undefined) set('urgency', patch.urgency);
    if (patch.visibility !== undefined) set('visibility', patch.visibility);
    if (patch.is_completed !== undefined) {
      set('is_completed', patch.is_completed);
      sets.push(`completed_at = ${patch.is_completed ? 'NOW()' : 'NULL'}`);
      // 依頼を完了させたら依頼者側の一覧でも「done」と分かるようにする (要件 D3)
      if (row.requester_id && patch.is_completed) set('delegation_status', 'done');
    }
    if (sets.length === 0) return this.get(taskId);

    await execute(
      `UPDATE project_tasks SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ?
       WHERE id = ?`,
      [...params, userId, taskId]
    );
    return this.get(taskId);
  },

  /**
   * 差し戻された依頼を依頼者が片づける (要件 D3)。
   *
   * 辞退・相談された依頼は**消えない**ので、依頼者が
   * 「自分でやる / 別の人に振り直す / 取り下げる」のいずれかを決めるまで残り続ける。
   * ここはその決着をつける操作。**依頼者だけ**が呼べる。
   */
  async resolveDelegation(
    taskId: string,
    userId: string,
    action: 'take_over' | 'reassign' | 'withdraw',
    payload: { assigned_to?: string; due_at?: string | null } = {}
  ): Promise<MyTask | null> {
    const row = await queryOne(
      `SELECT id, assigned_to, requester_id FROM project_tasks
       WHERE id = ? AND deleted_at IS NULL`,
      [taskId]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
    if (!row.requester_id) throw new AppError(400, 'VALIDATION_ERROR', 'これは依頼ではありません');
    if (row.requester_id !== userId) {
      throw new AppError(403, 'FORBIDDEN', '自分が出した依頼だけ片づけられます');
    }

    if (action === 'take_over') {
      // 依頼をやめて自分のタスクにする。requester_id を外すので依頼ではなくなる
      await execute(
        `UPDATE project_tasks
         SET assigned_to = ?, requester_id = NULL, delegation_status = NULL,
             requested_at = NULL, accepted_at = NULL,
             updated_at = NOW(), updated_by = ?
         WHERE id = ?`,
        [userId, userId, taskId]
      );
      return this.get(taskId);
    }

    if (action === 'reassign') {
      if (!payload.assigned_to) {
        throw new AppError(400, 'VALIDATION_ERROR', '振り直す相手を指定してください');
      }
      if (payload.assigned_to === userId) {
        throw new AppError(400, 'VALIDATION_ERROR', '自分に振り直す場合は「自分でやる」を使ってください');
      }
      const assignee = await queryOne('SELECT id FROM users WHERE id = ?', [payload.assigned_to]);
      if (!assignee) throw new AppError(404, 'NOT_FOUND', '振り直す相手のユーザーが見つかりません');
      // 相手が変わるので未承諾に戻す (新しい相手はまだ何も答えていない)
      const sets = [
        'assigned_to = ?', "delegation_status = 'requested'",
        'requested_at = NOW()', 'accepted_at = NULL',
      ];
      const params: unknown[] = [payload.assigned_to];
      if (payload.due_at !== undefined && payload.due_at !== null) {
        sets.push('due_at = ?'); params.push(payload.due_at);
      }
      await execute(
        `UPDATE project_tasks SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ?
         WHERE id = ?`,
        [...params, userId, taskId]
      );
      return this.get(taskId);
    }

    // withdraw = 取り下げ。ここだけは消す (依頼者自身が「もう要らない」と決めた場合)
    await execute(
      `UPDATE project_tasks SET deleted_at = NOW(), updated_at = NOW(), updated_by = ?
       WHERE id = ?`,
      [userId, taskId]
    );
    return null;
  },

  /**
   * チームの負荷 (要件 D8「チーム」タブ)。
   *
   * **中身は返さない。件数だけ。** `visibility='private'` のタスクも件数には入るが
   * タイトルは一切返さないので、個人の予定が覗かれない。
   * 「誰が溢れているか」を見て仕事を配り直すための画面なので、件数で足りる。
   */
  async getTeamLoad(): Promise<{
    user_id: string;
    user_name: string;
    open_count: number;
    overdue_count: number;
    top_priority_count: number;
    unanswered_count: number;
    private_count: number;
    no_due_count: number;
  }[]> {
    const rows = await queryAll(
      `SELECT
         u.id                                   AS user_id,
         u.name                                 AS user_name,
         COUNT(t.id)                            AS open_count,
         COUNT(t.id) FILTER (WHERE ${DUE_EXPR} IS NOT NULL AND ${DUE_EXPR} < NOW())
                                                AS overdue_count,
         COUNT(t.id) FILTER (WHERE ${SCORE_EXPR} >= 9) AS top_priority_count,
         COUNT(t.id) FILTER (WHERE t.delegation_status = 'requested')
                                                AS unanswered_count,
         COUNT(t.id) FILTER (WHERE t.visibility = 'private') AS private_count,
         COUNT(t.id) FILTER (WHERE ${DUE_EXPR} IS NULL) AS no_due_count
       FROM users u
       LEFT JOIN user_permissions perm ON perm.user_id = u.id AND perm.module = 'dailyops'
       LEFT JOIN project_tasks t
              ON t.assigned_to = u.id
             AND t.deleted_at IS NULL
             AND t.parent_task_id IS NULL
             AND t.is_completed = FALSE
             AND (t.delegation_status IS NULL
                  OR t.delegation_status NOT IN ('declined', 'consulting'))
       WHERE u.deleted_at IS NULL AND u.status = 'active'
         AND (u.role = 'system_admin' OR perm.access_level IS NOT NULL)
       GROUP BY u.id, u.name
       ORDER BY COUNT(t.id) FILTER (WHERE ${DUE_EXPR} IS NOT NULL AND ${DUE_EXPR} < NOW()) DESC,
                COUNT(t.id) DESC, u.name`
    );
    return rows.map((r) => ({
      user_id: String(r.user_id),
      user_name: String(r.user_name),
      open_count: Number(r.open_count ?? 0),
      overdue_count: Number(r.overdue_count ?? 0),
      top_priority_count: Number(r.top_priority_count ?? 0),
      unanswered_count: Number(r.unanswered_count ?? 0),
      private_count: Number(r.private_count ?? 0),
      no_due_count: Number(r.no_due_count ?? 0),
    }));
  },

  /**
   * 投入者の「確認待ち」件数 + 自分に関係する未対応の件数。
   * トップページのカードとヘッダーのベルが使う (要件 D7)。
   */
  async getMySummary(userId: string): Promise<{
    pending_intakes: number;
    unanswered_delegations: number;
    overdue: number;
    due_today: number;
    no_due_date: number;
  }> {
    const row = await queryOne(
      `SELECT
         (SELECT COUNT(*) FROM task_intake
           WHERE created_by = ? AND status = 'pending' AND deleted_at IS NULL) AS pending_intakes,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.assigned_to = ? AND t.requester_id IS NOT NULL
             AND t.delegation_status = 'requested'
             AND t.is_completed = FALSE AND t.deleted_at IS NULL) AS unanswered_delegations,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.assigned_to = ? AND t.is_completed = FALSE AND t.deleted_at IS NULL
             AND ${DUE_EXPR} IS NOT NULL AND ${DUE_EXPR} < NOW()) AS overdue,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.assigned_to = ? AND t.is_completed = FALSE AND t.deleted_at IS NULL
             AND ${DUE_EXPR} >= CURRENT_DATE AND ${DUE_EXPR} < (CURRENT_DATE + 1)) AS due_today,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.assigned_to = ? AND t.is_completed = FALSE AND t.deleted_at IS NULL
             AND ${DUE_EXPR} IS NULL) AS no_due_date`,
      [userId, userId, userId, userId, userId]
    );
    return {
      pending_intakes: Number(row?.pending_intakes ?? 0),
      unanswered_delegations: Number(row?.unanswered_delegations ?? 0),
      overdue: Number(row?.overdue ?? 0),
      due_today: Number(row?.due_today ?? 0),
      no_due_date: Number(row?.no_due_date ?? 0),
    };
  },
};
