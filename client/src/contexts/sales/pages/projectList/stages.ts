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
 * **E（ネタ）のチップはこの版で外しました。** ネタは3つ目の見え方
 * タブが持ちます（下の `STAGE_CHIPS` の説明）。バッジの文字と色は残してあります —
 * 「ネタ」タブと案件詳細では今までどおりネタの札が出るためです。
 *
 * 色も**モックの実測値**です（`onair-data.js` の `plRows`）。
 * **ネタと仮押さえは同じ灰**（bg `#f2f4f7` / fg `#5d6470` ＝ `muted`）で、
 * 見積提案と口頭決定が同じ淡い青、受注済だけ緑になります。
 * 「まだ金額が動いていない段」を1つの灰にまとめる見せ方です。
 */
import type { ProjectStage } from '@/types';

/** バッジに出す和文 (2〜4字。`TableBadge` が 62px に均等割り付けする) */
export const STAGE_BADGE_LABEL: Record<ProjectStage, string> = {
  neta: 'ネタ',
  d_hold: '仮押さえ',
  c_proposal: '見積提案',
  b_verbal: '口頭決定',
  a_won: '受注済',
  r_delivered: '実施済',
  s_completed: '完了',
  e_lost: '失注',
};

/**
 * バッジの色。**生のパレットは使わない** — 状態の色トークンから選ぶ。
 *
 * `r_delivered`（実施済・財務処理中、2026-09 追加）だけ warning 系にしてある —
 * 「受注済」の緑・「完了」の緑と同じ色にすると、財務処理がまだ済んでいないことが
 * 一覧のバッジからは分からなくなる（要求の趣旨そのもの）。
 */
export const STAGE_BADGE_TONE: Record<ProjectStage, string> = {
  neta: 'border-transparent bg-muted text-muted-foreground',
  d_hold: 'border-transparent bg-muted text-muted-foreground',
  c_proposal: 'border-transparent bg-primary-surface text-primary',
  b_verbal: 'border-transparent bg-primary-surface text-primary',
  a_won: 'border-transparent bg-success-surface text-success',
  r_delivered: 'border-transparent bg-warning-surface text-warning',
  s_completed: 'border-transparent bg-success-surface text-success',
  e_lost: 'border-transparent bg-muted text-muted-foreground',
};

/**
 * 終わった案件 (行を薄くする)。完了と失注はバッジの色で見分ける。
 *
 * **`r_delivered` はここに含めない**（意図的）— 財務処理がまだ残っている案件を
 * 「終わった」扱いで行を薄くすると、対応が必要なことに気づきにくくなる。
 */
export const TERMINAL_STAGES: ProjectStage[] = ['s_completed', 'e_lost'];

/**
 * 「進行中」（旧・分ける前の `all`）が指す4ステージ。**チップ・既定の初期値・
 * `clearFilters` の3か所が同じ配列を指す**（`STAGE_CHIPS` の下のコメント参照）。
 *
 * **`r_delivered`（実施済・財務処理中）はここに含めない**（意図的）— 実施そのものは
 * 終わっているので「進行中」の集計・チップに混ぜると、財務が拾うべき案件が
 * 埋もれる。専用のチップ（`STAGE_CHIPS` の `r_delivered`）で別に見せる。
 */
export const ACTIVE_STAGES: ProjectStage[] = ['d_hold', 'c_proposal', 'b_verbal', 'a_won'];

/**
 * 「すべて」の件数を数えるステージ。ネタを除く全ステージ（終了＝完了・失注を含む）。
 * **チップの合計とは別に持つ** — チップを足し算すると「すべて」に出していない
 * ネタまで数えてしまい、「全 42 件」と出して 31 行しか並ばないことになります。
 */
export const ALL_STAGES: ProjectStage[] = [...ACTIVE_STAGES, 'r_delivered', 's_completed', 'e_lost'];

/**
 * 絞り込みのチップ。**並びはモックどおり**「受注に近い順」。
 * `stages` が API に送る値 (カンマ区切り)。空配列は**絞り込み無し**を意味し、
 * サーバーへ `stage` パラメータそのものを送らない（`ProjectListPage.tsx`）。
 *
 * ── 「E ネタ」のチップを外した ──────────────────────────────
 *
 * **ネタ ＝ E ネタで同じもの**です。チップにも見え方のタブにも両方あったので、
 * 同じ案件が2か所から絞り込めて、しかも名前が違っていました。
 * → **ネタは3つ目の見え方タブ「ネタ」に寄せます**（列が違うので、
 *   そちらのほうが読めます — 金額も実施日もほとんど空なので）。
 * **この画面のチップにネタは戻さない** — 「すべて」もネタは出さない。
 *
 * ── 「すべて」と「進行中」を分けた（ユーザー指摘 2026-08-25） ──
 *
 * 以前はここが1つの `all` チップ（ラベル「すべて（進行中）」・
 * ネタと終了を含まない4ステージだけ）しか持たず、**「すべて」を選んでも
 * 完了・失注の案件が出せませんでした**（ラベルで「進行中だけ」と
 * 断ってはいたが、探している人はまず「すべて」を押す）。
 *  ・**`all`**（「すべて」）… ネタを除く全ステージ（`ALL_STAGES`）。
 *    終了（完了・失注）も含む、文字どおりの全件
 *  ・**`active`**（「進行中」）… 旧 `all` と同じ4ステージ。**既定はこちら**
 *    （`ProjectListPage.tsx` の初期値・`clearFilters`）。分ける前の挙動を
 *    壊さないため、何も選ばずに開いたときはこれまでどおり進行中だけが並ぶ
 */
export const STAGE_CHIPS: { key: string; label: string; stages: ProjectStage[] }[] = [
  { key: 'all', label: 'すべて', stages: ALL_STAGES },
  { key: 'active', label: '進行中', stages: ACTIVE_STAGES },
  { key: 'a_won', label: 'A 受注済', stages: ['a_won'] },
  { key: 'b_verbal', label: 'B 口頭決定', stages: ['b_verbal'] },
  { key: 'c_proposal', label: 'C 見積提案', stages: ['c_proposal'] },
  { key: 'd_hold', label: 'D 仮押さえ', stages: ['d_hold'] },
  // r_delivered = 実施済（財務処理中）。2026-09 追加。A 受注済と「終了」の間に置く
  // — 財務処理が終わっていないのに「終了」チップの完了に紛れないよう独立させる
  { key: 'r_delivered', label: 'R 実施済', stages: ['r_delivered'] },
  { key: 'done', label: '終了', stages: ['s_completed', 'e_lost'] },
];

// 旧 `STALE_DAYS`（クライアント7日判定）はここに居ましたが、**削除済み**です
// （docs/core-redesign-plan.md §3-1）。「止まっている」の判定は
// `server/.../project-health.ts` の単一定義をサーバーが行に付けて返す `health` が正で、
// 最後まで参照していた GPM の「おすすめ順」も health ベースに置き換えました。
