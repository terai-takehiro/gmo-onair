// 投入テキストの受け皿 — 「投げたものを一次資料として残す」ための service。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D4 / D5 / D9)
//
// 流れ:
//   1. createIntake  … 投げた生テキスト + AI が解析したタスク案 (下書き) を保存。
//                       この時点では **本登録しない**。ai_outputs にも記録する。
//   2. commitIntake  … 人が確認・修正したものだけを本登録。
//                       下書きと確定内容の差分を ai_corrections に積む。
//   3. discardIntake … 全部要らなかった場合。テキストは残す (捨てるのは下書きだけ)。
//
// 差分の突合は **配列 index ではなく draft_key** で行う。
// index だと 1 件外すだけで以降すべてが「変更」と数えられ、修正率が実態とかけ離れる。

import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput,
  recordCorrections,
  diffByKey,
  type CorrectionInput,
} from '../../../shared/services/ai-output.service';

export type IntakeKind = 'freeform' | 'minutes' | 'mail' | 'chat' | 'other';
export type IntakeStatus = 'pending' | 'committed' | 'discarded';

/** AI が出したタスク案 1 件 */
export interface TaskDraft {
  /** 差分突合用の安定キー (サーバーが d1, d2, … で振る) */
  draft_key: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  assigned_to?: string | null;
  /** 依頼なら依頼者 (通常は投入者本人) */
  requester_id?: string | null;
  due_at?: string | null;
  importance?: number;
  urgency?: number;
  /**
   * AI が期限の時刻を補完したか。
   * 「金曜まで」のように日付しか書かれていなかった場合に true。
   * **黙って補完すると曖昧なまま確定したことになりイズムに反する**ため、
   * UI はこの印を見せて人に確認させる (要件 D9)。
   */
  due_time_assumed?: boolean;
  /** 期限が曖昧・不明 (「今週中」「なるべく早く」) */
  due_unclear?: boolean;
  /** 宛先が特定できなかった (「隣の席の人」「営業チーム」) */
  assignee_unclear?: boolean;
  /** 根拠となった投入テキストの引用 */
  quote?: string | null;
  /** 確認画面の既定チェック状態 (宛先・期限が揃っていれば ON) */
  suggested_default?: boolean;
}

export interface TaskIntake {
  id: string;
  raw_text: string;
  kind: IntakeKind;
  status: IntakeStatus;
  drafts: TaskDraft[] | null;
  ai_output_id: string | null;
  committed_at: string | null;
  discarded_at: string | null;
  note: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  /** この投入から生まれたタスク件数 */
  task_count?: number;
}

const SELECT_INTAKE = `
  SELECT i.id, i.raw_text, i.kind, i.status, i.drafts, i.ai_output_id,
         i.committed_at, i.discarded_at, i.note,
         i.created_at, i.created_by, u.name AS created_by_name,
         (SELECT COUNT(*) FROM project_tasks t
           WHERE t.source_ref = i.id AND t.deleted_at IS NULL) AS task_count
  FROM task_intake i
  LEFT JOIN users u ON u.id = i.created_by
`;

/** 宛先と期限が揃っていれば既定チェック ON。曖昧なら OFF にして人に聞く (要件 D4) */
function computeDefault(d: TaskDraft): boolean {
  if (d.assignee_unclear || !d.assigned_to) return false;
  if (d.due_unclear || !d.due_at) return false;
  return true;
}

/** AI から受け取った案に draft_key と既定チェックを振る */
function normalizeDrafts(input: Omit<TaskDraft, 'draft_key'>[]): TaskDraft[] {
  return (input ?? []).map((d, i) => {
    const draft: TaskDraft = { ...d, draft_key: `d${i + 1}` };
    draft.suggested_default = computeDefault(draft);
    return draft;
  });
}

// 差分を取る対象。振り分け結果そのものなので、ここが教師データになる (要件 第6章)
const DIFF_FIELDS = ['title', 'assigned_to', 'project_id', 'due_at', 'importance', 'urgency'];

