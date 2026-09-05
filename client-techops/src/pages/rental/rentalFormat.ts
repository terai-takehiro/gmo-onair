// レンタル機材検索の画面共通フォーマッタ。金額は toLocaleString('ja-JP') の自前実装で足りる
// （shared の Money は凍結アプリの qsheet では使わない・タスク指示）。
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function formatYen(value: number | null | undefined): string {
  if (value == null) return '—';
  return `¥${value.toLocaleString('ja-JP')}`; // ui-tokens-ok: qsheet はタスク指示により Money を使わず自前実装
}

export function todayStr(): string {
  // toISOString() は UTC なので JST の 0〜9 時に前日へずれる。ローカル日付で組む
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → '9/11（金）' */
export function formatDateJp(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS_JA[d.getDay()]}）`;
}

/** 開始日〜終了日の日数（両端含む） */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return diff > 0 ? diff : 1;
}

export function companyBadgeClass(company: string): string {
  return company === 'レスター' ? 'bg-cat-7/10 text-cat-7' : 'bg-primary-surface text-primary';
}

/** ISO日時 → '8/22 9:15'（取得状況の表示用。会社別の last_seen 最大値を渡す想定） */
export function formatSyncTimestamp(iso: string | null): string {
  if (!iso) return 'まだありません';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'まだありません';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** 自動取得は毎日1回（既定5時）想定。バッファを見て30時間を超えて更新が無ければ「止まっているかも」とみなす。
 * rental-scraper/README.md の「既知の不具合」節に合わせた目安（正確な失敗検知ではなく簡易な目安）。 */
export function isSyncStale(iso: string | null, thresholdHours = 30): boolean {
  if (!iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() > thresholdHours * 3_600_000;
}
