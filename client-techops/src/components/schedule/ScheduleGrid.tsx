// PC のグリッド。縦軸=時刻・横軸=列（会場→支度→運営）。実装設計: 04-schedule-impl.md §5-3
//
// ⚠️ ドラッグ移動・リサイズは今回のスコープでは実装していない（クリックで選び、
// シートの時刻入力で編集する）。重なりの可視化（横に割る）は実装済み。
import { useMemo } from "react";
import { fmtHmPad } from "@gmo-onair/shared/src/schedule/time";
import { itemKindColor, COL_GROUP_LABEL, type ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import type { Schedule, ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { assignLanes, countOverlaps } from "./scheduleLanes";
import { cn } from "@/lib/utils";

const TIME_COL_WIDTH = 64;
const ROW_HEIGHT = 22; // px / slot

const GROUP_ORDER: ColGroup[] = ["venue", "prep", "ops"];

interface Props {
  schedule: Schedule;
  columns: ScheduleColumn[];
  items: ScheduleItem[];
  conflictedIds: Set<string>;
  onSelect: (item: ScheduleItem) => void;
  onAddAt: (columnId: string, startMin: number) => void;
}

export default function ScheduleGrid({ schedule, columns, items, conflictedIds, onSelect, onAddAt }: Props) {
  const slotMin = schedule.slot_min;
  const viewStart = schedule.view_start_min;
  const viewEnd = schedule.view_end_min;
  const rowCount = Math.max(1, Math.ceil((viewEnd - viewStart) / slotMin));
  const gridHeight = rowCount * ROW_HEIGHT;

  const sorted = useMemo(
    () => [...columns].sort((a, b) => GROUP_ORDER.indexOf(a.col_group) - GROUP_ORDER.indexOf(b.col_group) || a.sort_order - b.sort_order),
    [columns],
  );
  const itemsByColumn = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      if (!m.has(item.column_id)) m.set(item.column_id, []);
      m.get(item.column_id)!.push(item);
    }
    return m;
  }, [items]);

  const minToY = (min: number) => ((Math.max(viewStart, Math.min(viewEnd, min)) - viewStart) / slotMin) * ROW_HEIGHT;

  return (
    <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight: "calc(100vh - 260px)" }}>
      <div className="flex" style={{ width: TIME_COL_WIDTH + sorted.reduce((n, c) => n + c.width_px, 0) }}>
        {/* 時刻の列 */}
        <div className="sticky left-0 z-20 shrink-0 bg-background" style={{ width: TIME_COL_WIDTH }}>
          <div className="sticky top-0 z-30 h-[52px] border-b border-r border-border bg-muted/60" />
          <div className="relative border-r border-border" style={{ height: gridHeight }}>
            {Array.from({ length: rowCount }).map((_, r) => (
              <div
                key={r}
                className="absolute left-0 right-0 border-t border-border/60 px-1 text-[11px] text-muted-foreground"
                style={{ top: r * ROW_HEIGHT }}
              >
                {fmtHmPad(viewStart + r * slotMin)}
              </div>
            ))}
          </div>
        </div>

        {/* 列グループ */}
        {GROUP_ORDER.map((group) => {
          const inGroup = sorted.filter((c) => c.col_group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={group} className="flex shrink-0">
              {inGroup.map((col) => {
                const colItems = itemsByColumn.get(col.id) ?? [];
                const lanes = assignLanes(colItems);
                const overlapCount = countOverlaps(colItems);
                return (
                  <div key={col.id} className="shrink-0 border-r border-border" style={{ width: col.width_px }}>
                    <div className="sticky top-0 z-10 h-[52px] border-b border-border bg-muted/60 px-2 py-1">
                      <div className="truncate text-[11px] font-medium text-muted-foreground">{COL_GROUP_LABEL[group]}</div>
                      <div className="truncate text-sm font-semibold text-foreground">{col.room_name || col.label}</div>
                      {overlapCount > 0 && (
                        <div className="text-[11px] text-destructive">重なり {overlapCount}件</div>
                      )}
                    </div>
                    <div
                      className="relative cursor-pointer"
                      style={{ height: gridHeight }}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const min = viewStart + Math.round(y / ROW_HEIGHT) * slotMin;
                        onAddAt(col.id, min);
                      }}
                    >
                      {Array.from({ length: rowCount }).map((_, r) => (
                        <div key={r} className="absolute left-0 right-0 border-t border-border/40" style={{ top: r * ROW_HEIGHT }} />
                      ))}
                      {lanes.map(({ item, lane, laneCount }) => {
                        const top = minToY(item.start_min);
                        const height = Math.max(ROW_HEIGHT - 2, minToY(item.end_min) - top);
                        const laneWidthPct = 100 / laneCount;
                        const conflicted = conflictedIds.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onSelect(item); }}
                            className={cn(
                              "absolute overflow-hidden rounded border px-1 text-left text-[11px] leading-tight shadow-sm",
                              conflicted ? "border-destructive ring-1 ring-destructive" : "border-black/10",
                            )}
                            style={{
                              top, height,
                              left: `${lane * laneWidthPct}%`,
                              width: `calc(${laneWidthPct}% - 2px)`,
                              backgroundColor: `#${itemKindColor(item.kind)}`,
                            }}
                            title={item.title}
                          >
                            <span className="font-medium">{item.title || "（無題）"}</span>
                            {item.link_broken && <span className="ml-1 text-destructive">⚠</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
