/**
 * 制作資料 v4 AI 提案 — kind と定数の唯一の正（段7 / 04-a）
 *
 * 実装設計: docs/design/v4/qsheet-v4-coding/impl/07-ai-proposals-impl.md §1-3・§7-2・§9
 *
 * ⚠️ この段では生成（①②③）を1行も書かない。ここに置くのは
 * 「AI が出したもの」を受け止める器が読む定数だけ。
 */

/** `qsheet_ai_proposals.kind` として使う値。CHECK は張らない（migration コメント参照） */
export const QSHEET_AI_KINDS = [
  'event_plan_draft',
  'script_outline_draft',
  'script_line_draft',
] as const;
export type QsheetAiKind = (typeof QSHEET_AI_KINDS)[number];

export function isQsheetAiKind(v: unknown): v is QsheetAiKind {
  return typeof v === 'string' && (QSHEET_AI_KINDS as readonly string[]).includes(v);
}

/**
 * 取り込み（`applied_at`）から何日で 1 段目（`early`）を締めるか。
 *
 * `ai-output.service.ts` の `CORRECTION_WINDOW_DAYS` と**たまたま同じ値（7日）**だが、
 * 意味が違う独立した定数として持つ（§3-2 の警告: 提案の `expires_at` の期限＝放置提案の
 * 期限とも別物）。値を変えるときはここだけを直せばよい。
 */
export const AI_EARLY_SETTLE_DAYS = 7;

/**
 * 本番日が特定できない（`broadcast_date` も `qsheet_cue_actuals` も無い）ときだけ使う
 * 2段目（`final`）のフォールバック期限（`applied_at` から何日）。
 *
 * ⚠️ **「最も早いもの」にしない。** 本番が8日以上先の台本では、これを最短にすると
 * 必ずこちらが勝ち、測りたい「当日の直し」を100%取りこぼす（§5-1 の警告）。
 * 妥当性は未確認（README 確認6・§12 #6）。
 */
export const AI_TIMEOUT_SETTLE_DAYS = 30;

/** 期限切れのまま放置された提案の既定寿命（DB 側の DEFAULT と揃えておく。§3-2） */
export const AI_PROPOSAL_EXPIRE_DAYS = 14;

/** 1回の締めバッチ・期限切れバッチで処理する上限件数（§5-3） */
export const AI_SETTLE_BATCH_LIMIT = 200;

/**
 * `html` の `fix` を `rephrase` に格上げする類似度のしきい値（正規化編集距離）。
 * 根拠のある数字ではない（README 確認7・§12 #7）。`note` に `sim=` を残すので、
 * あとから引き直せる。
 */
export const REPHRASE_SIMILARITY_THRESHOLD = 0.6;
