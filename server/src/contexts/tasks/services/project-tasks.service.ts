import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
/**
 * AI（MCP `create_gpm_task`）が起票したタスクを人が直したときの差分の記録。
 * GLS-B のタスクは GPM の口（`gpm.service`）だけでなく**この update も通る**
 * （案件詳細のガント・MCP の `update_task`）。ここに入れないと、ツールの説明が
 * 「細かい編集は update_task で」と誘導している経路の修正だけが黙って数えられない。
 * AI 起票でない行では 1 SELECT の no-op（7日窓・失敗しても保存は成功のまま）。
 */
import { recordGpmTaskCorrections } from '../../gpm/services/gpm-ai-feedback.service';

export interface ProjectTask {
  id: string;
  project_id: string;
  episode_id: string | null;
  column_id: string | null;
  title: string;
  description: string | null;
  task_type: 'free' | 'checklist' | 'production_step' | 'sales';
  production_step: 'script' | 'materials' | 'recording' | null;
  start_date: string | null;
  /**
   * 期限の**日付**（後方互換の表示用）。正は `due_at` で、この値は
   * `COALESCE(due_at, due_date+18:00)` の日付部分。カンバン・ガントが読む
   */
  due_date: string | null;
  /** 期限（時刻つき・唯一の正）。docs/core-redesign-plan.md §3-4 */
  due_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  is_completed: boolean;
  completed_at: string | null;
  /**
   * 完了していないときの止まり方 (`todo` 未着手 / `doing` 進行中 / `waiting` 相手待ち)。
   * **完了かどうかは `is_completed` が正** — この列は完了していないときだけ意味を持つ
   * (migration 137 に理由がある)。画面の状態 = `is_completed ? '完了' : work_state`
   */
  work_state: 'todo' | 'doing' | 'waiting';
  progress: number;
  is_milestone: boolean;
  sort_order: number;
  parent_task_id: string | null;
  column_name: string | null;
  column_color: string | null;
  children?: ProjectTask[];
  created_at: string;
  updated_at: string;
  /** v2.9.198+: AI (MCP create_task) が作成したタスクか (mcp_audit_log 照合) */
  is_ai_created?: boolean;
  ai_requested_by?: string | null;
}

/** 未完了のときの止まり方。**知らない値は「未着手」に丸める** */
const WORK_STATES = ['todo', 'doing', 'waiting'] as const;

/**
 * `work_state` を安全な値にする。
 *
 * 素通しすると CHECK 制約に当たって**リクエストごと 500 になり**、
 * 画面には「保存できませんでした」としか出ません (何が悪いのか分からない)。
 * 状態は3つしかないので、知らない値は既定に丸めるほうが害が小さい。
 */
function normalizeWorkState(value: unknown): 'todo' | 'doing' | 'waiting' {
  return (WORK_STATES as readonly string[]).includes(value as string)
    ? (value as 'todo' | 'doing' | 'waiting')
    : 'todo';
}

/**
 * 期限の読みの唯一の式（根源整理 §3-4）。**書き手がどちらの列に書いても同じ期限が見える。**
 * my-tasks.service.ts の DUE_EXPR と同じ形（時刻の無い旧行は終業 18:00 として補う）。
 * ずれると「マイタスクで直した期限がカンバンに出ない」が再発する
 * （shared/tests/taskDueUnification.test.ts が固定している）。
 */
const DUE_EXPR = `COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)`;

// v2.9.198+: AI 作成判定の lateral はパラメータ無しのため $n 採番に影響しない
const SELECT_TASK = `
  SELECT
    t.id, t.project_id, t.episode_id, t.column_id,
    t.title, t.description, t.task_type, t.production_step,
    t.start_date::text AS start_date,
    ${DUE_EXPR}::date::text AS due_date,
    ${DUE_EXPR}::text AS due_at,
    t.assigned_to, u.name AS assigned_to_name,
    t.is_completed, t.completed_at, t.work_state, t.progress, t.is_milestone,
    t.sort_order, t.parent_task_id,
    tc.name AS column_name, tc.color AS column_color,
    t.created_at, t.updated_at,
    (ai.audit_id IS NOT NULL) AS is_ai_created,
    ai.requested_by AS ai_requested_by
  FROM project_tasks t
  LEFT JOIN users u ON u.id = t.assigned_to
  LEFT JOIN task_columns tc ON tc.id = t.column_id AND tc.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
    WHERE m.tool_name = 'create_task' AND m.result_summary->>'created_id' = t.id
    ORDER BY m.created_at ASC LIMIT 1
  ) ai ON TRUE
`;

export interface TaskFilter {
  episodeId?: string | null;
  columnId?: string;
}

