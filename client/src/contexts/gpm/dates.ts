/**
 * 日付・進み具合の純関数 — `types.ts` から切り出し（1ファイル400行の上限）。
 * **呼び出し側は今までどおり `types.ts` から import する**（そこで再エクスポート）。
 */
import type { PhaseState } from './types';

/**
 * `2026-05-12T00:00:00.000Z` → `2026-05-12`。
 * **`new Date()` を通さない** — 端末の時間帯で前日になる。
 */
export function ymd(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/**
 * 進み具合（%）。**列には無いので工程の完了数から出す**
 * （列に持つと同じ数字を2か所で数えることになり、必ず食い違う）。
 * 工程が1つも無いプロジェクトは `null`（0% と「まだ工程が無い」は別）。
 */
export function progressPct(done: number, count: number): number | null {
  if (!count) return null;
  return Math.round((done / count) * 100);
}

/**
 * 詳細画面での進み具合。**一覧と同じ数え方**（完了した工程 ÷ 工程の数）に
 * 揃えてあります — 詳細だけタスクの完了率で出すと、一覧と詳細で
 * 違う％が出て「どちらが本当か」が分からなくなります。
 */
export function phaseProgress(phases: { state: PhaseState }[]): { done: number; count: number; pct: number | null } {
  const done = phases.filter((p) => p.state === 'done').length;
  return { done, count: phases.length, pct: progressPct(done, phases.length) };
}

/**
 * 遅れの日数。**終わりの日付が今日より前で、まだ終わっていない**ときだけ正の数を返す。
 * ガントの赤枠・工程リストの「N日遅れ」・スマホ工程表のバッジが全部これを使う
 * （画面ごとに数え直すと必ず食い違う — 「同じ数字を2か所で数えない」の決めごと）。
 */
export function lateDays(end: string | null, today: string, done: boolean): number {
  if (done || !end || end >= today) return 0;
  const at = (s: string) => new Date(`${s}T00:00:00`).getTime();
  return Math.round((at(today) - at(end)) / 86_400_000);
}

/** 期限の色。**超過だけを赤にする** — 全部に色を付けると超過が埋もれる */
export function dueTone(due: string | null, today: string): string {
  if (!due) return 'text-muted-foreground';
  if (due < today) return 'text-destructive';
  if (due === today) return 'text-warning';
  return 'text-muted-foreground';
}

/** `2026-08-05` → `08/05 超過` のような短い表記 */
export function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  const short = due.slice(5).replace('-', '/');
  if (due < today) return `${short} 超過`;
  if (due === today) return `${short} 今日`;
  return short;
}
