// PC のグリッド。縦軸=時刻・横軸=列（会場→支度→運営）。実装設計: 04-schedule-impl.md §5-3
//
// ⚠️ ドラッグ移動・リサイズは今回のスコープでは実装していない（クリックで選び、
// シートの時刻入力で編集する）。重なりの可視化（横に割る）は実装済み。
//
// 縦軸は「時間の区切りごとに表示」— 固定刻み（旧 `slot_min` の均等割り）ではなく、
// 項目の開始・終了時刻そのものを目盛りにする（`shared/src/schedule/timeline.ts`）。
// 何も予定が無い時間帯は短い帯に圧縮され、項目がある時間帯はほぼ実際の長さで描かれるので、
// 空白の多い日でも表全体の縦スクロールが無駄に伸びない（ユーザー指摘への対応）。
import { useMemo } from "react";
import { fmtHmPad } from "@gmo-onair/shared/src/schedule/time";
import { itemKindColor, COL_GROUP_LABEL, type ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import { buildTimeline } from "@gmo-onair/shared/src/schedule/timeline";
import type { Schedule, ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { assignLanes, countOverlaps } from "./scheduleLanes";
import { cn } from "@/lib/utils";

const TIME_COL_WIDTH = 64;
// クリックで新規作成するときの丸め単位（分）。区切りごと表示は連続値を返すため、
// キリのいい時刻を既定値にする（ダイアログ側でいつでも直せる）
const CLICK_SNAP_MIN = 5;

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
  const viewStart = schedule.view_start_min;
  const viewEnd = schedule.view_end_min;

  // 縦軸は列をまたいで1つ（表全体でどこかに項目があれば「項目がある区間」として広く取る）
  const timeline = useMemo(
    () => buildTimeline(items.map((it) => ({ start_min: it.start_min, end_min: it.end_min })), viewStart, viewEnd),
    [items, viewStart, viewEnd],
  );
  const gridHeight = timeline.totalHeightPx;
  const minToY = timeline.yOf;
  // 目盛り（区切り線・時刻ラベル）を出す位置 = 各区間の始点 + 表の最後の終点
  const ticks = useMemo(() => {
    if (timeline.segments.length === 0) return [] as number[];
    return [...timeline.segments.map((s) => s.startMin), timeline.segments[timeline.segments.length - 1].endMin];
  }, [timeline]);

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

  return (
    <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight: "calc(100vh - 260px)" }}>
      <div className="flex" style={{ width: TIME_COL_WIDTH + sorted.reduce((n, c) => n + c.width_px, 0) }}>
        {/* 時刻の列 */}
        <div className="sticky left-0 z-20 shrink-0 bg-background" style={{ width: TIME_COL_WIDTH }}>
          <div className="sticky top-0 z-30 h-[52px] border-b border-r border-border bg-muted/60" />
          <div className="relative border-r border-border" style={{ height: gridHeight }}>
            {ticks.map((min) => (
              <div
                key={min}
                className="absolute left-0 right-0 border-t border-border/60 px-1 text-[11px] text-muted-foreground"
                style={{ top: minToY(min) }}
              >
                {fmtHmPad(min)}
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
                        const min = Math.round(timeline.minOf(y) / CLICK_SNAP_MIN) * CLICK_SNAP_MIN;
                        onAddAt(col.id, min);
                      }}
                    >
                      {ticks.map((min) => (
                        <div key={min} className="absolute left-0 right-0 border-t border-border/40" style={{ top: minToY(min) }} />
                      ))}
                      {lanes.map(({ item, lane, laneCount }) => {
                        const top = minToY(item.start_min);
                        // 区間の最低高さ（timeline.ts の minBusyPx）で通常は下回らないが、
                        // 開始・終了が同じ（尺0）データが紛れ込んだときの保険として床を残す
                        const height = Math.max(20, minToY(item.end_min) - top);
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
