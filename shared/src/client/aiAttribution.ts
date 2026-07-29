/**
 * AI がやったことの見せ方 — **人名を出さない** (v3.0.6)
 *
 * ── なぜこのファイルがあるか ────────────────────────────
 *
 * AI (MCP 経由) が作った記録には、人名に見える値が 2 つ乗るが、
 * **どちらも「その人がやった」証拠にならない**。
 *
 *  1. `requested_by` / `ai_requested_by`
 *     AI が監査ログに書く**自由記述**。名簿と突き合わせていないので誤字が入る。
 *     実際に「寺井 赳博」さんが **「寺井武大」** として記録されていた
 *     (AI がメール本文から漢字を推測して書いたもの)。
 *     画面で「指示: 寺井武大」と出すと、**実在しない人名を断定的に見せてしまう**。
 *
 *  2. `actor_name` (`actor_id` を users と結合したもの)
 *     MCP の接続に使った ONAiR ユーザー。OAuth 連携だと実名が付くが、
 *     その人が手で入力したわけではなく **AI が自動で実行した**もの。
 *     AI の活動一覧にこの名前を出すと「この人が入れた」と読めてしまう。
 *
 * ── どうするか ──────────────────────────────────────
 *
 * **監査のための値は DB に残したまま、画面には「AI がやった」ことだけを出す。**
 * 消すのではなく、出す場所を変える (誰の責任かを追う必要があるときは監査ログを見る)。
 *
 * `npm run lint` の `ai-person-name` ルールが、画面のコードで
 * `requested_by` / `ai_requested_by` を出力しようとすると止める。
 */

/** MCP を共用の接続情報で使ったときの `actor_id` (実在のユーザーではない) */
export const MCP_ACTOR_ID = 'mcp-claude';

/** 行の中に置く短い表示。「誰が」ではなく「AI が」だけを言う */
export const AI_ACTOR_LABEL = 'AI が自動実行';

/** バッジの文字 */
export const AI_BADGE_LABEL = 'AI作成';

/**
 * ツールチップ用の一文。人名は入れず、AI がやったことだけを書く。
 *
 * @param what 「登録」「記録」「作成」など、AI がした動作
 * @example aiOriginTitle('登録') // → 'AI が自動で登録しました（人が入力したものではありません）'
 */
export function aiOriginTitle(what: string): string {
  return `AI が自動で${what}しました（人が入力したものではありません）`;
}

/**
 * `actor_id` が AI (MCP) かどうか。
 *
 * **共用の接続情報のときだけ判定できる**。OAuth 連携で MCP を使うと
 * `actor_id` に実ユーザーの id が入るため、この関数では人の手入力と区別が付かない。
 * そのため「その表がそもそも AI の記録だけを持つか」(例: `mcp_audit_log`) が
 * 分かっている場所では、この判定を待たずに AI として扱うこと。
 */
export function isAiActor(actorId: string | null | undefined): boolean {
  return actorId === MCP_ACTOR_ID;
}

/**
 * 変更履歴などで出す実行者名。**AI の行は人名にしない。**
 * 人が手で直した行はその人の名前を出す (名簿由来なので誤字が無い)。
 */
export function actorDisplayName(
  actorId: string | null | undefined,
  actorName: string | null | undefined,
): string {
  if (isAiActor(actorId)) return AI_ACTOR_LABEL;
  return actorName ?? '不明';
}
