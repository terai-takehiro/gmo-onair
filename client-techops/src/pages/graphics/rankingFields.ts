// テロップCG — ランキング発表部品（`ranking`）のエントリー配列・進行状態の型と正規化。
//
// 段6-5（旧リアルタイムCG `client-awards` からの演出移植・完全再現。
// docs/design/v4/graphics-awards-migration-plan.md §2-2の3番の本体）。
// `graphics_pages.fields` は `Record<string, unknown>` なので、エントリー配列も
// JSON 配列を1キーに持たせるだけでよい（サーバー側スキーマ変更・migration 不要 —
// scoreEntries.ts / voteChoices.ts / voteState.ts と同じ設計）。
//
// **`step`（進行ステップ）は `reveal_phase`（cue側・TAKEのたびに-1へリセットされる
// 汎用機構）を使わない。** `voteState.ts` と同じ理由——`reveal_phase` に相乗りすると
// 「続きを一度も押していない既存ページ」が TAKE のたびに巻き戻る後方互換の壊れ方を
// 繰り返すため。`fields.step`/`fields.subPhase`/`fields.winnerEntryIndex` はページ側の
// 値として `PUT /pages/:id`（voteState・ScoreQuickAdjust と同じ「fieldsをその場で
// 書き換えてcg:syncで同報」の既存経路）で進める。

/** ランキング1件（受賞候補）。旧 `awards_entries` の主要列に対応 */
export interface RankingEntry {
  /** 順位（1が最上位）。vote パターンで最終確定前（final-pitch 以前）は未確定=null許容 */
  rank: number | null;
  name: string;
  nameEn?: string;
  company?: string;
  companyEn?: string;
  /** 得点。旧 `awards_entries.points`（NUMERIC(10,1)）を踏襲し小数第1位まで許容するが、
   *  CountUp表示自体は`Math.round`で整数化する（旧実装 `CountUp.tsx` と同じ丸め — 完全再現） */
  points: number;
  /** 自社票（任意）。ranks52 バーの内訳表示に使う */
  ownPoints?: number;
  photoUrl?: string;
  isWinner?: boolean;
}

export const RANKING_ENTRIES_KEY = 'entries';

/** 賞のパターン（旧 `awards_categories.award_pattern`）。direct=No.1を直接発表・vote=投票→No.1決定 */
export type AwardPattern = 'direct' | 'vote';

/**
 * 進行ステップ（旧 `awards_cue_state.step` の語彙を踏襲）。
 * `poll`/`vote-reveal` は旧実装でも「このCGでは表示しない」（`vote`部品の`voteState`が
 * 担当領域）ため、この型には含めない。`celebration`/`survey-oneshot` は段6-5の後続ラウンドで
 * レンダラーを追加する予定の型（段6-5 第1弾ではまだ描画しない——後述 `STEPS_DIRECT`/
 * `STEPS_VOTE` には含めていない。将来の後方互換のため型だけ先に用意する）
 */
export type RankingStep =
  | 'idle' | 'title' | 'nominees' | 'ranks52' | 'winner-bar' | 'oneshot'
  | 'top3' | 'final-pitch' | 'celebration' | 'survey-oneshot';

const STEP_KEY = 'step';
const SUB_PHASE_KEY = 'subPhase';
const WINNER_ENTRY_INDEX_KEY = 'winnerEntryIndex';
const AWARD_PATTERN_KEY = 'awardPattern';

/**
 * direct パターンの進行順（旧 `ControlPage.tsx` の `STEPS_DIRECT`）。
 * 段6-5 第2弾で `celebration` のレンダラーを追加したため終端に含めた（第1弾では `oneshot` が
 * 終端だった）。`nextRankingStep` は終端到達後は同じ値を返し続ける（何も壊さない）。
 */
export const STEPS_DIRECT: readonly RankingStep[] = ['idle', 'title', 'nominees', 'ranks52', 'winner-bar', 'oneshot', 'celebration'];

/**
 * vote パターンの進行順（旧 `ControlPage.tsx` の `STEPS_VOTE`）。
 * 段6-5 第2弾で `celebration` のレンダラーを追加したため終端に含めた（第1弾では
 * `final-pitch` が終端だった）。
 */
export const STEPS_VOTE: readonly RankingStep[] = ['idle', 'title', 'nominees', 'top3', 'final-pitch', 'celebration'];

function stepsFor(pattern: AwardPattern): readonly RankingStep[] {
  return pattern === 'vote' ? STEPS_VOTE : STEPS_DIRECT;
}

/** `fields.awardPattern` を読む。未指定・不正値は `'direct'`（後方互換の既定値） */
export function readAwardPattern(fields: Record<string, unknown> | null | undefined): AwardPattern {
  const v = fields?.[AWARD_PATTERN_KEY];
  return v === 'vote' ? 'vote' : 'direct';
}

