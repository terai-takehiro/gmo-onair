/**
 * 行動提案の受け皿 — 「投げたものと、AI が出した案と、人が直した差分」を残す service。
 *
 * 流れ:
 *   1. createPlan   … 投げた生テキスト + AI が出した行動案を保存。**この時点では何も実行しない**。
 *                     ai_outputs にも全文を記録する (条件1)。
 *   2. executePlan  … 人が確認・修正したものだけを実行。
 *                     下書きと実行内容の差分を ai_corrections に積む (条件2)。
 *                     作られたレコードは ai_outputs.target_* から辿れる (条件3の入口)。
 *   3. discardPlan  … 全部要らなかった場合。テキストと下書きは残す (投げた事実は消さない)。
 *
 * 差分の突合は **配列 index ではなく action_key** で行う。
 * index だと 1 件外すだけで以降すべてが「変更」と数えられ、修正率が実態とかけ離れる。
 *
 * ── 実行結果を actions とは別カラムに持つ理由 ────────────────
 *
 * 下書き (actions) を実行結果で上書きすると、**教師データが実行のたびに消える**。
 * ai-feedback-loop の「上書き保存で下書きを消す」失敗パターンそのものなので、
 * results を別カラムにして actions は投入時のまま凍結する。
 */

import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, recordCorrections, diffByKey, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import { ACTION_CATALOG } from './action-catalog';
import type { ActionDraft } from './action-ai.service';
import { executeActions, type ActionResult } from './action-executor.service';

export type PlanKind = 'freeform' | 'minutes' | 'mail' | 'chat' | 'other';
export type PlanStatus = 'pending' | 'executed' | 'discarded';

/** ai_outputs.kind。ai-feedback の集計単位になるので task_intake とは分ける */
export const ACTION_PLAN_AI_KIND = 'ai_action_plan';

export interface ActionPlan {
  id: string;
  raw_text: string;
  kind: PlanKind;
  status: PlanStatus;
  summary: string | null;
  actions: ActionDraft[] | null;
  results: ActionResult[] | null;
  ai_output_id: string | null;
  executed_at: string | null;
  discarded_at: string | null;
  note: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
}

const SELECT_PLAN = `
  SELECT p.id, p.raw_text, p.kind, p.status, p.summary, p.actions, p.results, p.ai_output_id,
         p.executed_at, p.discarded_at, p.note,
         p.created_at, p.created_by, u.name AS created_by_name
  FROM ai_action_plans p
  LEFT JOIN users u ON u.id = p.created_by
`;

/**
 * 差分を取る対象のフィールド。
 * **実行に効く値だけ**を並べる。quote / confidence / asks は AI の説明なので、
 * ここに入れると「人が直した」件数が水増しされて修正率が読めなくなる。
 */
const DIFF_FIELDS = [
  'kind', 'title', 'text', 'customer_id', 'project_id', 'assignee_id',
  'due_at', 'date', 'date_end', 'amount', 'stage', 'gls_category',
  'activity_type', 'next_action', 'next_action_date', 'importance', 'urgency',
];

