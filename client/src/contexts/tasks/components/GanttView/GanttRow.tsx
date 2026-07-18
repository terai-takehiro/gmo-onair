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

  const start = (mode: DragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart(mode, e.clientX);
  };

  const titleEl = (
    <title>
      {task.title}
      {taskStart ? ` (${format(taskStart, "M/d", { locale: ja })}` : ""}
      {task.due_date ? ` 〜 ${format(taskEnd!, "M/d", { locale: ja })})` : taskStart ? ")" : ""}
      {task.assigned_to_name ? ` 担当: ${task.assigned_to_name}` : ""}
      {typeof task.progress === "number" && task.progress > 0 ? ` 進捗 ${task.progress}%` : ""}
    </title>
  );

  // ---- マイルストーン: ◆ ダイヤ (単一点・移動のみ) ----
  if (task.is_milestone) {
    const cx = x + width / 2;
    const cy = barY + barHeight / 2;
    const r = barHeight / 2;
    const mColor = "#f59e0b";
    return (
      <g aria-label={`マイルストーン: ${task.title}`} opacity={isDragging ? 0.85 : 1}>
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill={mColor}
          fillOpacity={task.is_completed ? 0.4 : 0.95}
          stroke="#b45309"
          strokeWidth={1}
          style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={start("move")}
        />
        <text x={cx + r + 4} y={cy + 4} fontSize={10} fill="currentColor" fillOpacity={0.75}
          style={{ pointerEvents: "none", userSelect: "none" }}>
          {task.title.length > 16 ? task.title.slice(0, 15) + "…" : task.title}
        </text>
        {titleEl}
      </g>
    );
  }

  // ---- 通常バー (トラック + 進捗フィル) ----
  const progress = task.is_completed ? 100 : Math.max(0, Math.min(100, task.progress ?? 0));
  const fillW = (width * progress) / 100;
  const label = width > 60 ? task.title : "";

  return (
    <g aria-label={`タスク: ${task.title}`} opacity={isDragging ? 0.85 : 1}>
      {/* トラック (全期間) */}
      <rect
        x={x}
        y={barY}
        width={width}
        height={barHeight}
        rx={4}
        fill={barColor}
        fillOpacity={0.28}
        style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={start("move")}
      />
      {/* 進捗フィル */}
      {fillW > 0 && (
        <rect x={x} y={barY} width={fillW} height={barHeight} rx={4}
          fill={barColor} fillOpacity={0.9} style={{ pointerEvents: "none" }} />
      )}
      {/* 完了時の取消線 */}
      {task.is_completed && (
        <line x1={x + 2} y1={barY + barHeight / 2} x2={x + width - 2} y2={barY + barHeight / 2}
          stroke="#ffffff" strokeWidth={1.5} strokeOpacity={0.7} style={{ pointerEvents: "none" }} />
      )}
      {/* ラベル */}
      {label && (
        <text x={x + HANDLE_W + 4} y={barY + barHeight / 2 + 4} fontSize={10} fill="white"
          style={{ pointerEvents: "none", userSelect: "none" }}>
          {label.length > 20 ? label.slice(0, 19) + "…" : label}
        </text>
      )}
      {/* 左端リサイズ (開始日) */}
      <rect x={x} y={barY} width={HANDLE_W} height={barHeight} rx={4} fill="#ffffff" fillOpacity={0.001}
        style={{ cursor: "ew-resize", touchAction: "none" }} onPointerDown={start("resize-start")} />
      {/* 右端リサイズ (期限日) */}
      <rect x={x + width - HANDLE_W} y={barY} width={HANDLE_W} height={barHeight} rx={4} fill="#ffffff" fillOpacity={0.001}
        style={{ cursor: "ew-resize", touchAction: "none" }} onPointerDown={start("resize-end")} />
      {titleEl}
    </g>
  );
}
