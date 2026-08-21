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
 * 段8（04-ai.md §1-3）— 生成4機能の kind と prompt_version の唯一の正。
 * 文字列を書き写さない（写すと kind を変えた日に集計だけ黙って 0 件になる）。
 */
export const EVENT_PLAN_KIND = 'event_plan_draft';
export const SCRIPT_OUTLINE_KIND = 'script_outline_draft';
export const SCRIPT_LINE_KIND = 'script_line_draft';
/** ④壁打ち。`qsheet_ai_proposals.kind` には入らない（提案テーブルの対象外） */
export const PRODUCTION_CHAT_KIND = 'production_chat';

export const EVENT_PLAN_PROMPT_VERSION = 'event-plan-v1';
export const EVENT_PLAN_PROMPT_VERSION_FB = 'event-plan-v1+fb';
export const SCRIPT_OUTLINE_PROMPT_VERSION = 'script-outline-v1';
export const SCRIPT_OUTLINE_PROMPT_VERSION_FB = 'script-outline-v1+fb';
export const SCRIPT_LINE_PROMPT_VERSION = 'script-line-v1';
export const SCRIPT_LINE_PROMPT_VERSION_FB = 'script-line-v1+fb';
export const PRODUCTION_CHAT_PROMPT_VERSION = 'prod-chat-v1';
export const PRODUCTION_CHAT_PROMPT_VERSION_FB = 'prod-chat-v1+fb';

/**
 * 助言（digest の advice）を載せたら `+fb` を付ける。**必ず別の文字列にする**
 * （既存5か所と同じ作法。混ぜると「載せた効果があったのか」を後から言えなくなる）。
 *
 * ⚠️ 04-ai.md §6-5a の `promptVersionOf(base, knowledgeRev, adviceCount)` は
 * `qsheet_ai_knowledge`（ナレッジの承認リビジョン）を前提にしているが、そのテーブルは
 * **段9** で作る（07-ai-proposals-impl.md の段割り）。この段では `adviceCount` だけの
 * 簡略版を置き、ナレッジが入ったら段9 で `knowledgeRev` を足す。
 */
export function promptVersionOf(base: string, adviceCount: number): string {
  return adviceCount > 0 ? `${base}+fb` : base;
}

/** 1文書 / 1スケジュール表あたり `state='open'` の提案の上限（04-ai.md §6-5e） */
export const AI_MAX_OPEN_PROPOSALS = 5;
/** 直近1時間の生成回数の上限（同上。乱打による費用と分母汚染を防ぐ） */
export const AI_MAX_GENERATIONS_PER_HOUR = 20;

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
