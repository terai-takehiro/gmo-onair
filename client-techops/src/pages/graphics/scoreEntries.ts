// テロップCG — スコアボード部品のエントリー配列（`fields.entries`）の型と正規化。
//
// `GraphicsPageRow.fields` は `Record<string, unknown>` なので、対戦者/エントリーは
// JSON 配列を1キーに持たせるだけでよい（サーバー側スキーマ変更・migration 不要 —
// タスク前提の背景メモのとおり）。フォーム（ScoreEntriesEditor）・出力レンダラー
// （scoreParts.tsx）・送出コンソールの±（ScoreQuickAdjust.tsx）が同じ形で読み書き
// できるよう、正規化・既定値・キー名をこの1ファイルに閉じる。
export interface ScoreEntry {
  name: string;
  /** 英語版の名前（任意）。出力の `?lang=en` で優先表示・未入力なら `name` へフォールバック */
  nameEn?: string;
  points: number;
}

/** `fields` の中でエントリー配列を持つキー（pageFields.ts の score 定義と一致させる） */
export const SCORE_ENTRIES_KEY = 'entries';

export const DEFAULT_MAX_ENTRIES = 6;
export const DEFAULT_NAME_LIMIT = 8;

function toEntry(v: unknown): ScoreEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name : '';
  const nameEn = typeof o.nameEn === 'string' ? o.nameEn : '';
  const points = toPoints(o.points);
  return { name, nameEn, points };
}

function toPoints(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.trunc(Number(v));
  return 0;
}

/** 未知の値（DB から読んだ `fields.entries` 生値）を安全な配列へ正規化する */
export function normalizeScoreEntries(v: unknown): ScoreEntry[] {
  if (!Array.isArray(v)) return [];
  return v.map(toEntry).filter((e): e is ScoreEntry => e !== null);
}

/** 新規作成時の初期エントリー（対戦の最小構成=2件） */
export function defaultScoreEntries(): ScoreEntry[] {
  return [{ name: '', nameEn: '', points: 0 }, { name: '', nameEn: '', points: 0 }];
}