/**
 * 親タスク・回（エピソード）が**その案件のものか**を確かめる。
 * null / undefined は「付けない」なので素通し。
 */
async function assertBelongsToProject(
  projectId: string,
  parentTaskId: string | null | undefined,
  episodeId: string | null | undefined,
): Promise<void> {
  if (parentTaskId) {
    const p = await queryOne(
      `SELECT id FROM project_tasks WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [parentTaskId, projectId]
    );
    if (!p) throw new AppError(400, 'VALIDATION_ERROR', 'その親タスクはこの案件のものではありません');
  }
  if (episodeId) {
    const e = await queryOne(
      `SELECT id FROM episodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [episodeId, projectId]
    );
    if (!e) throw new AppError(400, 'VALIDATION_ERROR', 'その回はこの案件のものではありません');
  }
}

export const projectTasksService = {
  async list(projectId: string, filter: TaskFilter = {}): Promise<ProjectTask[]> {
    const params: unknown[] = [projectId];
    let idx = 2;

    let episodeClause = '';
    if (filter.episodeId !== undefined) {
      if (filter.episodeId === null) {
        episodeClause = '';
      } else {
        episodeClause = `AND (t.episode_id IS NULL OR t.episode_id = $${idx++})`;
        params.push(filter.episodeId);
      }
    }

    const colClause = filter.columnId
      ? `AND t.column_id = $${idx++}`
      : '';
    if (filter.columnId) params.push(filter.columnId);

    const rows = (await queryAll(
      `${SELECT_TASK}
       WHERE t.project_id = $1
         AND t.deleted_at IS NULL
         AND t.parent_task_id IS NULL
         ${episodeClause}
         ${colClause}
       ORDER BY t.column_id NULLS LAST, t.sort_order, t.created_at`,
      params
    )) as unknown as ProjectTask[];

    if (rows.length === 0) return [];

    const parentIds = rows.map((r) => r.id);
    const children = (await queryAll(
      `${SELECT_TASK}
       WHERE t.parent_task_id = ANY($1::text[])
         AND t.deleted_at IS NULL
       ORDER BY t.sort_order, t.created_at`,
      [parentIds]
    )) as unknown as ProjectTask[];

    const childMap = new Map<string, ProjectTask[]>();
    for (const child of children) {
      const pid = child.parent_task_id as string;
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(child);
    }

    return rows.map((r) => ({ ...r, children: childMap.get(r.id) ?? [] }));
  },

  async getById(id: string): Promise<ProjectTask | null> {
    const task = (await queryOne(
      `${SELECT_TASK} WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [id]
    )) as unknown as ProjectTask | undefined;
    if (!task) return null;

    const children = (await queryAll(
      `${SELECT_TASK}
       WHERE t.parent_task_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.sort_order, t.created_at`,
      [id]
    )) as unknown as ProjectTask[];

    return { ...task, children };
  },

  async create(
    projectId: string,
    data: {
      title: string;
      description?: string | null;
      task_type?: ProjectTask['task_type'];
      production_step?: ProjectTask['production_step'];
      episode_id?: string | null;
      column_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
      assigned_to?: string | null;
      parent_task_id?: string | null;
      progress?: number;
      is_milestone?: boolean;
      work_state?: ProjectTask['work_state'];
    },
    userId: string
  ): Promise<ProjectTask> {
    // **他の案件の親・回には付けさせない**（gpm.service の resolvePhaseId と同じ理由）。
    // 付いてしまうと、別案件のチェックリスト配下に表示される一方で
    // この案件の一覧（top-level → children）からは見えない不可視タスクができる
    await assertBelongsToProject(projectId, data.parent_task_id, data.episode_id);
    const id = uuidv4();

    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS max
       FROM project_tasks
       WHERE project_id = $1
         AND column_id IS NOT DISTINCT FROM $2
         AND deleted_at IS NULL
         AND parent_task_id IS NULL`,
      [projectId, data.column_id ?? null]
    );
    const sortOrder = ((maxRow?.max as number) ?? -1) + 1;

    await execute(
      // 期限は due_at（時刻つき）にも書く（根源整理 §3-4: 書き手は全員 due_at を書く）。
      // 日付しか受けない口なので終業 18:00 を補う。due_date は互換のため残す
      `INSERT INTO project_tasks
         (id, project_id, episode_id, column_id, title, description,
          task_type, production_step, start_date, due_date, due_at,
          assigned_to, sort_order, parent_task_id, progress, is_milestone,
          work_state,
          created_at, updated_at, created_by, updated_by)
       VALUES
         ($1, $2, $3, $4, $5, $6,
          $7, $8, $9::date, $10::date, ($10::date + TIME '18:00')::timestamp,
          $11, $12, $13, $14, $15,
          $16,
          NOW(), NOW(), $17, $17)`,
      [
        id, projectId,
        data.episode_id ?? null, data.column_id ?? null,
        data.title, data.description ?? null,
        data.task_type ?? 'free', data.production_step ?? null,
        data.start_date ?? null, data.due_date ?? null,
        data.assigned_to ?? null, sortOrder,
        data.parent_task_id ?? null,
        Math.max(0, Math.min(100, data.progress ?? 0)), data.is_milestone ?? false,
        normalizeWorkState(data.work_state),
        userId,
      ]
    );

    return (await this.getById(id))!;
  },

  async update(
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      task_type: ProjectTask['task_type'];
      production_step: ProjectTask['production_step'];
      episode_id: string | null;
      column_id: string | null;
      start_date: string | null;
      due_date: string | null;
      assigned_to: string | null;
      progress: number;
      is_milestone: boolean;
      work_state: ProjectTask['work_state'];
    }>,
    userId: string
  ): Promise<ProjectTask> {
    const existing = await queryOne(
      `SELECT id, project_id FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    ) as { id: string; project_id: string | null } | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');
    // 回の付け替えも同じ確認を通す（create と同じ理由）
    if ('episode_id' in data && existing.project_id) {
      await assertBelongsToProject(existing.project_id, null, data.episode_id);
    }

    // AI 起票の修正差分用の before（gpm-ai-feedback の TASK_FIELDS と同じ列・
    // 期限は日付に丸めて比べる。gpm.service の update と同じ形）
    const FEEDBACK_COLS = `SELECT title, description, assigned_to,
              due_at::date::text AS due_date, gpm_phase_id
         FROM project_tasks WHERE id = $1`;
    const feedbackBefore = await queryOne(FEEDBACK_COLS, [id]) as Record<string, unknown> | null;

    const sets: string[] = ['updated_at = NOW()', 'updated_by = $2'];
    const params: unknown[] = [id, userId];
    let i = 3;

    const fields = [
      'title', 'description', 'task_type', 'production_step',
      'episode_id', 'column_id', 'assigned_to', 'is_milestone',
    ] as const;

    for (const f of fields) {
      if (f in data) { sets.push(`${f} = $${i++}`); params.push((data as Record<string, unknown>)[f]); }
    }
    if ('progress' in data) {
      sets.push(`progress = $${i++}`);
      params.push(Math.max(0, Math.min(100, Number(data.progress) || 0)));
    }
    if ('work_state' in data) {
      // 知らない値が入ると CHECK 制約でリクエストごと 500 になる。手前で丸める
      sets.push(`work_state = $${i++}`);
      params.push(normalizeWorkState(data.work_state));
    }
    if ('start_date' in data) { sets.push(`start_date = $${i++}::date`); params.push(data.start_date); }
    if ('due_date' in data) {
      // 期限は due_at にも書く（根源整理 §3-4）。同じ $n を2回使うのは
      // 「同じ日付から作る」ことを SQL の形で保証するため（別パラメータだとずれうる）
      sets.push(`due_date = $${i}::date`);
      sets.push(`due_at = ($${i}::date + TIME '18:00')::timestamp`);
      i++;
      params.push(data.due_date);
    }

    await execute(
      `UPDATE project_tasks SET ${sets.join(', ')} WHERE id = $1`,
      params
    );

    // AI（MCP）が起票したタスクなら、人がどこを直したかを差分で残す（7日窓）
    const feedbackAfter = await queryOne(FEEDBACK_COLS, [id]) as Record<string, unknown> | null;
    if (feedbackBefore && feedbackAfter) {
      await recordGpmTaskCorrections(id, feedbackBefore, feedbackAfter, userId);
    }

    return (await this.getById(id))!;
  },

  async toggleComplete(id: string, userId: string): Promise<ProjectTask> {
    const existing = (await queryOne(
      `SELECT is_completed FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )) as unknown as { is_completed: boolean } | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');

    const next = !existing.is_completed;
    await execute(
      `UPDATE project_tasks
       SET is_completed = $1,
           completed_at = $2,
           updated_at = NOW(), updated_by = $3
       WHERE id = $4`,
      [next, next ? new Date().toISOString() : null, userId, id]
    );

    return (await this.getById(id))!;
  },

  async move(
    id: string,
    columnId: string | null,
    sortOrder: number,
    userId: string
  ): Promise<void> {
    const existing = await queryOne(
      `SELECT id FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');

    await execute(
      `UPDATE project_tasks
       SET column_id = $1, sort_order = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $4`,
      [columnId, sortOrder, userId, id]
    );
  },

  async reorder(
    projectId: string,
    items: Array<{ id: string; sort_order: number }>,
    userId: string
  ): Promise<void> {
    for (const item of items) {
      await execute(
        `UPDATE project_tasks
         SET sort_order = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3 AND project_id = $4 AND deleted_at IS NULL`,
        [item.sort_order, userId, item.id, projectId]
      );
    }
  },

  async delete(id: string, userId: string): Promise<void> {
    const existing = await queryOne(
      `SELECT id FROM project_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'タスクが見つかりません');

    await execute(
      `UPDATE project_tasks
       SET deleted_at = NOW(), updated_by = $1
       WHERE parent_task_id = $2 AND deleted_at IS NULL`,
      [userId, id]
    );

    await execute(
      `UPDATE project_tasks
       SET deleted_at = NOW(), updated_by = $1
       WHERE id = $2`,
      [userId, id]
    );

    // このタスク (と子タスク) に関わる依存関係も物理削除する。soft-delete では
    // ON DELETE CASCADE が効かず、削除済みタスクを指す依存がガントの矢印データに
    // 残り続けるため。
    await execute(
      `DELETE FROM task_dependencies
       WHERE predecessor_id = $1 OR successor_id = $1
          OR predecessor_id IN (SELECT id FROM project_tasks WHERE parent_task_id = $1)
          OR successor_id IN (SELECT id FROM project_tasks WHERE parent_task_id = $1)`,
      [id]
    );
  },

  // ---- タスク依存関係 (先行 → 後続) ----
  async listDependencies(projectId: string): Promise<Array<{ id: string; predecessor_id: string; successor_id: string }>> {
    // 生存タスク同士の依存のみ返す (削除済みタスクを指す依存を除外し矢印データを健全に保つ)
    return (await queryAll(
      `SELECT d.id, d.predecessor_id, d.successor_id FROM task_dependencies d
       JOIN project_tasks p ON p.id = d.predecessor_id AND p.deleted_at IS NULL
       JOIN project_tasks s ON s.id = d.successor_id AND s.deleted_at IS NULL
       WHERE d.project_id = $1 ORDER BY d.created_at`,
      [projectId]
    )) as unknown as Array<{ id: string; predecessor_id: string; successor_id: string }>;
  },

  async addDependency(
    projectId: string,
    predecessorId: string,
    successorId: string,
    userId: string
  ): Promise<{ id: string; predecessor_id: string; successor_id: string }> {
    if (predecessorId === successorId) {
      throw new AppError(400, 'VALIDATION_ERROR', '同じタスク同士は依存関係にできません');
    }
    // 両タスクがこの案件に属するか確認
    const cnt = (await queryOne(
      `SELECT COUNT(*)::int AS c FROM project_tasks
       WHERE id IN ($1, $2) AND project_id = $3 AND deleted_at IS NULL`,
      [predecessorId, successorId, projectId]
    )) as unknown as { c: number };
    if (cnt.c !== 2) throw new AppError(400, 'VALIDATION_ERROR', '対象タスクが見つかりません');

    // 循環検出: 新しいエッジ predecessor→successor を追加すると循環になるか。
    // = successor から辿って predecessor に到達できるか (再帰CTE) を判定する。
    // 直接の逆向き (successor→predecessor) だけでなく間接循環 (successor→…→predecessor) も拒否する。
    const cycle = await queryOne(
      `WITH RECURSIVE reachable AS (
         SELECT successor_id AS node FROM task_dependencies
         WHERE predecessor_id = $1 AND project_id = $2
         UNION
         SELECT d.successor_id FROM task_dependencies d
         JOIN reachable r ON d.predecessor_id = r.node
         WHERE d.project_id = $2
       )
       SELECT 1 FROM reachable WHERE node = $3 LIMIT 1`,
      [successorId, projectId, predecessorId]
    );
    if (cycle) throw new AppError(400, 'VALIDATION_ERROR', '循環する依存関係は作成できません');

    // 重複は冪等に既存を返す
    const existing = (await queryOne(
      `SELECT id, predecessor_id, successor_id FROM task_dependencies
       WHERE predecessor_id = $1 AND successor_id = $2`,
      [predecessorId, successorId]
    )) as unknown as { id: string; predecessor_id: string; successor_id: string } | undefined;
    if (existing) return existing;

    const id = uuidv4();
    await execute(
      `INSERT INTO task_dependencies (id, project_id, predecessor_id, successor_id, created_at, created_by)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [id, projectId, predecessorId, successorId, userId]
    );
    return { id, predecessor_id: predecessorId, successor_id: successorId };
  },

  async removeDependency(id: string): Promise<void> {
    await execute(`DELETE FROM task_dependencies WHERE id = $1`, [id]);
  },
};
