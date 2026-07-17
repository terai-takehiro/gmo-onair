import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { ProjectTask } from "@/types";

export type DragMode = "move" | "resize-start" | "resize-end";

interface Props {
  task: ProjectTask;
  x: number;
  y: number;
  width: number;
  rowHeight: number;
  isDragging: boolean;
  onDragStart: (mode: DragMode, clientX: number) => void;
}

const BAR_PADDING = 4;
const HANDLE_W = 7;

export default function GanttRow({ task, x, y, width, rowHeight, isDragging, onDragStart }: Props) {
  const barY = y + BAR_PADDING;
  const barHeight = rowHeight - BAR_PADDING * 2;

  const taskStart = task.start_date ? new Date(task.start_date) : task.due_date ? new Date(task.due_date) : null;
  const taskEnd = task.due_date ? new Date(task.due_date) : task.start_date ? new Date(task.start_date) : null;

  const isOverdue = !!task.due_date && !task.is_completed && taskEnd! < new Date();
  const barColor = isOverdue ? "#f87171" : task.column_color ?? "#60a5fa";
  const label = width > 60 ? task.title : "";

  const start = (mode: DragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart(mode, e.clientX);
  };

  return (
    <g aria-label={`タスク: ${task.title}`} opacity={isDragging ? 0.85 : 1}>
      {/* メインバー (ドラッグで移動) */}
      <rect
        x={x}
        y={barY}
        width={width}
        height={barHeight}
        rx={4}
        fill={barColor}
        fillOpacity={task.is_completed ? 0.3 : 0.85}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={start("move")}
      />
      {/* 完了時は取消線 */}
      {task.is_completed && (
        <line x1={x + 2} y1={barY + barHeight / 2} x2={x + width - 2} y2={barY + barHeight / 2}
          stroke={barColor} strokeWidth={2} strokeOpacity={0.7} style={{ pointerEvents: "none" }} />
      )}
      {/* ラベル */}
      {label && (
        <text x={x + HANDLE_W + 4} y={barY + barHeight / 2 + 4} fontSize={10} fill="white"
          style={{ pointerEvents: "none", userSelect: "none" }}>
          {label.length > 20 ? label.slice(0, 19) + "…" : label}
        </text>
      )}
      {/* 左端リサイズハンドル (開始日) */}
      <rect
        x={x}
        y={barY}
        width={HANDLE_W}
        height={barHeight}
        rx={4}
        fill="#ffffff"
        fillOpacity={0.001}
        style={{ cursor: "ew-resize" }}
        onPointerDown={start("resize-start")}
      />
      {/* 右端リサイズハンドル (期限日) */}
      <rect
        x={x + width - HANDLE_W}
        y={barY}
        width={HANDLE_W}
        height={barHeight}
        rx={4}
        fill="#ffffff"
        fillOpacity={0.001}
        style={{ cursor: "ew-resize" }}
        onPointerDown={start("resize-end")}
      />
      <title>
        {task.title}
        {taskStart ? ` (${format(taskStart, "M/d", { locale: ja })}` : ""}
        {task.due_date ? ` 〜 ${format(taskEnd!, "M/d", { locale: ja })})` : taskStart ? ")" : ""}
        {task.assigned_to_name ? ` 担当: ${task.assigned_to_name}` : ""}
      </title>
    </g>
  );
}
