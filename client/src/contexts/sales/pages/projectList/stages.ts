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
 * ── モックとの違い (意図した2点) ────────────────────────────
 *
 * ① モックはネタを **「E 問合せ」**と呼び、失注を**「終了」**に畳んでいます。
 *    ここでは**いまの記号のまま**にしました — `stage` の値・他画面・
 *    受注確度 (`ProjectStageProbability`) が「E = 失注」で書かれており、
 *    一覧だけ E の意味を変えると読み手が取り違えます。付け替えるなら
 *    全画面と DB のコード表を同時に変える別の作業です
 * ② モックは「ネタ」と「D 仮押さえ」を**どちらも灰**にしています。
 *    ここでは仮押さえを淡い青にしました — 一覧の「すべて」では両方が
 *    並ぶので、同じ灰だと**まだ何も動いていない案件と、部屋を押さえた案件が
 *    見分けられません**。色は「進み具合」を表します
 *    (灰 → 淡い青 → 青 → 緑、終わったものは灰)。
 */
import type { ProjectStage } from '@/types';

/** バッジに出す和文 (2〜4字。`TableBadge` が 62px に均等割り付けする) */
export const STAGE_BADGE_LABEL: Record<ProjectStage, string> = {
  neta: 'ネタ',
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
  d_hold: 'border-transparent bg-primary-surface-weak text-primary',
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
  { key: 'neta', label: 'ネタ', stages: ['neta'] },
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