export const actionPlanService = {
  /**
   * 行動案を保存する。**実行はしない** (status='pending' の下書きのまま)。
   * 生テキストは切り詰めずに保存する。
   */
  async createPlan(
    data: {
      raw_text: string;
      kind?: PlanKind;
      summary?: string | null;
      actions?: ActionDraft[];
      skipped?: { line: string; reason: string }[];
      model?: string | null;
      prompt_version?: string | null;
      tool_name?: string | null;
      requested_by?: string | null;
    },
    userId: string,
  ): Promise<ActionPlan> {
    if (!data.raw_text?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '投入するテキストが空です');

    const id = uuidv4();
    const actions = data.actions ?? [];

    // AI の出力として全文を記録する (切り詰めない)。skipped も入れる —
    // 「拾わなかった理由」は、拾いすぎ / 拾い漏れを後から見るのに要る
    const aiOutputId = await recordAiOutput({
      kind: ACTION_PLAN_AI_KIND,
      targetTable: 'ai_action_plans',
      targetId: id,
      payload: {
        raw_text: data.raw_text,
        kind: data.kind ?? 'freeform',
        summary: data.summary ?? null,
        actions,
        skipped: data.skipped ?? [],
      },
      toolName: data.tool_name ?? null,
      model: data.model ?? null,
      promptVersion: data.prompt_version ?? null,
      actorId: userId,
      requestedBy: data.requested_by ?? null,
    });

    await execute(
      `INSERT INTO ai_action_plans
         (id, raw_text, kind, status, summary, actions, ai_output_id, created_by, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?::jsonb, ?, ?, NOW())`,
      [
        id, data.raw_text, data.kind ?? 'freeform', data.summary ?? null,
        JSON.stringify(actions), aiOutputId, userId,
      ],
    );
    return this.get(id);
  },

  /**
   * 確認済みの行動案を実行する。
   *
   * - 渡された actions だけを実行する (外されたものは不採用として差分に残る)
   * - 下書きとの差分を ai_corrections に積む。**無修正で実行したものは 'none'**
   *   (正解ラベル。これが無いと無修正実行率の分母が壊れる)
   * - 実行が 1 件も成功しなくても status は 'executed' にする
   *   (「人が確認して実行を押した」という事実は成否と別に残す)
   */
  async executePlan(
    planId: string,
    actions: ActionDraft[],
    userId: string,
  ): Promise<{ plan: ActionPlan; results: ActionResult[] }> {
    const plan = await this.get(planId);
    if (plan.status === 'executed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'この提案はすでに実行済みです');
    }
    if (!actions?.length) {
      throw new AppError(400, 'VALIDATION_ERROR', '実行するものがありません。要らない場合は破棄してください');
    }
    for (const a of actions) {
      if (!ACTION_CATALOG[a.kind]) {
        throw new AppError(400, 'VALIDATION_ERROR', `知らない操作が含まれています: ${String(a.kind)}`);
      }
    }

    const results = await executeActions(actions, { userId });

    await execute(
      `UPDATE ai_action_plans
       SET status = 'executed', results = ?::jsonb, executed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(results), planId],
    );

    // 差分を記録 (業務を壊さない best-effort)。action_key で突合する
    if (plan.ai_output_id) {
      const before = plan.actions ?? [];
      const diffs: CorrectionInput[] = diffByKey(before, actions, 'action_key', DIFF_FIELDS, 'actions');
      // 無修正で実行されたものを 'none' として明示的に記録する。
      // これが無いと「直されなかった」ことが残らず、無修正実行率が出せない。
      const changedKeys = new Set(
        diffs.map((d) => d.fieldPath.replace(/^actions\[/, '').replace(/\].*$/, '')),
      );
      const keptKeys = new Set(actions.map((a) => a.action_key));
      for (const b of before) {
        if (keptKeys.has(b.action_key) && !changedKeys.has(b.action_key)) {
          diffs.push({ fieldPath: `actions[${b.action_key}]`, type: 'none' });
        }
      }
      if (diffs.length) await recordCorrections(plan.ai_output_id, diffs, userId);

      // **実行して落ちたものも教師データ**。「提案としては採用されたが
      // 前提が足りず実行できなかった」= AI が不足を見落としたケースで、
      // 人が直した差分とは意味が違うので note を付けて分けて残す。
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        await recordCorrections(
          plan.ai_output_id,
          failed.map((r) => ({
            fieldPath: `actions[${r.action_key}].executed`,
            before: r.kind, after: null, type: 'reject' as const,
            note: `実行時エラー: ${r.error ?? '理由不明'}`,
          })),
          userId,
        );
      }
    }

    return { plan: await this.get(planId), results };
  },

  /** 下書きを破棄する。**生テキストと下書きは残す** (投げた事実は消さない) */
  async discardPlan(planId: string, userId: string, note?: string | null): Promise<ActionPlan> {
    const plan = await this.get(planId);
    if (plan.status === 'executed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'すでに実行済みの提案は破棄できません');
    }
    await execute(
      `UPDATE ai_action_plans
       SET status = 'discarded', discarded_at = NOW(),
           note = COALESCE(?, note), updated_at = NOW()
       WHERE id = ?`,
      [note ?? null, planId],
    );

    // 全件不採用として差分に残す (AI が何を外されたか学べるように)
    if (plan.ai_output_id && plan.actions?.length) {
      await recordCorrections(
        plan.ai_output_id,
        plan.actions.map((a) => ({
          fieldPath: `actions[${a.action_key}]`,
          before: a, after: null, type: 'reject' as const,
        })),
        userId,
      );
    }
    return this.get(planId);
  },

  async get(id: string): Promise<ActionPlan> {
    const row = await queryOne(`${SELECT_PLAN} WHERE p.id = ? AND p.deleted_at IS NULL`, [id]);
    if (!row) throw new AppError(404, 'NOT_FOUND', '提案が見つかりません');
    return row as unknown as ActionPlan;
  },

  /** 提案ログ。既定は本人の分だけ (投げたテキストは個人の記録なので) */
  async list(
    opts: { userId?: string; status?: PlanStatus; limit?: number } = {},
  ): Promise<ActionPlan[]> {
    let where = 'WHERE p.deleted_at IS NULL';
    const params: unknown[] = [];
    if (opts.userId) { where += ' AND p.created_by = ?'; params.push(opts.userId); }
    if (opts.status) { where += ' AND p.status = ?'; params.push(opts.status); }
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);
    const rows = await queryAll(
      `${SELECT_PLAN} ${where} ORDER BY p.created_at DESC LIMIT ?`,
      [...params, limit],
    );
    return rows as unknown as ActionPlan[];
  },

  /** 確認待ちの件数 (放置を見えるようにする) */
  async pendingCount(userId: string): Promise<number> {
    const row = await queryOne(
      `SELECT COUNT(*) AS c FROM ai_action_plans
        WHERE deleted_at IS NULL AND status = 'pending' AND created_by = ?`,
      [userId],
    );
    return Number(row?.c ?? 0);
  },
};
