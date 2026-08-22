// レンタル機材検索の画面共通フォーマッタ。金額は toLocaleString('ja-JP') の自前実装で足りる
// （shared の Money は凍結アプリの qsheet では使わない・タスク指示）。
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function formatYen(value: number | null | undefined): string {
  if (value == null) return '—';
  return `¥${value.toLocaleString('ja-JP')}`; // ui-tokens-ok: qsheet はタスク指示により Money を使わず自前実装
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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
