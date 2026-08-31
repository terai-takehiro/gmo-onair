// テロップCG — 投票・クイズ部品の選択肢配列（`fields.choices`）の型と正規化。
//
// `GraphicsPageRow.fields` は `Record<string, unknown>` なので、選択肢は JSON 配列を
// 1キーに持たせるだけでよい（サーバー側スキーマ変更・migration 不要 — scoreEntries.ts
// と同じ設計）。フォーム（VoteChoicesEditor）・出力レンダラー（voteParts.tsx）が
// 同じ形で読み書きできるよう、正規化・既定値・割合計算をこの1ファイルに閉じる。
export interface VoteChoice {
  label: string;
  /** 票数。0以上の整数のみ（負値・NaN は 0 に丸める） */
  votes: number;
}

/** `fields` の中で選択肢配列を持つキー（pageFields.ts の vote 定義と一致させる） */
export const VOTE_CHOICES_KEY = 'choices';

export const DEFAULT_MAX_CHOICES = 8;
export const DEFAULT_CHOICE_LABEL_LIMIT = 12;

function toVotes(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Math.max(0, Math.trunc(Number(v)));
  }
  return 0;
}

function toChoice(v: unknown): VoteChoice | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label : '';
  return { label, votes: toVotes(o.votes) };
}

/** 未知の値（DB から読んだ `fields.choices` 生値）を安全な配列へ正規化する */
export function normalizeVoteChoices(v: unknown): VoteChoice[] {
  if (!Array.isArray(v)) return [];
  return v.map(toChoice).filter((c): c is VoteChoice => c !== null);
}

/** 新規作成時の初期選択肢（投票・クイズの最小構成=2択） */
export function defaultVoteChoices(): VoteChoice[] {
  return [{ label: '', votes: 0 }, { label: '', votes: 0 }];
}

/** 全選択肢の合計票数 */
export function totalVotes(choices: VoteChoice[]): number {
  return choices.reduce((sum, c) => sum + c.votes, 0);
}

/**
 * 選択肢1件分の割合（%・整数に四捨五入）。合計が0（まだ誰も投票していない）は
 * 0除算・NaN を避けて 0 を返す（graphics-design-specs.md §9.9「合計0件は0%に倒す」）。
 */
export function sharePercent(votes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((votes / total) * 100);
}
