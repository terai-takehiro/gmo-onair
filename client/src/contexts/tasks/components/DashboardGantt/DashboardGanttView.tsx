import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { DashboardProject, DashboardTask, TaskColumn } from "@/types";

interface Props {
  projects: DashboardProject[];
  columns: TaskColumn[];
  tasks: DashboardTask[];
}

const LEFT_W = 220;
const DAY_W = 24;
const GROUP_H = 28;
const ROW_H = 36;
const HEADER_H = 40;
const BAR_H = 20;
const PAD_DAYS = 3;

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtMonth(d: Date) {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function barColor(col: TaskColumn | undefined): string {
  return col?.color ?? "#94a3b8";
}

export default function DashboardGanttView({ projects, columns, tasks }: Props) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scheduledTasks = useMemo(
    () => tasks.filter((t) => t.start_date || t.due_date),
    [tasks]
  );

  const { minDate, maxDate } = useMemo(() => {
    if (scheduledTasks.length === 0) {
      const today = new Date();
      return { minDate: addDays(today, -7), maxDate: addDays(today, 30) };
    }
    let min = new Date(9999, 0, 1);
    let max = new Date(0);
    for (const t of scheduledTasks) {
      const s = parseDate(t.start_date);
      const e = parseDate(t.due_date);
      if (s && s < min) min = s;
      if (e && e > max) max = e;
      if (s && s > max) max = s;
    }
    return { minDate: addDays(min, -PAD_DAYS), maxDate: addDays(max, PAD_DAYS) };
  }, [scheduledTasks]);

  const totalDays = diffDays(minDate, maxDate) + 1;
  const today = new Date();
  const todayX = diffDays(minDate, today) * DAY_W;

  // Build rows: group header + task rows per project
  type Row = { type: "group"; project: DashboardProject } | { type: "task"; task: DashboardTask };
  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    for (const project of projects) {
      const ptasks = scheduledTasks.filter((t) => t.project_id === project.id);
      if (ptasks.length === 0) continue;
      result.push({ type: "group", project });
      for (const t of ptasks) result.push({ type: "task", task: t });
    }
    return result;
  }, [projects, scheduledTasks]);

  const unscheduled = useMemo(
    () => tasks.filter((t) => !t.start_date && !t.due_date),
    [tasks]
  );

  // Calculate month ticks for ruler
  const monthTicks = useMemo(() => {
    const ticks: { x: number; label: string }[] = [];
    let cur = new Date(minDate);
    cur.setDate(1);
    while (cur <= maxDate) {
      const x = diffDays(minDate, cur) * DAY_W;
      if (x >= 0) ticks.push({ x, label: fmtMonth(cur) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return ticks;
  }, [minDate, maxDate]);

  // Row Y positions
  let yOffset = HEADER_H;
  const rowPositions: number[] = [];
  for (const row of rows) {
    rowPositions.push(yOffset);
    yOffset += row.type === "group" ? GROUP_H : ROW_H;
  }
  const svgH = yOffset;
  const svgW = totalDays * DAY_W;

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">アクティブな案件がありません</p>
      </div>
    );
  }

  if (scheduledTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">期日・開始日が設定されたタスクがありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Gantt */}
      <div className="border rounded-lg overflow-hidden">
        <div className="flex">
          {/* Left label panel */}
          <div
            className="shrink-0 border-r bg-background"
            style={{ width: LEFT_W }}
          >
            {/* Header spacer */}
            <div style={{ height: HEADER_H }} className="border-b flex items-end px-3 pb-1">
              <span className="text-xs text-muted-foreground">案件 / タスク</span>
            </div>
            {rows.map((row) => {
              if (row.type === "group") {
                return (
                  <div
                    key={`g-${row.project.id}`}
                    style={{ height: GROUP_H }}
                    className="border-b bg-muted/40 flex items-center px-2 gap-1"
                  >
                    <button
                      onClick={() => navigate(`/sales/projects/${row.project.id}/tasks`)}
                      className="text-xs font-semibold truncate hover:text-primary transition-colors text-left"
                    >
                      {row.project.gls_number
                        ? `${row.project.gls_number} `
                        : ""}
                      {row.project.name}
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={`t-${row.task.id}`}
                  style={{ height: ROW_H }}
                  className="border-b flex items-center px-3 pl-5"
                >
                  <span
                    className="text-xs truncate text-muted-foreground"
                    title={row.task.title}
                  >
                    {row.task.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable SVG area */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto">
            <svg
              width={svgW}
              height={svgH}
              className="block"
              style={{ minWidth: svgW }}
            >
              {/* Month header */}
              {monthTicks.map((tick) => (
                <g key={tick.x}>
                  <line
                    x1={tick.x}
                    y1={0}
                    x2={tick.x}
                    y2={svgH}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <text
                    x={tick.x + 4}
                    y={HEADER_H - 8}
                    fontSize={10}
                    fill="#94a3b8"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* Today line */}
              {todayX >= 0 && todayX <= svgW && (
                <line
                  x1={todayX}
                  y1={0}
                  x2={todayX}
                  y2={svgH}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
              )}

              {/* Row backgrounds + bars */}
              {rows.map((row, i) => {
                const y = rowPositions[i];
                const h = row.type === "group" ? GROUP_H : ROW_H;

                if (row.type === "group") {
                  return (
                    <rect
                      key={`bg-${i}`}
                      x={0}
                      y={y}
                      width={svgW}
                      height={h}
                      fill="#f8fafc"
                    />
                  );
                }

                const task = row.task;
                const s = parseDate(task.start_date);
                const e = parseDate(task.due_date);
                const col = columns.find((c) => c.id === task.column_id);
                const color = barColor(col);

                if (!s && !e) return null;

                const barStart = s ?? e!;
                const barEnd = e ?? s!;
                const bx = diffDays(minDate, barStart) * DAY_W;
                const bw = Math.max((diffDays(barStart, barEnd) + 1) * DAY_W, DAY_W);
                const by = y + (ROW_H - BAR_H) / 2;

                return (
                  <g key={`bar-${task.id}`}>
                    <rect
                      x={bx}
                      y={by}
                      width={bw}
                      height={BAR_H}
                      rx={3}
                      fill={color}
                      opacity={task.is_completed ? 0.4 : 0.85}
                    />
                    {bw > 40 && (
                      <text
                        x={bx + 5}
                        y={by + BAR_H / 2 + 4}
                        fontSize={10}
                        fill="#fff"
                        style={{ pointerEvents: "none" }}
                      >
                        {task.title.slice(0, Math.floor(bw / 7))}
                        {task.title.length > Math.floor(bw / 7) ? "…" : ""}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Header border */}
              <line
                x1={0}
                y1={HEADER_H}
                x2={svgW}
                y2={HEADER_H}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Unscheduled tasks */}
      {unscheduled.length > 0 && (
        <div className="border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            未スケジュール（{unscheduled.length}件）
          </p>
          <div className="flex flex-col gap-1">
            {unscheduled.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{t.project_name}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-1.5 rounded bg-red-500 opacity-70" />
          今日
        </span>
        <span>{fmtDate(minDate)} 〜 {fmtDate(maxDate)}</span>
      </div>
    </div>
  );
}
