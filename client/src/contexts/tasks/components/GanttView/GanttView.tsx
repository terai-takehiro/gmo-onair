import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { addDays, subDays, format } from "date-fns";
import GanttTimeline from "./GanttTimeline";
import GanttRow, { type DragMode } from "./GanttRow";
import { useProjectTasks, useUpdateTask } from "../../hooks/useProjectTasks";
import type { ProjectTask } from "@/types";

const DAY_WIDTH = 24;
const ROW_HEIGHT = 36;
const LEFT_PANEL_WIDTH = 200;
const TIMELINE_HEIGHT = ROW_HEIGHT;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface Props {
  projectId: string;
  episodeId?: string | null;
}

interface DragState {
  taskId: string;
  mode: DragMode;
  startClientX: number;
  origStartOffset: number;
  origEndOffset: number;
  deltaDays: number;
}

const dayOffset = (date: Date, origin: Date) =>
  Math.floor((date.getTime() - origin.getTime()) / MS_PER_DAY);

export default function GanttView({ projectId, episodeId }: Props) {
  const { data: tasks = [] } = useProjectTasks(projectId, episodeId);
  const updateTask = useUpdateTask(projectId);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const startDateRef = useRef<Date>(new Date());

  const { scheduledTasks, unscheduledTasks, startDate, endDate } = useMemo(() => {
    const scheduled = tasks.filter((t) => t.start_date || t.due_date);
    const unscheduled = tasks.filter((t) => !t.start_date && !t.due_date);

    if (scheduled.length === 0) {
      const today = new Date();
      return {
        scheduledTasks: [],
        unscheduledTasks: unscheduled,
        startDate: subDays(today, 7),
        endDate: addDays(today, 30),
      };
    }

    const allDates: Date[] = [];
    for (const t of scheduled) {
      if (t.start_date) allDates.push(new Date(t.start_date));
      if (t.due_date) allDates.push(new Date(t.due_date));
    }

    const minDate = subDays(new Date(Math.min(...allDates.map((d) => d.getTime()))), 3);
    const maxDate = addDays(new Date(Math.max(...allDates.map((d) => d.getTime()))), 14);

    return { scheduledTasks: scheduled, unscheduledTasks: unscheduled, startDate: minDate, endDate: maxDate };
  }, [tasks]);

  startDateRef.current = startDate;

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
  const totalWidth = totalDays * DAY_WIDTH;
  const todayOffset = dayOffset(new Date(), startDate) * DAY_WIDTH;
  const svgHeight = scheduledTasks.length * ROW_HEIGHT;

  // ---- ドラッグ操作 (バー移動 / 端リサイズ) — window リスナーは一度だけ張り dragRef を参照 ----
  const persist = useCallback(
    (d: DragState) => {
      if (d.deltaDays === 0) return;
      const origin = startDateRef.current;
      let s = d.origStartOffset;
      let e = d.origEndOffset;
      if (d.mode === "move") { s += d.deltaDays; e += d.deltaDays; }
      else if (d.mode === "resize-start") { s = Math.min(d.origStartOffset + d.deltaDays, e); }
      else if (d.mode === "resize-end") { e = Math.max(d.origEndOffset + d.deltaDays, s); }
      const newStart = format(addDays(origin, s), "yyyy-MM-dd");
      const newEnd = format(addDays(origin, e), "yyyy-MM-dd");
      updateTask.mutate({ id: d.taskId, start_date: newStart, due_date: newEnd });
    },
    [updateTask]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      let deltaDays = Math.round((e.clientX - d.startClientX) / DAY_WIDTH);
      if (d.mode === "resize-start") deltaDays = Math.min(deltaDays, d.origEndOffset - d.origStartOffset);
      if (d.mode === "resize-end") deltaDays = Math.max(deltaDays, d.origStartOffset - d.origEndOffset);
      const next = { ...d, deltaDays };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d) persist(d);
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [persist]);

  const beginDrag = useCallback(
    (task: ProjectTask, mode: DragMode, clientX: number) => {
      const origin = startDateRef.current;
      const s = task.start_date ? new Date(task.start_date) : new Date(task.due_date!);
      const eDate = task.due_date ? new Date(task.due_date) : new Date(task.start_date!);
      const d: DragState = {
        taskId: task.id,
        mode,
        startClientX: clientX,
        origStartOffset: Math.max(0, dayOffset(s, origin)),
        origEndOffset: dayOffset(eDate, origin),
        deltaDays: 0,
      };
      dragRef.current = d;
      setDrag(d);
    },
    []
  );

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 py-16 text-center">
        <p className="text-muted-foreground text-sm">タスクがありません</p>
      </div>
    );
  }

  const barGeom = (task: ProjectTask, index: number) => {
    const s = task.start_date ? new Date(task.start_date) : new Date(task.due_date!);
    const eDate = task.due_date ? new Date(task.due_date) : new Date(task.start_date!);
    let startOffset = Math.max(0, dayOffset(s, startDate));
    let endOffset = dayOffset(eDate, startDate);
    if (drag && drag.taskId === task.id) {
      if (drag.mode === "move") { startOffset = drag.origStartOffset + drag.deltaDays; endOffset = drag.origEndOffset + drag.deltaDays; }
      else if (drag.mode === "resize-start") startOffset = drag.origStartOffset + drag.deltaDays;
      else if (drag.mode === "resize-end") endOffset = drag.origEndOffset + drag.deltaDays;
    }
    return {
      x: startOffset * DAY_WIDTH,
      width: Math.max((endOffset - startOffset + 1) * DAY_WIDTH, DAY_WIDTH),
      y: index * ROW_HEIGHT,
    };
  };

  return (
    <div className="flex flex-col h-full" style={drag ? { userSelect: "none" } : undefined}>
      <div className="flex items-center gap-2 px-1 pb-2 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">ドラッグで移動 · 端をドラッグで期間変更</span>
      </div>
      {/* ヘッダー行（左パネル + タイムライン） */}
      <div className="flex border-b border-border bg-background sticky top-0 z-20">
        <div
          className="shrink-0 flex items-end px-3 pb-1 text-xs font-medium text-muted-foreground border-r border-border"
          style={{ width: LEFT_PANEL_WIDTH }}
        >
          タスク名
        </div>
        <div className="overflow-hidden flex-1">
          <div className="overflow-x-auto" style={{ scrollbarGutter: "stable" }}>
            <GanttTimeline startDate={startDate} endDate={endDate} dayWidth={DAY_WIDTH} rowHeight={TIMELINE_HEIGHT} />
          </div>
        </div>
      </div>

      {/* スクロール可能なボディ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左パネル（タスク名） */}
        <div className="shrink-0 border-r border-border overflow-y-auto" style={{ width: LEFT_PANEL_WIDTH }}>
          {scheduledTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center px-3 border-b border-border/50 text-xs truncate"
              style={{ height: ROW_HEIGHT }}
              title={task.title}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-2 shrink-0"
                style={{ backgroundColor: task.column_color ?? "#94a3b8" }}
                aria-hidden="true"
              />
              <span className={task.is_completed ? "line-through text-muted-foreground" : ""}>{task.title}</span>
            </div>
          ))}
        </div>

        {/* ガントチャート本体 */}
        <div className="flex-1 overflow-auto">
          <svg width={totalWidth} height={Math.max(svgHeight, ROW_HEIGHT)} aria-label="ガントチャート">
            {scheduledTasks.map((_, i) => (
              <rect key={i} x={0} y={i * ROW_HEIGHT} width={totalWidth} height={ROW_HEIGHT}
                fill={i % 2 === 0 ? "transparent" : "currentColor"} fillOpacity={i % 2 === 0 ? 0 : 0.02} />
            ))}
            {scheduledTasks.map((_, i) => (
              <line key={`h-${i}`} x1={0} y1={(i + 1) * ROW_HEIGHT} x2={totalWidth} y2={(i + 1) * ROW_HEIGHT}
                stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
            ))}
            {scheduledTasks.map((task, i) => {
              const g = barGeom(task, i);
              return (
                <GanttRow
                  key={task.id}
                  task={task}
                  x={g.x}
                  y={g.y}
                  width={g.width}
                  rowHeight={ROW_HEIGHT}
                  isDragging={drag?.taskId === task.id}
                  onDragStart={(mode, clientX) => beginDrag(task, mode, clientX)}
                />
              );
            })}
            {todayOffset >= 0 && todayOffset <= totalWidth && (
              <g>
                <line x1={todayOffset} y1={0} x2={todayOffset} y2={Math.max(svgHeight, ROW_HEIGHT)}
                  stroke="#f87171" strokeWidth={1.5} strokeDasharray="4,3" />
                <text x={todayOffset + 3} y={12} fontSize={9} fill="#f87171">今日</text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* 未スケジュールタスク */}
      {unscheduledTasks.length > 0 && (
        <div className="border-t border-border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">未スケジュール ({unscheduledTasks.length}件)</p>
          <div className="flex flex-wrap gap-2">
            {unscheduledTasks.map((task) => (
              <span key={task.id}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border border-border ${task.is_completed ? "opacity-50 line-through" : ""}`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.column_color ?? "#94a3b8" }} />
                {task.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
