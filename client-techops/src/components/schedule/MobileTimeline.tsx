// 375px の畳み方: 時系列の縦積みカード（表は作らない）。実装設計: 04-schedule-impl.md §5-4
import { useMemo } from "react";
import { fmtHmPad, fmtSpan } from "@gmo-onair/shared/src/schedule/time";
import { itemKindLabel, itemKindColor } from "@gmo-onair/shared/src/schedule/kinds";
import { isSpanItem, spanLabel } from "@gmo-onair/shared/src/schedule/span";
import type { ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";

interface Props {
  columns: ScheduleColumn[];
  items: ScheduleItem[];
  conflictedIds: Set<string>;
  onSelect: (item: ScheduleItem) => void;
  /**
   * 絞り込み中の列。**親（`SchedulePage.tsx`）に持ち上げてある**（14-schedule-v2-plan.md §3 A6）。
   * 「項目を追加」ボタンは PageHeader の主ボタンで、この画面のさらに外（見出し）にあるため、
   * ここだけの state だと「いま絞り込んでいる列」を追加の既定列に使えなかった
   * （以前は常に先頭の列に追加していた）。
   */
  filterColumnId: string | null;
  onFilterChange: (columnId: string | null) => void;
}

export default function MobileTimeline({ columns, items, conflictedIds, onSelect, filterColumnId, onFilterChange }: Props) {
  const visible = useMemo(
    () => [...items]
      // 横串（列をまたぐ項目）は、どの列で絞り込んでいても出す（その列にも掛かっているため）
      .filter((i) => !filterColumnId || i.column_id === filterColumnId || isSpanItem(i.span_cols))
      .sort((a, b) => a.start_min - b.start_min),
    [items, filterColumnId],
  );
  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  return (
    <div>
      {/* 列（会場／支度／運営）を横スクロールするチップで絞り込む */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        <button
          type="button"
          onClick={() => onFilterChange(null)}
          className={cn(
            "shrink-0 min-h-tap rounded-chip border px-3 text-sub",
            !filterColumnId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
          )}
        >
          すべて
        </button>
        {columns.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onFilterChange(c.id)}
            className={cn(
              "shrink-0 min-h-tap rounded-chip border px-3 text-sub",
              filterColumnId === c.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
          >
            {c.room_name || c.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={filterColumnId ? "この列にはまだ項目がありません" : "まだ項目がありません"}
            description={filterColumnId ? "「すべて」に戻すか、下のボタンから項目を追加してください。" : "グリッド／下のボタンから項目を追加できます。"}
          />
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {visible.map((item) => {
          const col = columnById.get(item.column_id);
          const conflicted = conflictedIds.has(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={cn(
                  "flex w-full min-h-tap items-stretch gap-3 rounded-card border bg-card p-3 text-left",
                  conflicted ? "border-destructive" : "border-border",
                )}
              >
                <div className="flex w-14 shrink-0 flex-col items-start justify-center">
                  <span className="text-cardtitle tabular-nums text-foreground">{fmtHmPad(item.start_min)}</span>
                  <span className="text-sub-sm text-muted-foreground">{fmtSpan(item.end_min - item.start_min)}</span>
                </div>
                <div
                  className="w-1 shrink-0 rounded-chip"
                  style={{ backgroundColor: `#${itemKindColor(item.kind)}` }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-list text-foreground">{item.title || "（無題）"}</span>
                    {item.link_broken && (
                      <span className="shrink-0 rounded-badge bg-destructive/10 px-1.5 py-0.5 text-badge text-destructive">台本が見つかりません</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sub-sm text-muted-foreground">
                    {itemKindLabel(item.kind)} ・ {/* 横串（列をまたぐ項目）は列名の代わりにまたぐ範囲を出す */}
                    {isSpanItem(item.span_cols)
                      ? `横串（${spanLabel(item.span_cols)}）`
                      : (col?.room_name || col?.label || "―")}
                    {item.assignee ? ` ・ ${item.assignee}` : ""}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
