// 列の並べ替え（左へ・右へ）の計算。14-schedule-v2-plan.md §3 A1
//
// サーバーの `PUT .../columns/reorder` は「列 id・グループ・並び順」の配列を受け取り、
// 渡した列だけを更新する（`schedule-column.service.ts` の `reorderColumns`）。
// ここでは同じグループの列だけを並べ直して、その配列を作る。グループをまたぐ移動は
// 作らない（会場→支度のような移動は意味が変わるので、消して作り直す）。
import type { ScheduleColumn } from "@gmo-onair/shared/src/schedule/types";

export interface ReorderEntry { id: string; col_group: string; sort_order: number }

/** 同じグループの列を `sort_order` 順に並べたもの */
export function siblingsOf(columns: ScheduleColumn[], column: ScheduleColumn): ScheduleColumn[] {
  return columns
    .filter((c) => c.col_group === column.col_group)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "ja"));
}

/**
 * `column` を左（-1）か右（+1）へ 1 つ動かしたときの reorder 配列。
 * 端で動かせないときは null。
 */
export function moveColumn(columns: ScheduleColumn[], column: ScheduleColumn, direction: -1 | 1): ReorderEntry[] | null {
  const siblings = siblingsOf(columns, column);
  const index = siblings.findIndex((c) => c.id === column.id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return null;
  const next = [...siblings];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((c, i) => ({ id: c.id, col_group: c.col_group, sort_order: i }));
}
