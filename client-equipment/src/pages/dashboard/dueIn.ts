/**
 * 返却予定日まわりの計算。`DashboardPage.tsx`（PC の Row）と
 * `LendingCards.tsx`（スマホのカード）が両方これを読む — 写すと、
 * 片方だけ直したときに「超過」の境目が画面によってずれる。
 */

/** 返却予定日から「あと何日 / 何日超過」を出す。日付が無ければ null */
export function dueIn(due: string | null): number | null {
  if (!due || due.length < 10) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${due.slice(0, 10)}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** `MM/DD` に整える。日付が無ければ `—` */
export const md = (d: string | null): string => (d && d.length >= 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '—');
