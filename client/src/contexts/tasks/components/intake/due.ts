/**
 * 期限まわりの小さな計算（投入口の確認画面で使う）
 *
 * **画面から出したのは、画面を見ても間違いに気づけないから。**
 * 「金曜 18:00」がずれていても、その週の金曜を数え直す人はいません。
 */

function pad(n: number) { return String(n).padStart(2, '0'); }

/** datetime-local 用の 'YYYY-MM-DDTHH:mm' に変換 */
export function toLocalInput(v?: string | null): string {
  if (!v) return '';
  return v.replace(' ', 'T').slice(0, 16);
}

/** サーバーに渡す 'YYYY-MM-DD HH:mm' に戻す */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return v.replace('T', ' ').slice(0, 16);
}

/**
 * 期限クイック選択。**短い順**に並べる (イズム: 期限はできるだけ短く設定する)。
 */
export function quickDueOptions(now = new Date()): { label: string; value: string }[] {
  const mk = (addDays: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + addDays);
    d.setHours(hour, minute, 0, 0);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
  };
  // 今週の金曜 (すでに金曜以降なら来週の金曜)
  const toFriday = (() => {
    let delta = (5 - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return delta;
  })();
  return [
    { label: '今日 18:00', value: mk(0, 18) },
    { label: '明日 10:00', value: mk(1, 10) },
    { label: '明日 18:00', value: mk(1, 18) },
    { label: '金曜 18:00', value: mk(toFriday, 18) },
    { label: '来週月曜 10:00', value: mk(((1 - now.getDay() + 7) % 7) + 7, 10) },
  ];
}

/** その期限が遠いか (イズム: 期限は短く。14 日より先は注意を添える) */
export function isFarDue(dueAt?: string | null): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return false;
  return (t - Date.now()) / 86400000 > 14;
}