/** `fields.step` を読む。未指定・不正値は `'idle'`（何も描画しない安全側の既定値） */
export function readRankingStep(fields: Record<string, unknown> | null | undefined): RankingStep {
  const v = fields?.[STEP_KEY];
  const known: readonly RankingStep[] = [
    'idle', 'title', 'nominees', 'ranks52', 'winner-bar', 'oneshot',
    'top3', 'final-pitch', 'celebration', 'survey-oneshot',
  ];
  return typeof v === 'string' && (known as readonly string[]).includes(v) ? (v as RankingStep) : 'idle';
}

/** `fields.subPhase` を読む。final-pitch のピック対象（0=3人並び・1〜3=該当スロット）等に使う汎用の段カウンタ */
export function readSubPhase(fields: Record<string, unknown> | null | undefined): number {
  const v = fields?.[SUB_PHASE_KEY];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** `fields.winnerEntryIndex` を読む。vote パターンで連動アンケートが無いときの手動No.1選択（`entries`配列のindex） */
export function readWinnerEntryIndex(fields: Record<string, unknown> | null | undefined): number | null {
  const v = fields?.[WINNER_ENTRY_INDEX_KEY];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/** 現在ステップの次ステップ（`awardPattern` に応じた進行順で1段進める）。終端到達後は同じ値を返す（no-op） */
export function nextRankingStep(pattern: AwardPattern, current: RankingStep): RankingStep {
  const steps = stepsFor(pattern);
  const idx = steps.indexOf(current);
  if (idx < 0) return steps[0];
  if (idx >= steps.length - 1) return current;
  return steps[idx + 1];
}

/** TAKE 時のリセット（`voteState.ts` の `withVoteStateReset` と同じ役割）。ステップ・サブフェーズ・手動No.1選択を初期化する */
export function withRankingStepReset(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    ...fields,
    [STEP_KEY]: 'idle' satisfies RankingStep,
    [SUB_PHASE_KEY]: 0,
    [WINNER_ENTRY_INDEX_KEY]: null,
  };
}

/** 「続き」ボタンが押されたときの新しい `fields`（ステップを1段進める。サブフェーズは0に戻す） */
export function withRankingStepAdvanced(fields: Record<string, unknown>): Record<string, unknown> {
  const pattern = readAwardPattern(fields);
  const current = readRankingStep(fields);
  return { ...fields, [STEP_KEY]: nextRankingStep(pattern, current), [SUB_PHASE_KEY]: 0 };
}

/** PICKボタン（final-pitch のピック対象切替）が押されたときの新しい `fields` */
export function withRankingSubPhase(fields: Record<string, unknown>, phase: number): Record<string, unknown> {
  return { ...fields, [SUB_PHASE_KEY]: Math.max(0, Math.floor(phase)) };
}

/** vote パターンで連動アンケートが無いときの手動No.1選択が押されたときの新しい `fields` */
export function withWinnerEntryIndex(fields: Record<string, unknown>, index: number | null): Record<string, unknown> {
  return { ...fields, [WINNER_ENTRY_INDEX_KEY]: index };
}

function toRankingEntry(v: unknown): RankingEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : '';
  const nameEn = typeof o.nameEn === 'string' ? o.nameEn : undefined;
  const company = typeof o.company === 'string' ? o.company : undefined;
  const companyEn = typeof o.companyEn === 'string' ? o.companyEn : undefined;
  const photoUrl = typeof o.photoUrl === 'string' ? o.photoUrl : undefined;
  const isWinner = o.isWinner === true;
  const rank = typeof o.rank === 'number' && Number.isFinite(o.rank) ? Math.trunc(o.rank) : null;
  const points = toPoints(o.points);
  const ownPointsRaw = toPoints(o.ownPoints);
  const ownPoints = o.ownPoints == null ? undefined : ownPointsRaw;
  return { rank, name, nameEn, company, companyEn, points, ownPoints, photoUrl, isWinner };
}

function toPoints(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 10) / 10;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.round(Number(v) * 10) / 10;
  return 0;
}

/** 未知の値（DB から読んだ `fields.entries` 生値）を安全な配列へ正規化する */
export function normalizeRankingEntries(v: unknown): RankingEntry[] {
  if (!Array.isArray(v)) return [];
  return v.map(toRankingEntry).filter((e): e is RankingEntry => e !== null);
}

/** 新規作成時の初期エントリー（5位〜1位の空欄5件。RANKS 5→2 + winner-bar がそのまま試せる件数） */
export function defaultRankingEntries(): RankingEntry[] {
  return [5, 4, 3, 2, 1].map((rank) => ({ rank, name: '', points: 0 }));
}
