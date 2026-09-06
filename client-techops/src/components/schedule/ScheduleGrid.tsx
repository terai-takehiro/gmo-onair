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
import { Pencil, Plus } from "lucide-react";
import { fmtHmPad } from "@gmo-onair/shared/src/schedule/time";
import { itemKindColor, COL_GROUP_LABEL, type ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import { buildTimeline } from "@gmo-onair/shared/src/schedule/timeline";
import type { Schedule, ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { assignLanes, countOverlaps } from "./scheduleLanes";
import { cssColor } from "./columnColors";
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
  /** 列見出しの鉛筆から。無ければ鉛筆を出さない（閲覧だけの画面） */
  onEditColumn?: (column: ScheduleColumn) => void;
  /** 右端の「＋ 列」から。無ければ出さない */
  onAddColumn?: (group: ColGroup) => void;
}

// 右端の「＋ 列」の幅
const ADD_COL_WIDTH = 72;

export default function ScheduleGrid({ schedule, columns, items, conflictedIds, onSelect, onAddAt, onEditColumn, onAddColumn }: Props) {
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
      <div className="flex" style={{ width: TIME_COL_WIDTH + sorted.reduce((n, c) => n + c.width_px, 0) + (onAddColumn ? ADD_COL_WIDTH : 0) }}>
        {/* 時刻の列 */}
        <div className="sticky left-0 z-20 shrink-0 bg-background" style={{ width: TIME_COL_WIDTH }}>
          <div className="sticky top-0 z-30 h-[60px] border-b border-r border-border bg-muted/60" />
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
                const colColor = cssColor(col.color);
                return (
                  <div key={col.id} className="shrink-0 border-r border-border" style={{ width: col.width_px }}>
                    <div className="group sticky top-0 z-10 h-[60px] border-b border-border bg-muted/60 px-2 py-1">
                      {/* 1 行目: グループ名＋鉛筆（名前の行を狭めないよう、余白のあるこの行に置く） */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-medium text-muted-foreground">{COL_GROUP_LABEL[group]}</span>
                        {onEditColumn && (
                          // PC のグリッドだけに出る（375px は縦積みカードで、列は表の設定から直す）。
                          // hover/focus で見せるが、キーボードでも辿れるよう DOM には常に置く
                          <button
                            type="button"
                            onClick={() => onEditColumn(col)}
                            aria-label={`列「${col.room_name || col.label}」を直す`}
                            className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {/* 名前は 2 行まで折り返す（160px の列に「LOUNGE STUDIO」が入り切らず「LOUNGE STU…」になっていた） */}
                      <div className="flex min-w-0 items-start gap-1.5">
                        {colColor && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colColor }} aria-hidden="true" />}
                        <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold leading-tight text-foreground" title={col.room_name || col.label}>{col.room_name || col.label}</span>
                        {overlapCount > 0 && (
                          <span className="shrink-0 text-[11px] text-destructive">重なり {overlapCount}件</span>
                        )}
                      </div>
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
                              // 列の色は項目の左罫に。区分の色（背景）と混ざらない
                              borderLeft: colColor ? `3px solid ${colColor}` : undefined,
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

        {/* 右端の「＋ 列」。列 0 本のときはこの表自体を出さない（空状態の 3 択が出る） */}
        {onAddColumn && (
          <div className="shrink-0" style={{ width: ADD_COL_WIDTH }}>
            <div className="sticky top-0 z-10 flex h-[60px] items-center justify-center border-b border-border bg-muted/60">
              <button
                type="button"
                onClick={() => onAddColumn(sorted[sorted.length - 1]?.col_group ?? "venue")}
                aria-label="列を足す"
                title="列を足す"
                className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div style={{ height: gridHeight }} />
          </div>
        )}
      </div>
    </div>
  );
}
