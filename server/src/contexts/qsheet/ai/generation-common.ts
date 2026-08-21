/**
 * 生成4機能（①②③④）が共有する「呼ぶ→記録する→提案として保存する」の骨格（段8）。
 *
 * 個々のサービス（`event-plan-ai.service.ts` 等）はプロンプトと normalize だけを持ち、
 * ここで **条件1（記録）・条件2の器（`normalize.` 差分）・失敗の扱い（04-ai.md §8-1）** を
 * 揃える。バラバラに書くと、どれか1機能だけ記録漏れが起きる。
 */
import { recordAiOutput, recordCorrections } from '../../../shared/services/ai-output.service';
import { recordAiUsage, type AiUsageKind } from '../../../shared/services/ai-usage.service';
import { execute } from '../../../shared/db/connection';
import { AiEmptyError, AiFailedError, AiNotConfiguredError } from '../services/httpErrors';
import { assertGenerationAllowed, createProposal, type CreateProposalInput } from './proposals.service';
import { callStructured, type LlmCallResult, type StructuredCallOptions } from './llm';
import type { DroppedItem } from './normalize';
import type { ProposalRow } from './types';
import type { AiJob, AiTier } from '../../../shared/services/ai-model';

export interface RunGenerationInput<Raw, Plan> {
  job: AiJob;
  usageKind: AiUsageKind;
  kind: string;
  scheduleId?: string | null;
  documentId?: string | null;
  projectId?: string | null;
  userId: string;
  tier: AiTier;
  retryHeavyOnError?: boolean;
  system: string;
  user: string;
  schema: StructuredCallOptions<Raw>['schema'];
  schemaName: string;
  promptVersion: string;
  normalize: (raw: Raw) => { plan: Plan; dropped: DroppedItem[] };
  /** 全部落ちた（＝空の提案）と判定する条件。空の提案を「成功」と見せない（§8-1） */
  isEmpty: (plan: Plan) => boolean;
  /** `qsheet_ai_proposals.context`（画面表示用の要約） */
  contextSummary: Record<string, unknown>;
  /** `ai_outputs.payload_snapshot.input`（再現とレビューのための全文。§6-5b） */
  inputSnapshot: Record<string, unknown>;
  notes?: string[];
}

export interface RunGenerationResult<Plan> {
  proposal: ProposalRow;
  plan: Plan;
  notes: string[];
}

/**
 * 生成の共通手順。呼び出し順:
 * 1. 生成回数の上限（§6-5e）
 * 2. LLM 呼び出し（プロバイダ未設定 → 503 / 呼び出し失敗 → 502）
 * 3. `ai_outputs` へ全文記録（条件1）＋ `ai_usage` へ課金記録
 * 4. normalize（AI に埋めさせるのはシナリオだけ、等の制約はここで確定する）
 * 5. 空なら 422（正規化で全部落ちた）
 * 6. `qsheet_ai_proposals` へ保存（**`data`/`qsheet_schedule_items` には一切触らない**）
 * 7. `ai_outputs.target_id` を提案 id で埋め戻す（既存 `activity-log.service.ts` の作法）
 * 8. `normalize.` で捨てた要素を差分として記録（条件2・§2-5 の F8）
 */
export async function runGeneration<Raw, Plan>(input: RunGenerationInput<Raw, Plan>): Promise<RunGenerationResult<Plan>> {
  await assertGenerationAllowed({ documentId: input.documentId, scheduleId: input.scheduleId }, input.userId);

  let result: LlmCallResult<Raw>;
  try {
    result = await callStructured<Raw>({
      job: input.job, tier: input.tier, system: input.system, user: input.user,
      schema: input.schema, schemaName: input.schemaName, retryHeavyOnError: input.retryHeavyOnError,
    });
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('OPENAI_API_KEY') || message.includes('ANTHROPIC_API_KEY')) {
      throw new AiNotConfiguredError();
    }
    await recordAiUsage({ kind: input.usageKind, ok: false, errorMessage: message }).catch(() => {});
    throw new AiFailedError(`AI の呼び出しに失敗しました: ${message}`);
  }

  const aiOutputId = await recordAiOutput({
    kind: input.kind,
    targetTable: 'qsheet_ai_proposals',
    targetId: null, // 提案の id はまだ無い。行ができたら target_id を埋め戻す（下記手順7）
    payload: { output: result.raw, input: input.inputSnapshot, context: input.contextSummary },
    toolName: `qsheet.${input.job}`,
    model: result.model,
    promptVersion: input.promptVersion,
    actorId: input.userId,
  });

  await recordAiUsage({
    kind: input.usageKind, provider: result.provider, model: result.model,
    inputTokens: result.usage.inputTokens, cachedInputTokens: result.usage.cachedInputTokens,
    outputTokens: result.usage.outputTokens, ok: true, actorId: input.userId,
    aiOutputId: aiOutputId ?? undefined,
  });

  const { plan, dropped } = input.normalize(result.raw);
  if (input.isEmpty(plan)) {
    throw new AiEmptyError();
  }

  const createInput: CreateProposalInput = {
    kind: input.kind, scheduleId: input.scheduleId, documentId: input.documentId,
    projectId: input.projectId, proposal: plan, context: input.contextSummary,
    aiOutputId, model: result.model, promptVersion: input.promptVersion, createdBy: input.userId,
  };
  const proposal = await createProposal(createInput);

  if (aiOutputId) {
    await execute('UPDATE ai_outputs SET target_id = ? WHERE id = ?', [proposal.id, aiOutputId])
      .catch(() => { /* 記録の失敗で業務を止めない */ });
    if (dropped.length) {
      await recordCorrections(aiOutputId, dropped.map((d) => ({
        fieldPath: `normalize.${d.reason}.${d.path}`,
        before: d.value, after: null, type: 'reject',
      })), null);
    }
  }

  return { proposal, plan, notes: input.notes ?? [] };
}
