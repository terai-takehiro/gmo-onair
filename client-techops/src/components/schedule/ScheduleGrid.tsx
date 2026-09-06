// PC のグリッド。縦軸=時刻・横軸=列（会場→支度→運営）。実装設計: 04-schedule-impl.md §5-3
//
// ドラッグ移動＋下端リサイズ（PC 専用・5分スナップ）: 14-schedule-v2-plan.md §3 B1・§4-3。
// ポインタ追跡・分への換算は `useScheduleItemDrag.ts` に閉じ込め、ここは
// 「ドラッグ中の項目の表示座標を上書きして通常の描画パスに乗せる」だけを担う
// （重なりレーン割り当て `assignLanes` は毎レンダー items から作り直しているので、
// 上書き後の座標を渡すだけで重なりの再配置も自然に付いてくる）。
//
// 縦軸は「時間の区切りごとに表示」— 固定刻み（旧 `slot_min` の均等割り）ではなく、
// 項目の開始・終了時刻そのものを目盛りにする（`shared/src/schedule/timeline.ts`）。
// 何も予定が無い時間帯は短い帯に圧縮され、項目がある時間帯はほぼ実際の長さで描かれるので、
// 空白の多い日でも表全体の縦スクロールが無駄に伸びない（ユーザー指摘への対応）。
//
// ⚠️ タイムライン自体（縦軸の区切り・高さ）はドラッグ中も items（サーバーの値）から
// 作ったまま変えない。ドラッグ中の項目の位置で毎回作り直すと、区切りが自分自身の
// 動きで揺れ動き、ポインタ→分の変換が自己参照でぶれる（縦軸は動かない定規のままにする）。
import { useEffect, useMemo, useRef } from "react";
import { Pencil, Plus } from "lucide-react";
import { fmtHmPad } from "@gmo-onair/shared/src/schedule/time";
import { itemKindColor, COL_GROUP_LABEL, type ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import { buildTimeline } from "@gmo-onair/shared/src/schedule/timeline";
import type { Schedule, ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { assignLanes, countOverlaps } from "./scheduleLanes";
import { cssColor } from "./columnColors";
import useScheduleItemDrag from "./useScheduleItemDrag";
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
  /**
   * ドラッグ移動・下端リサイズが確定したときに呼ぶ（§3 B1）。無ければドラッグそのものを
   * 始めない（クリックで選ぶ従来動作のみになる）。保存の成否・409 の扱いは呼び出し側
   * （`SchedulePage.tsx` の `useItemCommitQueue`）に任せる — ここは「動いた」ことだけを伝える
   */
  onCommitDrag?: (item: ScheduleItem, patch: { column_id: string; start_min: number; end_min: number }) => void;
  /** ドラッグ／リサイズの開始・終了を親に伝える（ポーリング停止用・§4-3） */
  onDragStateChange?: (dragging: boolean) => void;
}

// 右端の「＋ 列」の幅
const ADD_COL_WIDTH = 72;
// 下端リサイズのつまみの高さ。押せるボタンではない（onClick を持たない）ので
// 44px のタップ領域規則の対象外（`scripts/check-ui-tokens.mjs` の tap-target の但し書き）
const RESIZE_HANDLE_PX = 8;

export default function ScheduleGrid({
  schedule, columns, items, conflictedIds, onSelect, onAddAt, onEditColumn, onAddColumn, onCommitDrag, onDragStateChange,
}: Props) {
  const viewStart = schedule.view_start_min;
  const viewEnd = schedule.view_end_min;

  // 縦軸は列をまたいで1つ（表全体でどこかに項目があれば「項目がある区間」として広く取る）。
  // items（サーバーから来た値）で作る — ドラッグ中の座標では作り直さない（ファイル冒頭の注記）
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

  // 時刻ルーラー（時刻の列の本体）を Y=0 の基準にする。全列がここと同じ縦位置を共有する
  const rulerRef = useRef<HTMLDivElement>(null);
  // ドラッグ中、ポインタの下にある列 id を探す（列をまたぐ移動用・§3 B1）
  const columnIdAt = (clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY);
    return el?.closest("[data-schedule-column-id]")?.getAttribute("data-schedule-column-id") ?? null;
  };
  const { draggingItemId, overrideOf, startMove, startResize, consumeClickSuppression } = useScheduleItemDrag({
    minOf: timeline.minOf,
    originRef: rulerRef,
    columnAt: columnIdAt,
    onCommit: (item, patch) => onCommitDrag?.(item, patch),
  });
  // 親（SchedulePage）へドラッグ中かどうかを伝える。ポーリング停止に使う（§4-3）。
  // レンダー中に呼ぶと親の setState が「レンダー中に別コンポーネントを更新した」警告になるため
  // 必ず useEffect（コミット後）で呼ぶ。コールバックの参照は ref で最新に保つ
  const dragging = !!draggingItemId;
  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  useEffect(() => { onDragStateChangeRef.current?.(dragging); }, [dragging]);

  // 描画用の項目一覧。ドラッグ中の1件だけ、確定前の座標で上書きする —
  // レーン割り当て（重なりの横並び）はこの一覧から毎回作り直すので、ここを差し替えるだけで
  // ドラッグ中の重なり表示もついてくる（14-schedule-v2-plan.md §4-6 のとおり）
  const dragOverride = draggingItemId ? overrideOf(draggingItemId) : null;
  const displayItems = useMemo(() => {
    if (!draggingItemId || !dragOverride) return items;
    return items.map((it) => (it.id === draggingItemId
      ? { ...it, column_id: dragOverride.columnId, start_min: dragOverride.startMin, end_min: dragOverride.endMin }
      : it));
  }, [items, draggingItemId, dragOverride]);

  const itemsByColumn = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const item of displayItems) {
      if (!m.has(item.column_id)) m.set(item.column_id, []);
      m.get(item.column_id)!.push(item);
    }
    return m;
  }, [displayItems]);

  return (
    // `schedule-grid-scroll` は印刷 CSS（14-schedule-v2-plan.md §3 B7・index.css）が
    // maxHeight（インラインスタイル）と overflow-auto を上書きする先。クラス名だけでは
    // インラインスタイルに勝てないため、印刷側は `!important` で明示的に上書きする
    <div className="schedule-grid-scroll overflow-auto rounded-lg border border-border" style={{ maxHeight: "calc(100vh - 260px)" }}>
      <div className="flex" style={{ width: TIME_COL_WIDTH + sorted.reduce((n, c) => n + c.width_px, 0) + (onAddColumn ? ADD_COL_WIDTH : 0) }}>
        {/* 時刻の列 */}
        <div className="sticky left-0 z-20 shrink-0 bg-background" style={{ width: TIME_COL_WIDTH }}>
          <div className="sticky top-0 z-30 h-[60px] border-b border-r border-border bg-muted/60" />
          <div ref={rulerRef} className="relative border-r border-border" style={{ height: gridHeight }}>
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
                            aria-label={`列「${col.room_name || col.label}」を編集`}
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
                      data-schedule-column-id={col.id}
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
                        const isDraggingThis = draggingItemId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onPointerDown={onCommitDrag ? (e) => startMove(item, e) : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (consumeClickSuppression(item.id)) return; // 直前のドラッグ確定によるクリック（§4-3）
                              onSelect(item);
                            }}
                            className={cn(
                              "absolute overflow-hidden rounded border px-1 text-left text-[11px] leading-tight shadow-sm",
                              conflicted ? "border-destructive ring-1 ring-destructive" : "border-black/10",
                              onCommitDrag && "cursor-grab touch-none",
                              isDraggingThis && "z-20 cursor-grabbing opacity-90 shadow-md",
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
                            {/* 下端リサイズのつまみ（PC のみ・§3 B1）。onClick を持たないので
                                44px のタップ領域規則の対象外（scripts/check-ui-tokens.mjs） */}
                            {onCommitDrag && (
                              <div
                                onPointerDown={(e) => { e.stopPropagation(); startResize(item, e); }}
                                className="absolute inset-x-0 bottom-0 cursor-ns-resize touch-none"
                                style={{ height: RESIZE_HANDLE_PX }}
                                aria-hidden="true"
                              />
                            )}
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

        {/* 右端の「＋ 列」。列 0 本のときはこの表自体を出さない（空状態の 3 択が出る）。
            印刷では要らない操作なので隠す（B7・14-schedule-v2-plan.md §3 B7） */}
        {onAddColumn && (
          <div className="shrink-0 print:hidden" style={{ width: ADD_COL_WIDTH }}>
            <div className="sticky top-0 z-10 flex h-[60px] items-center justify-center border-b border-border bg-muted/60">
              <button
                type="button"
                onClick={() => onAddColumn(sorted[sorted.length - 1]?.col_group ?? "venue")}
                aria-label="列を追加"
                title="列を追加"
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
