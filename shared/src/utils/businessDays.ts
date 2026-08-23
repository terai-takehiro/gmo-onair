// v2.8.103+: 営業日計算ユーティリティ。
// 土日 (Sat=6, Sun=0) と日本の祝日 (@holiday-jp/holiday_jp) を非営業日として扱う。
import holiday_jp from '@holiday-jp/holiday_jp';

const isWeekend = (d: Date): boolean => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

function isBusinessDay(d: Date): boolean {
  if (isWeekend(d)) return false;
  if (holiday_jp.isHoliday(d)) return false;
  return true;
}

/** 指定日が非営業日 (土日祝) なら、その**前**営業日まで戻る。
 *  営業日であればそのまま返す。 */
export function previousBusinessDay(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (!isBusinessDay(out)) {
    out.setDate(out.getDate() - 1);
  }
  return out;
}

/** YYYY-MM-DD 形式 (ローカルタイム) で文字列化。 */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