export const taskIntakeService = {
  /**
   * 投入を記録する。**タスクは作らない** (status='pending' の下書きのまま)。
   * 生テキストは切り詰めずに保存する。
   */
  async createIntake(
    data: {
      raw_text: string;
      kind?: IntakeKind;
      drafts?: Omit<TaskDraft, 'draft_key'>[];
      note?: string | null;
      requested_by?: string | null;
      tool_name?: string | null;
    },
    userId: string
  ): Promise<TaskIntake> {
    if (!data.raw_text?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '投入するテキストが空です');

    const id = uuidv4();
    const drafts = normalizeDrafts(data.drafts ?? []);

    // AI の出力として記録 (入力は task_intake.raw_text 側に残る)
    const aiOutputId = await recordAiOutput({
      kind: 'task_intake',
      targetTable: 'task_intake',
      targetId: id,
      payload: { raw_text: data.raw_text, kind: data.kind ?? 'freeform', drafts },
      toolName: data.tool_name ?? null,
      actorId: userId,
      requestedBy: data.requested_by ?? null,
    });

    await execute(
      `INSERT INTO task_intake
         (id, raw_text, kind, status, drafts, ai_output_id, note, created_by, updated_at)
       VALUES (?, ?, ?, 'pending', ?::jsonb, ?, ?, ?, NOW())`,
      [
        id,
        data.raw_text,
        data.kind ?? 'freeform',
        JSON.stringify(drafts),
        aiOutputId,
        data.note ?? null,
        userId,
      ]
    );
    return this.get(id);
  },

  /**
   * 確認済みのタスク案を本登録する。
   *
   * - 渡された tasks だけを作る (外されたものは作らない = 不採用として差分に残る)
   * - 下書きとの差分を ai_corrections に積む。**無修正で採用したものは 'none'**
   *   (正解ラベル。これが無いと無修正採用率の分母が壊れる)
   * - 依頼 (requester_id あり) は期限を必須にする (要件 D9)
   */
  async commitIntake(
    intakeId: string,
    tasks: TaskDraft[],
    userId: string
  ): Promise<{ intake: TaskIntake; created_ids: string[] }> {
    const intake = await this.get(intakeId);
    if (intake.status === 'committed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'この投入はすでに登録済みです');
    }
    if (!tasks?.length) {
      throw new AppError(400, 'VALIDATION_ERROR', '登録するタスクがありません。破棄する場合は破棄してください');
    }

    // 事前検証 (トランザクションに入る前に弾く)
    for (const t of tasks) {
      if (!t.title?.trim()) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルが空のタスクがあります');
      if (!t.assigned_to) {
        throw new AppError(400, 'VALIDATION_ERROR', `「${t.title}」の担当者が決まっていません`);
      }
      if (t.requester_id && !t.due_at) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `「${t.title}」は依頼なので期限が必要です。何月何日何時何分までかを指定してください`
        );
      }
      if (t.importance != null && (t.importance < 1 || t.importance > 3)) {
        throw new AppError(400, 'VALIDATION_ERROR', '重要度は 1〜3 で指定してください');
      }
      if (t.urgency != null && (t.urgency < 1 || t.urgency > 3)) {
        throw new AppError(400, 'VALIDATION_ERROR', '緊急度は 1〜3 で指定してください');
      }
    }

    const createdIds = await withTransaction(async (tx) => {
      const ids: string[] = [];
      for (const t of tasks) {
        const id = uuidv4();
        const isDelegation = !!t.requester_id;
        await tx.execute(
          `INSERT INTO project_tasks
             (id, project_id, title, description, task_type,
              assigned_to, requester_id, requested_at, delegation_status,
              due_at, importance, urgency, source, source_ref, visibility,
              sort_order, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'free',
                   ?, ?, ?, ?,
                   ?, ?, ?, ?, ?, 'team',
                   0, ?, ?)`,
          [
            id,
            t.project_id ?? null,
            t.title.trim(),
            t.description ?? null,
            t.assigned_to,
            t.requester_id ?? null,
            isDelegation ? new Date().toISOString() : null,
            isDelegation ? 'requested' : null,
            t.due_at ?? null,
            t.importance ?? 2,
            t.urgency ?? 2,
            // 投入経由であることを残す。source_ref から元テキストへ遡れる
            `intake:${intake.kind}`,
            intakeId,
            userId,
            userId,
          ]
        );
        ids.push(id);
      }
      await tx.execute(
        `UPDATE task_intake
         SET status = 'committed', committed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [intakeId]
      );
      return ids;
    });

    // 差分を記録 (業務を壊さない best-effort)。draft_key で突合する
    if (intake.ai_output_id) {
      const before = intake.drafts ?? [];
      const diffs: CorrectionInput[] = diffByKey(
        before,
        tasks,
        'draft_key',
        DIFF_FIELDS,
        'tasks'
      );
      // 無修正で採用されたものを 'none' として明示的に記録する。
      // これが無いと「修正されなかった」ことが記録に残らず、無修正採用率が出せない。
      const changedKeys = new Set(
        diffs.map((d) => d.fieldPath.replace(/^tasks\[/, '').replace(/\].*$/, ''))
      );
      const keptKeys = new Set(tasks.map((t) => t.draft_key));
      for (const b of before) {
        if (keptKeys.has(b.draft_key) && !changedKeys.has(b.draft_key)) {
          diffs.push({ fieldPath: `tasks[${b.draft_key}]`, type: 'none' });
        }
      }
      if (diffs.length) {
        await recordCorrections(intake.ai_output_id, diffs, userId);
      }
    }

    return { intake: await this.get(intakeId), created_ids: createdIds };
  },

  /** 下書きを破棄する。**生テキストは残す** (投げた事実は消さない) */
  async discardIntake(intakeId: string, userId: string, note?: string | null): Promise<TaskIntake> {
    const intake = await this.get(intakeId);
    if (intake.status === 'committed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'すでに登録済みの投入は破棄できません');
    }
    await execute(
      `UPDATE task_intake
       SET status = 'discarded', discarded_at = NOW(),
           note = COALESCE(?, note), updated_at = NOW()
       WHERE id = ?`,
      [note ?? null, intakeId]
    );

    // 全件不採用として差分に残す (AI が何を外されたか学べるように)
    if (intake.ai_output_id && intake.drafts?.length) {
      const diffs: CorrectionInput[] = intake.drafts.map((d) => ({
        fieldPath: `tasks[${d.draft_key}]`,
        before: d,
        after: null,
        type: 'reject' as const,
      }));
      await recordCorrections(intake.ai_output_id, diffs, userId);
    }
    return this.get(intakeId);
  },

  async get(id: string): Promise<TaskIntake> {
    const row = await queryOne(`${SELECT_INTAKE} WHERE i.id = ? AND i.deleted_at IS NULL`, [id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', '投入が見つかりません');
    return {
      ...(row as unknown as TaskIntake),
      task_count: Number(row.task_count ?? 0),
    };
  },

  /**
   * 投入ログ。既定は本人の分だけ (投げたテキストは個人の記録なので)。
   * status を指定すれば「確認待ちだけ」を取れる。
   */
  async list(
    opts: { userId?: string; status?: IntakeStatus; kind?: IntakeKind; limit?: number } = {}
  ): Promise<TaskIntake[]> {
    let where = 'WHERE i.deleted_at IS NULL';
    const params: unknown[] = [];
    if (opts.userId) { where += ' AND i.created_by = ?'; params.push(opts.userId); }
    if (opts.status) { where += ' AND i.status = ?'; params.push(opts.status); }
    if (opts.kind) { where += ' AND i.kind = ?'; params.push(opts.kind); }

    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const rows = await queryAll(
      `${SELECT_INTAKE} ${where} ORDER BY i.created_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map((r) => ({
      ...(r as unknown as TaskIntake),
      task_count: Number(r.task_count ?? 0),
    }));
  },

  /** この投入から生まれたタスク (遡ってレビューするため) */
  async listGeneratedTasks(intakeId: string): Promise<Record<string, unknown>[]> {
    return queryAll(
      `SELECT t.id, t.title, t.project_id, p.name AS project_name, p.gls_number,
              t.assigned_to, u.name AS assigned_to_name,
              t.due_at::text AS due_at, t.importance, t.urgency,
              t.delegation_status, t.is_completed, t.created_at
       FROM project_tasks t
       LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.source_ref = ? AND t.deleted_at IS NULL
       ORDER BY t.created_at ASC`,
      [intakeId]
    );
  },
};
