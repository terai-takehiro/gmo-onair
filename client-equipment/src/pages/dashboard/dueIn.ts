/**
 * 返却予定日まわりの計算。`DashboardPage.tsx`（PC の Row）と
 * `LendingCards.tsx`（スマホのカード）が両方これを読む — 写すと、
 * 片方だけ直したときに「超過」の境目が画面によってずれる。
 */

/** 返却予定日までの日数（過ぎていれば負）。日付が無ければ null */
export function dueIn(due: string | null): number | null {
  if (!due || due.length < 10) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${due.slice(0, 10)}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** `MM/DD` に整える。日付が無ければ `—` */
export const md = (d: string | null): string => (d && d.length >= 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '—');

/**
 * 返却予定日の状態を札に出す言い方。「N日超過」「本日」「残りN日」。
 *
 * 言い方は営業活動記録の期限（`activityLog/dueState.ts` の `duePartsOf`）と揃える
 * （`docs/wording.md` ルール8・9）。✕「あと3日」「3日 超過」（空白入り）は口語・表記揺れ。
 *
 * **当日を「本日返却」と書かない。** 札の隣に「返却 MM/DD」が既に出ているので、
 * 札は超過・残りと同じ列の「状態」だけを言えばよい（「返却」を二度書くと、
 * 同じ列で当日だけ字数が増えて札の幅が揃わない）。
 *
 * `DashboardPage.tsx`（PC の Row）と `LendingCards.tsx`（スマホのカード）が両方読む —
 * 写すと片方だけ言い方が古いまま残る（このファイルの冒頭と同じ理由）。
 */
export function dueBadgeLabel(days: number): string {
  if (days < 0) return `${-days}日超過`;
  if (days === 0) return '本日';
  return `残り${days}日`;
}
