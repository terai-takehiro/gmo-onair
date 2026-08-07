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
 * A〜E は**受注に近い順**で、E は **問合せ**（DB の `neta`）です。完了と失注は
 * 記号を持たず「終了」に畳みます（モックの `plChips`）。DB の値は変えていません
 * — 画面に出す名前だけを合わせています（`ProjectStageLabels` の説明を参照）。
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
 * `stages` が API に送る値 (カンマ区切り)。「終了」だけ2つのステージにまたがる。
 */
export const STAGE_CHIPS: { key: string; label: string; stages: ProjectStage[] }[] = [
  { key: 'all', label: 'すべて', stages: [] },
  { key: 'a_won', label: 'A 受注済', stages: ['a_won'] },
  { key: 'b_verbal', label: 'B 口頭決定', stages: ['b_verbal'] },
  { key: 'c_proposal', label: 'C 見積提案', stages: ['c_proposal'] },
  { key: 'd_hold', label: 'D 仮押さえ', stages: ['d_hold'] },
  { key: 'neta', label: 'E 問合せ', stages: ['neta'] },
  { key: 'done', label: '終了', stages: ['s_completed', 'e_lost'] },
];

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
