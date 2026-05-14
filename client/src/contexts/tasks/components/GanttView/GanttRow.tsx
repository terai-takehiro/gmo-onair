import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { ProjectTask } from "@/types";

interface Props {
  task: ProjectTask;
  startDate: Date;
  dayWidth: number;
  rowHeight: number;
  rowIndex: number;
}

const BAR_PADDING = 4;

export default function GanttRow({
  task,
  startDate,
  dayWidth,
  rowHeight,
  rowIndex,
}: Props) {
  if (!task.start_date && !task.due_date) return null;

  const taskStart = task.start_date
    ? new Date(task.start_date)
    : new Date(task.due_date!);
  const taskEnd = task.due_date
    ? new Date(task.due_date)
    : new Date(task.start_date!);

  const startOffset = Math.max(
    0,
    Math.floor((taskStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const endOffset = Math.floor(
    (taskEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const x = startOffset * dayWidth;
  const width = Math.max((endOffset - startOffset + 1) * dayWidth, dayWidth);
  const y = rowIndex * rowHeight + BAR_PADDING;
  const barHeight = rowHeight - BAR_PADDING * 2;

  const isOverdue = task.due_date && !task.is_completed && taskEnd < new Date();
  const barColor = isOverdue
    ? "#f87171"
    : task.column_color ?? "#60a5fa";

  const label = width > 60 ? task.title : "";

  return (
    <g aria-label={`タスク: ${task.title}`}>
      {/* 背景ストライプ（完了タスク） */}
      {task.is_completed && (
        <rect
          x={x}
          y={y}
          width={width}
          height={barHeight}
          rx={4}
          fill={barColor}
          fillOpacity={0.3}
        />
      )}
      {/* メインバー */}
      {!task.is_completed && (
        <rect
          x={x}
          y={y}
          width={width}
          height={barHeight}
          rx={4}
          fill={barColor}
          fillOpacity={0.85}
        />
      )}
      {/* 完了時は取消線風の中央線 */}
      {task.is_completed && (
        <line
          x1={x + 2}
          y1={y + barHeight / 2}
          x2={x + width - 2}
          y2={y + barHeight / 2}
          stroke={barColor}
          strokeWidth={2}
          strokeOpacity={0.7}
        />
      )}
      {/* ラベル */}
      {label && (
        <text
          x={x + 6}
          y={y + barHeight / 2 + 4}
          fontSize={10}
          fill="white"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {label.length > 20 ? label.slice(0, 19) + "…" : label}
        </text>
      )}
      {/* ツールチップ用 title 要素 */}
      <title>
        {task.title}
        {task.start_date ? ` (${format(taskStart, "M/d", { locale: ja })}` : ""}
        {task.due_date ? ` 〜 ${format(taskEnd, "M/d", { locale: ja })})` : ")"}
        {task.assigned_to_name ? ` 担当: ${task.assigned_to_name}` : ""}
      </title>
    </g>
  );
}
