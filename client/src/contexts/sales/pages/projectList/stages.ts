/**
 * 案件一覧のステージの見せ方 (v4)
 *
 * ── バッジの文字は「和文だけ」にしてある ────────────────────
 *
 * `ProjectStageLabels` は「A 受注済」「D 仮押さえ」のように**英字の記号を含みます**。
 * これをそのままバッジに入れると、`<TableBadge>` の均等割り付け
 * (和文4字までを 62px にそろえる) が効かず、**色の塊の幅が行ごとに変わります**
 * (「A 受注済」5字 と「C 見積提案済」7字)。目は文字ではなく色の塊の形で
 * 行を追うので、幅が揃っていないと縦に流し読みできません。
 *
 * → **バッジは和文だけ (2〜4字)**、記号つきの正式名は絞り込みのチップ側に出します。
 *
 * ── 記号と色はモックに合わせてある ─────────────────────────
 *
 * A〜D は**受注に近い順**です。完了と失注は記号を持たず「終了」に畳みます
 * （モックの `plChips`）。DB の値は変えていません — 画面に出す名前だけを
 * 合わせています（`ProjectStageLabels` の説明を参照）。
 *
 * **E（問合せ ＝ ネタ）のチップはこの版で外しました。** ネタは3つ目の見え方
 * タブが持ちます（下の `STAGE_CHIPS` の説明）。バッジの文字と色は残してあります —
 * 「ネタ」タブと案件詳細では今までどおりネタの札が出るためです。
 *
 * 色も**モックの実測値**です（`onair-data.js` の `plRows`）。
 * **問合せと仮押さえは同じ灰**（bg `#f2f4f7` / fg `#5d6470` ＝ `muted`）で、
 * 見積提案と口頭決定が同じ淡い青、受注済だけ緑になります。
 * 「まだ金額が動いていない段」を1つの灰にまとめる見せ方です。
 */
import type { ProjectStage } from '@/types';

/** バッジに出す和文 (2〜4字。`TableBadge` が 62px に均等割り付けする) */
export const STAGE_BADGE_LABEL: Record<ProjectStage, string> = {
  neta: '問合せ',
  d_hold: '仮押さえ',
  c_proposal: '見積提案',
  b_verbal: '口頭決定',
  a_won: '受注済',
  s_completed: '完了',
  e_lost: '失注',
};

/** バッジの色。**生のパレットは使わない** — 状態の色トークンから選ぶ */
export const STAGE_BADGE_TONE: Record<ProjectStage, string> = {
  neta: 'border-transparent bg-muted text-muted-foreground',
  d_hold: 'border-transparent bg-muted text-muted-foreground',
  c_proposal: 'border-transparent bg-primary-surface text-primary',
  b_verbal: 'border-transparent bg-primary-surface text-primary',
  a_won: 'border-transparent bg-success-surface text-success',
  s_completed: 'border-transparent bg-success-surface text-success',
  e_lost: 'border-transparent bg-muted text-muted-foreground',
};

/** 終わった案件 (行を薄くする)。完了と失注はバッジの色で見分ける */
export const TERMINAL_STAGES: ProjectStage[] = ['s_completed', 'e_lost'];

/**
 * 絞り込みのチップ。**並びはモックどおり**「受注に近い順」。
 * `stages` が API に送る値 (カンマ区切り)。
 *
 * ── 「E 問合せ」のチップを外した ────────────────────────────
 *
 * **ネタ ＝ E 問合せで同じもの**です。チップにも見え方のタブにも両方あったので、
 * 同じ案件が2か所から絞り込めて、しかも名前が違っていました。
 * → **ネタは3つ目の見え方タブ「ネタ」に寄せます**（列が違うので、
 *   そちらのほうが読めます — 金額も実施日もほとんど空なので）。
 *
 * ── 「すべて」にネタと終了を出さない ────────────────────────
 *
 * `all` は**空**にせず、出すステージを名指しします。空にすると
 * サーバーは絞り込み無し＝**ネタも終了も全部**返すためです。
 *  ・**ネタ**は「ネタ」タブが持つ（案件の数にもヨミにも入らない）
 *  ・**終了**（完了・失注）は動かないのが正しい状態なので、
 *    探しに行ったときだけ出す（「終了」チップ）
 */
export const STAGE_CHIPS: { key: string; label: string; stages: ProjectStage[] }[] = [
  // ⚠️ **「すべて」に「（進行中）」を足した**（UXレポート 2026-08-18 指摘）。
  // 上のコメントの通り「すべて」はネタ・終了を含まない4ステージだけを指すが、
  // ラベルが「すべて」のままだと初見では全件を指すように読める。何が入るかを
  // 一言で示す（詳しい内訳は `docs/reviews/2026-08-19-uiux-operation-report-response.md` 4-4）
  { key: 'all', label: 'すべて（進行中）', stages: ['d_hold', 'c_proposal', 'b_verbal', 'a_won'] },
  { key: 'a_won', label: 'A 受注済', stages: ['a_won'] },
  { key: 'b_verbal', label: 'B 口頭決定', stages: ['b_verbal'] },
  { key: 'c_proposal', label: 'C 見積提案', stages: ['c_proposal'] },
  { key: 'd_hold', label: 'D 仮押さえ', stages: ['d_hold'] },
  { key: 'done', label: '終了', stages: ['s_completed', 'e_lost'] },
];

/**
 * 「すべて」の件数を数えるステージ。**チップの合計とは別に持つ** —
 * チップを足し算すると「すべて」に出していないネタと終了まで数えてしまい、
 * 「全 42 件」と出して 31 行しか並ばないことになります。
 */
export const ALL_STAGES: ProjectStage[] = ['d_hold', 'c_proposal', 'b_verbal', 'a_won'];

/**
 * 「止まっている」と見なす日数。
 *
 * 実施日が先でも、**1週間だれも触っていない生きた案件**は誰かが忘れています。
 * 終わった案件 (完了・失注) には出しません — 動かないのが正しい状態なので。
 */
export const STALE_DAYS = 7;

export function isStale(stage: ProjectStage, lastActivityAt: string | null | undefined): boolean {
  if (!lastActivityAt || TERMINAL_STAGES.includes(stage)) return false;
  const t = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t >= STALE_DAYS * 86_400_000;
}
