import { eachWeekOfInterval, format, eachMonthOfInterval } from "date-fns";
import { ja } from "date-fns/locale";

interface Props {
  startDate: Date;
  endDate: Date;
  dayWidth: number;
  rowHeight: number;
}

export default function GanttTimeline({ startDate, endDate, dayWidth, rowHeight }: Props) {
  const totalDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  const totalWidth = totalDays * dayWidth;

  const months = eachMonthOfInterval({ start: startDate, end: endDate });
  const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });

  const dayOffset = (d: Date) =>
    Math.floor((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const MONTH_ROW = rowHeight * 0.6;
  const WEEK_ROW = rowHeight * 0.4;
  const TOTAL_ROW = MONTH_ROW + WEEK_ROW;

  return (
    <svg
      width={totalWidth}
      height={TOTAL_ROW}
      className="overflow-visible"
      aria-hidden="true"
    >
      {/* 月ラベル */}
      {months.map((month) => {
        const x = dayOffset(month) * dayWidth;
        // 月の開始が範囲前の場合は 0 にクランプ
        const clampedX = Math.max(0, x);
        return (
          <g key={month.toISOString()}>
            <line
              x1={clampedX}
              y1={0}
              x2={clampedX}
              y2={MONTH_ROW}
              stroke="currentColor"
              strokeOpacity={0.2}
              strokeWidth={1}
            />
            <text
              x={clampedX + 4}
              y={MONTH_ROW - 4}
              fontSize={11}
              className="fill-muted-foreground"
            >
              {format(month, "yyyy年M月", { locale: ja })}
            </text>
          </g>
        );
      })}

      {/* 月行の下線 */}
      <line
        x1={0} y1={MONTH_ROW}
        x2={totalWidth} y2={MONTH_ROW}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1}
      />

      {/* 週ティック */}
      {weeks.map((week) => {
        const x = dayOffset(week) * dayWidth;
        if (x < 0) return null;
        return (
          <g key={week.toISOString()}>
            <line
              x1={x} y1={MONTH_ROW}
              x2={x} y2={TOTAL_ROW}
              stroke="currentColor"
              strokeOpacity={0.15}
              strokeWidth={1}
            />
            <text
              x={x + 2}
              y={TOTAL_ROW - 2}
              fontSize={9}
              className="fill-muted-foreground"
            >
              {format(week, "M/d")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
