// レンタル機材検索の画面共通フォーマッタ。`client-techops/src/pages/rental/rentalFormat.ts`
// の対応する関数と同じ実装（このアプリは予約・期間の機能を持たないため、その関連分は持ってこない）。
export function formatYen(value: number | null | undefined): string {
  if (value == null) return '—';
  return `¥${value.toLocaleString('ja-JP')}`; // ui-tokens-ok: qsheet 側と揃えた自前実装
}

export function companyBadgeClass(company: string): string {
  return company === 'レスター' ? 'bg-cat-7/10 text-cat-7' : 'bg-primary-surface text-primary';
}

/** ISO日時 → '8/22 9:15'（取得状況の表示用。会社別の last_seen 最大値を渡す想定） */
export function formatSyncTimestamp(iso: string | null): string {
  if (!iso) return '未取得';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '未取得';
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
