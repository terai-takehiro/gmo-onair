// ページの並べ替え（上へ・下へ）の計算。`components/schedule/columnOrder.ts` と同じ作法。
// サーバーの `POST .../pages/reorder` は「ページ id・並び順」の配列を受け取る
// （契約: docs/design/v4/production-manual.md §5・段A）。冊子は列のようなグループを
// 持たないので、常に冊子内の全ページを対象に並べ直す。
import type { ManualPage } from "@gmo-onair/shared/src/opsmanual/types";

export interface PageReorderEntry { id: string; sort_order: number }

/** ページを `sort_order` 順に並べたもの */
export function pagesSorted(pages: ManualPage[]): ManualPage[] {
  return [...pages].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * `page` を上（-1）か下（+1）へ1つ動かしたときの reorder 配列。
 * 端で動かせないときは null。
 */
export function movePage(pages: ManualPage[], page: ManualPage, direction: -1 | 1): PageReorderEntry[] | null {
  const sorted = pagesSorted(pages);
  const index = sorted.findIndex((p) => p.id === page.id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return null;
  const next = [...sorted];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((p, i) => ({ id: p.id, sort_order: i }));
}
