// 制作技術支援トップ（/techops/top）— 一覧の組み立てに使う純粋関数。
// ProductionTopPage.tsx から分離（1ファイルが大きくなりすぎるのを防ぐ・check-file-size）。
import { todayStr, nextDayStr } from '@/lib/dateFmt';
import type { TopItem } from '@/lib/topApi';
import type { RecentTopEntry } from '@/lib/recentTop';

export type Segment = 'all' | 'gls' | 'own';
export type TopView = 'active' | 'archive';

/** 「最後の回の翌日」からアーカイブ扱い。`last_date` が無い項目（GLS-B系・実施日未定）は終了しない扱い */
export function isArchived(item: TopItem, today: string = todayStr()): boolean {
  return !!item.last_date && today >= nextDayStr(item.last_date);
}

export function matchesSegment(item: TopItem, segment: Segment): boolean {
  if (segment === 'all') return true;
  return item.kind === segment;
}

export function matchesSearch(item: TopItem, rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  return (
    item.name.includes(q) ||
    (item.gls_number ?? '').includes(q) ||
    (item.customer_name ?? '').includes(q)
  );
}

/** GLS案件は「GLS番号 ・ 得意先」、ここだけの番組は固定文言 */
export function topItemMeta(item: TopItem): string {
  if (item.kind === 'gls') {
    return item.customer_name ? `${item.gls_number ?? ''} ・ ${item.customer_name}` : (item.gls_number ?? '');
  }
  return 'ここだけの番組';
}

export function topItemHref(item: TopItem): string {
  return item.kind === 'gls' ? `/techops/projects/${item.id}` : `/techops/programs/${item.id}`;
}

export function recentEntryHref(entry: RecentTopEntry): string {
  return entry.kind === 'project' ? `/techops/projects/${entry.id}` : `/techops/programs/${entry.id}`;
}

/** 本体の一覧: `next_date` がある項目を昇順で先に、残りは元の並びのまま後ろに */
export function sortMainList(items: TopItem[]): TopItem[] {
  const withDate = items
    .filter((i) => i.next_date)
    .sort((a, b) => a.next_date!.localeCompare(b.next_date!));
  const withoutDate = items.filter((i) => !i.next_date);
  return [...withDate, ...withoutDate];
}

/** 「直近の本番・収録」— `next_date` 昇順で先頭 `limit` 件 */
export function upcomingItems(active: TopItem[], limit = 3): TopItem[] {
  return active
    .filter((i) => i.next_date)
    .sort((a, b) => a.next_date!.localeCompare(b.next_date!))
    .slice(0, limit);
}

/** アーカイブは「最後の回」が新しい順 */
export function sortArchive(items: TopItem[]): TopItem[] {
  return [...items].sort((a, b) => (b.last_date ?? '').localeCompare(a.last_date ?? ''));
}
