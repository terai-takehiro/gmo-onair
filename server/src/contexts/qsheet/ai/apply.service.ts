/**
 * 取り込み（`apply`）の DB 読み書き（段7 §4）。判断（`sanitizeApplied`）は `apply.core.ts` に
 * 寄せてあるので、ここは**読む・保存する・記録する**だけ。
 */
import { execute, queryOne } from '../../../shared/db/connection';
import { recordCorrections } from '../../../shared/services/ai-output.service';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { sanitizeApplied } from './apply.core';
import type { ApplyRequestBody, ProposalRow } from './types';

export async function getProposalRow(id: string): Promise<ProposalRow | null> {
  const row = await queryOne('SELECT * FROM qsheet_ai_proposals WHERE id = ?', [id]);
  return (row as unknown as ProposalRow) ?? null;
}

function proposalObj(row: ProposalRow): Record<string, unknown> {
  return row.proposal && typeof row.proposal === 'object' ? (row.proposal as Record<string, unknown>) : {};
}

/**
 * scenario ブロックの id を document の `data.blocks` から読む。
 * ①枠（`schedule_id` 由来）には scenario セルが無いので null。
 */
async function fetchScenarioBlockId(row: ProposalRow): Promise<string | null> {
  if (!row.document_id) return null;
  const doc = await queryOne('SELECT data FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [row.document_id]);
  const blocks = (doc?.data as Record<string, unknown> | undefined)?.blocks;
  if (!Array.isArray(blocks)) return null;
  const scenario = blocks.find((b: Record<string, unknown>) => b?.type === 'scenario') as Record<string, unknown> | undefined;
  return (scenario?.id as string | undefined) ?? null;
}

export interface ApplyResult { appliedAt: string; droppedCount: number }

/**
 * 取り込んだことを記録する。**書き込み（Yjs への反映）はクライアントが先に済ませている**
 * （§4-1 ①）。ここはその結果を `applied_payload` / `applied_ids` として保存し、
 * `preview.` の差分を積むだけ。
 */
export async function applyProposal(
  proposalId: string,
  body: ApplyRequestBody,
  userId: string,
): Promise<ApplyResult> {
  const row = await getProposalRow(proposalId);
  if (!row) throw new NotFoundError('提案が見つかりません');
  if (row.state !== 'open') throw new ValidationError(`この提案は既に「${row.state}」です`);

  const { appliedPayload, appliedIds, corrections, droppedCount } = sanitizeApplied({
    kind: row.kind,
    proposal: proposalObj(row),
    body,
    scenarioBlockId: await fetchScenarioBlockId(row),
  });

  const appliedAt = new Date();
  // **`AND state='open'` の条件付き UPDATE で二重取り込みを防ぐ**
  // （同時に2箇所から apply が呼ばれても、勝つのは1回だけ）
  const claimed = await queryOne(
    `UPDATE qsheet_ai_proposals
        SET state = 'applied', applied_at = ?, applied_by = ?,
            applied_payload = ?::jsonb, applied_ids = ?::jsonb,
            context = context || ?::jsonb, updated_at = NOW()
      WHERE id = ? AND state = 'open'
      RETURNING id`,
    [
      appliedAt, userId, JSON.stringify(appliedPayload), JSON.stringify(appliedIds),
      JSON.stringify({ dropped_count: droppedCount }), proposalId,
    ],
  );
  if (!claimed) throw new ValidationError('この提案は既に取り込み済みか、状態が変わっています');

  if (row.ai_output_id && corrections.length) {
    await recordCorrections(row.ai_output_id, corrections, userId);
  }
  return { appliedAt: appliedAt.toISOString(), droppedCount };
}

/** 捨てる（`state='open'` のときだけ）。`reject` を1行積む */
export async function discardProposal(proposalId: string, reason: string | null, userId: string): Promise<void> {
  const row = await getProposalRow(proposalId);
  if (!row) throw new NotFoundError('提案が見つかりません');
  if (row.state !== 'open') throw new ValidationError(`この提案は既に「${row.state}」です`);

  const claimed = await queryOne(
    `UPDATE qsheet_ai_proposals SET state='discarded', discard_reason=?, updated_at=NOW()
      WHERE id=? AND state='open' RETURNING id`,
    [reason ?? 'discarded', proposalId],
  );
  if (!claimed) throw new ValidationError('この提案は既に状態が変わっています');
  if (row.ai_output_id) {
    await recordCorrections(row.ai_output_id, [
      { fieldPath: '(全体)', before: proposalObj(row), after: null, type: 'reject', note: reason ?? null },
    ], userId);
  }
}

/**
 * 「これは違う」— **窓なし**で `reject` を積む（§10-2）。取り込み済みかどうかを問わない。
 * 状態は変えない（取り込み後に「やっぱり違った」と気づいた場合のための経路なので、
 * `applied_ids` はそのままにする — 台本はもう直っている）。
 */
export async function markProposalWrong(proposalId: string, note: string | null, userId: string): Promise<void> {
  const row = await getProposalRow(proposalId);
  if (!row) throw new NotFoundError('提案が見つかりません');
  if (!row.ai_output_id) throw new ValidationError('この提案には AI 出力の紐づけがありません');
  await recordCorrections(row.ai_output_id, [
    { fieldPath: '(全体)', before: proposalObj(row), after: null, type: 'reject', note: note ? `wrong: ${note}` : 'wrong' },
  ], userId);
  await execute('UPDATE qsheet_ai_proposals SET updated_at = NOW() WHERE id = ?', [proposalId]);
}
