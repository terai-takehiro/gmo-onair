// テロップCG — 投票・クイズの進行状態（`fields.voteState`）。
//
// 段6-1後の追加スコープ: 「出題→締切→開票」という**進行状態**をオペレーターが手動で
// 切り替えられるようにする（外部投票受付・自動締切・実投票データは対象外 —
// graphics-awards-migration-plan.md §2-2の1番・§3。票数は従来どおり手入力のまま）。
//
// `fields.voteState` は `VoteChoice` と同じ「JSONBの1キー」設計（スキーマ変更不要）。
// **省略時は `'revealed'` 扱い**（既存の投票ページ・この機構を一度も使っていないページの
// 見た目を変えない後方互換 — `readVoteState` の唯一の情報源はこの1関数）。
export type VoteState = 'open' | 'closed' | 'revealed';

const VOTE_STATE_KEY = 'voteState';

/** `fields` の生値から `voteState` を読む。未知の値・未指定はすべて `'revealed'`（後方互換）。 */
export function readVoteState(fields: Record<string, unknown> | null | undefined): VoteState {
  const v = fields?.[VOTE_STATE_KEY];
  return v === 'open' || v === 'closed' ? v : 'revealed';
}

/**
 * 送出コンソールの進行ボタンが押されたときの次状態。
 * open→closed→revealed→open… の一巡（`revealed` から再度押すと、同じページで
 * 出題をやり直したいとき用に `open` へ戻る — 新しい TAKE を待たずに手動でも戻せる）。
 */
export function nextVoteState(current: VoteState): VoteState {
  if (current === 'open') return 'closed';
  if (current === 'closed') return 'revealed';
  return 'open';
}

/** `fields` に `voteState: 'open'` を書き込んだ新しい `fields` を返す（TAKE 時のリセット用）。 */
export function withVoteStateReset(fields: Record<string, unknown>): Record<string, unknown> {
  return { ...fields, [VOTE_STATE_KEY]: 'open' satisfies VoteState };
}

/** 進行ボタンが押されたときの新しい `fields` を返す（`fields.voteState` を1段進める）。 */
export function withVoteStateAdvanced(fields: Record<string, unknown>): Record<string, unknown> {
  return { ...fields, [VOTE_STATE_KEY]: nextVoteState(readVoteState(fields)) };
}
