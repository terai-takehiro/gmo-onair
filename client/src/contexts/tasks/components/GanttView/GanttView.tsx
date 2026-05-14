import { useMemo, useRef } from "react";
import { addDays, subDays } from "date-fns";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import GanttTimeline from "./GanttTimeline";
import GanttRow from "./GanttRow";
import { useProjectTasks } from "../../hooks/useProjectTasks";
import type { ProjectTask } from "@/types";

const DAY_WIDTH = 24;
const ROW_HEIGHT = 36;
const LEFT_PANEL_WIDTH = 200;
const TIMELINE_HEIGHT = ROW_HEIGHT;

interface Props {
  projectId: string;
  episodeId?: string | null;
}

export default function GanttView({ projectId, episodeId }: Props) {
  const { data: tasks = [] } = useProjectTasks(projectId, episodeId);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    const maxDate = addDays(new Date(Math.max(...allDates.map((d) => d.getTime()))), 3);

    return {
      scheduledTasks: scheduled,
      unscheduledTasks: unscheduled,
      startDate: minDate,
      endDate: maxDate,
    };
  }, [tasks]);

  const totalDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  const totalWidth = totalDays * DAY_WIDTH;

  const todayOffset =
    Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) *
    DAY_WIDTH;

  const svgHeight = scheduledTasks.length * ROW_HEIGHT;

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 py-16 text-center">
        <p className="text-muted-foreground text-sm">タスクがありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー行（左パネル + タイムライン） */}
      <div className="flex border-b border-border bg-background sticky top-0 z-20">
        <div
          className="shrink-0 flex items-end px-3 pb-1 text-xs font-medium text-muted-foreground border-r border-border"
          style={{ width: LEFT_PANEL_WIDTH }}
        >
          タスク名
        </div>
        <div className="overflow-hidden flex-1">
          <div
            ref={scrollRef}
            className="overflow-x-auto"
            style={{ scrollbarGutter: "stable" }}
          >
            <GanttTimeline
              startDate={startDate}
              endDate={endDate}
              dayWidth={DAY_WIDTH}
              rowHeight={TIMELINE_HEIGHT}
            />
          </div>
        </div>
      </div>

      {/* スクロール可能なボディ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左パネル（タスク名） */}
        <div
          className="shrink-0 border-r border-border overflow-y-auto"
          style={{ width: LEFT_PANEL_WIDTH }}
        >
          {scheduledTasks.map((task, i) => (
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
              <span className={task.is_completed ? "line-through text-muted-foreground" : ""}>
                {task.title}
              </span>
            </div>
          ))}
        </div>

        {/* ガントチャート本体 */}
        <div className="flex-1 overflow-auto">
          <svg
            width={totalWidth}
            height={Math.max(svgHeight, ROW_HEIGHT)}
            aria-label="ガントチャート"
          >
            {/* 行背景（交互） */}
            {scheduledTasks.map((_, i) => (
              <rect
                key={i}
                x={0}
                y={i * ROW_HEIGHT}
                width={totalWidth}
                height={ROW_HEIGHT}
                fill={i % 2 === 0 ? "transparent" : "currentColor"}
                fillOpacity={i % 2 === 0 ? 0 : 0.02}
              />
            ))}

            {/* 水平グリッド線 */}
            {scheduledTasks.map((_, i) => (
              <line
                key={`h-${i}`}
                x1={0}
                y1={(i + 1) * ROW_HEIGHT}
                x2={totalWidth}
                y2={(i + 1) * ROW_HEIGHT}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
            ))}

            {/* タスクバー */}
            {scheduledTasks.map((task, i) => (
              <GanttRow
                key={task.id}
                task={task}
                startDate={startDate}
                dayWidth={DAY_WIDTH}
                rowHeight={ROW_HEIGHT}
                rowIndex={i}
              />
            ))}

            {/* 今日の縦線 */}
            {todayOffset >= 0 && todayOffset <= totalWidth && (
              <g>
                <line
                  x1={todayOffset}
                  y1={0}
                  x2={todayOffset}
                  y2={Math.max(svgHeight, ROW_HEIGHT)}
                  stroke="#f87171"
                  strokeWidth={1.5}
                  strokeDasharray="4,3"
                />
                <text
                  x={todayOffset + 3}
                  y={12}
                  fontSize={9}
                  fill="#f87171"
                >
                  今日
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* 未スケジュールタスク */}
      {unscheduledTasks.length > 0 && (
        <div className="border-t border-border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            未スケジュール ({unscheduledTasks.length}件)
          </p>
          <div className="flex flex-wrap gap-2">
            {unscheduledTasks.map((task) => (
              <span
                key={task.id}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border border-border ${
                  task.is_completed ? "opacity-50 line-through" : ""
                }`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: task.column_color ?? "#94a3b8" }}
                />
                {task.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
