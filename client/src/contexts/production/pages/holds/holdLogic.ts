/**
 * ③ 仮押さえ — 残り日数の数え方（画面を持たない部分）
 *
 * 「あと何日か」は判断そのもの（7日を切ったら赤くする）なので、
 * 画面を立てずに素で試せる形にしてあります。
 */

export const HOLD_KEY = ['studio-holds'];

export interface HoldRoom {
  room_id: string;
  room_name: string;
  room_abbreviation?: string | null;
}

export interface HoldRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status?: string;
  project_name: string | null;
  gls_number: string | null;
  rooms?: HoldRoom[];
  /** 仮押さえの何番手か。人が手入力する相対順位で、決めていなければ NULL */
  hold_rank?: number | null;
}

/**
 * 本番日まであと何日か。**日付だけで数える**（時刻を混ぜると
 * 「今日の18時開始」が 0 日にも 1 日にもなり、赤くなったりならなかったりする）。
 * 過ぎていればマイナスを返す — 押さえたまま忘れられた枠を先頭に出すため。
 */
export function daysLeft(startTime: string, today: string): number {
  const start = startTime.slice(0, 10);
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${start}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** バッジの色。**7日 / 14日で段を変える**（モックと同じ） */
export function leftTone(left: number): string {
  if (left <= 7) return 'border-transparent bg-destructive-surface text-destructive';
  if (left <= 14) return 'border-transparent bg-warning-surface text-warning';
  return 'border-transparent bg-muted text-muted-foreground';
}

/** 「あと3日」「今日」「3日前」。**過ぎたものを「あと -3日」と出さない** */
export function leftLabel(left: number): string {
  if (left === 0) return '今日';
  if (left < 0) return `${-left}日前`;
  return `あと${left}日`;
}

/** 「2番手」。決めていなければ何も出さない（未入力を「1番手」と混同しない） */
export function rankLabel(rank: number | null | undefined): string | null {
  if (!rank || rank < 1) return null;
  return `${rank}番手`;
}
