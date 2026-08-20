import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { localDateStr } from "@/lib/format";
import type { DashboardProject, DashboardTask, TaskColumn } from "@/types";

interface Props {
  projects: DashboardProject[];
  columns: TaskColumn[];
  tasks: DashboardTask[];
}

// ---- SVG Gantt constants (desktop) ----
const LEFT_W = 200;
const DAY_W = 24;
const GROUP_H = 28;
const ROW_H = 34;
const HEADER_H = 36;
const BAR_H = 18;
const PAD_DAYS = 3;

// ---- helpers ----
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

// ---- urgency for mobile badge ---- ⚠️ `today`は`localDateStr()`の日付文字列で渡すこと（時刻を挟んで比べるとJST夜間に誤判定する）
function urgencyClass(due: string | null, today: string): string {
  if (!due) return "bg-muted text-muted-foreground";
  if (due < today) return "bg-destructive-surface text-destructive";
  const days = diffDays(parseDate(today)!, parseDate(due)!);
  if (days <= 7) return "bg-warning-surface text-warning";
  return "bg-muted text-muted-foreground";
}

// ============================================================
// Mobile timeline strip (CSS-based)
// ============================================================
function MobileTimelineBar({
  task,
  col,
  minDate,
  totalDays,
  todayPct,
}: {
  task: DashboardTask;
  col: TaskColumn | undefined;
  minDate: Date;
  totalDays: number;
  todayPct: number;
}) {
  const s = parseDate(task.start_date);
  const e = parseDate(task.due_date);
  if (!s && !e) return null;

  const barStart = s ?? e!;
  const barEnd = e ?? s!;
  const startPct = Math.max(0, (diffDays(minDate, barStart) / totalDays) * 100);
  const endPct = Math.min(100, ((diffDays(minDate, barEnd) + 1) / totalDays) * 100);
  const widthPct = Math.max(endPct - startPct, 1.5);
  const color = barColor(col);

  return (
    <div className="relative h-3 w-full rounded bg-muted/60 overflow-hidden">
      {/* Today marker */}
      {todayPct >= 0 && todayPct <= 100 && (
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500/70 z-10"
          style={{ left: `${todayPct}%` }}
        />
      )}
      {/* Task bar */}
      <div
        className="absolute top-0.5 bottom-0.5 rounded-sm"
        style={{
          left: `${startPct}%`,
          width: `${widthPct}%`,
          background: color,
          opacity: task.is_completed ? 0.4 : 0.85,
        }}
      />
    </div>
  );
}

// ============================================================
// Mobile view — list + mini bars
// ============================================================
function MobileGanttView({
  projects,
  columns,
  tasks,
  scheduledTasks,
  minDate,
  maxDate,
}: {
  projects: DashboardProject[];
  columns: TaskColumn[];
  tasks: DashboardTask[];
  scheduledTasks: DashboardTask[];
  minDate: Date;
  maxDate: Date;
}) {
  const navigate = useNavigate();
  const totalDays = diffDays(minDate, maxDate) + 1;
  const todayPct = (diffDays(minDate, new Date()) / totalDays) * 100;

  const unscheduled = tasks.filter((t) => !t.start_date && !t.due_date);

  return (
    <div className="flex flex-col gap-3">
      {/* Date range header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>{fmtDate(minDate)}</span>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-1 rounded bg-red-500/70" />
          今日
        </div>
        <span>{fmtDate(maxDate)}</span>
      </div>

      {projects.map((project) => {
        const ptasks = scheduledTasks.filter((t) => t.project_id === project.id);
        if (ptasks.length === 0) return null;

        return (
          <div key={project.id} className="border rounded-xl overflow-hidden">
            {/* Project header */}
            <button
              onClick={() => navigate(`/sales/projects/${project.id}/task`)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
            >
              <span className="min-w-0 font-semibold text-sm truncate"> {/* min-w-0が無いと長い案件名で右の印が枠外に出る */}
                {project.gls_number ? `${project.gls_number} ` : ""}
                {project.name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="text-xs text-muted-foreground">{ptasks.length}件</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
            </button>

            {/* Tasks */}
            <div className="divide-y">
              {ptasks.map((task) => {
                const col = columns.find((c) => c.id === task.column_id);
                const color = barColor(col);
                const hasBar = !!(task.start_date || task.due_date);

                return (
                  <div key={task.id} className="px-3 py-2.5 flex flex-col gap-1.5">
                    {/* Row 1: color dot + title + status */}
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span
                        className={cn(
                          "text-sm flex-1 min-w-0 truncate",
                          task.is_completed && "line-through text-muted-foreground"
                        )}
                      >
                        {task.title}
                      </span>
                      {task.is_completed && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                    </div>

                    {/* Row 2: meta + date badge */}
                    <div className="flex items-center gap-2 text-xs">
                      {col && (
                        <span className="text-muted-foreground truncate max-w-[80px]">
                          {col.name}
                        </span>
                      )}
                      {task.assigned_to_name && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-muted-foreground truncate max-w-[80px]">
                            {task.assigned_to_name}
                          </span>
                        </>
                      )}
                      <span className="ml-auto shrink-0 flex gap-1">
                        {task.start_date && (
                          <span className="rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                            {fmtDate(new Date(task.start_date))}
                          </span>
                        )}
                        {task.due_date && (
                          <span className={cn("rounded px-1.5 py-0.5", urgencyClass(task.due_date, localDateStr(new Date())))}>
                            〆{fmtDate(new Date(task.due_date))}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Row 3: mini timeline bar */}
                    {hasBar && (
                      <MobileTimelineBar
                        task={task}
                        col={col}
                        minDate={minDate}
                        totalDays={totalDays}
                        todayPct={todayPct}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {unscheduled.length > 0 && (
        <div className="border rounded-xl p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            未スケジュール（{unscheduled.length}件）
          </p>
          <div className="flex flex-col gap-1.5">
            {unscheduled.map((t) => {
              const col = columns.find((c) => c.id === t.column_id);
              return (
                <div key={t.id} className="flex items-center gap-2 text-xs"> {/* 375pxで横はみ出ていたため案件名は上限を決めて縮めた */}
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: barColor(col) }}
                  />
                  <span className="shrink-0 max-w-[40%] truncate text-muted-foreground">{t.project_name}</span>
                  <span className="shrink-0 text-muted-foreground/40">·</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Desktop SVG Gantt
// ============================================================
function DesktopGanttView({
  projects,
  columns,
  tasks,
  scheduledTasks,
  minDate,
  maxDate,
}: {
  projects: DashboardProject[];
  columns: TaskColumn[];
  tasks: DashboardTask[];
  scheduledTasks: DashboardTask[];
  minDate: Date;
  maxDate: Date;
}) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalDays = diffDays(minDate, maxDate) + 1;
  const today = new Date();
  const todayX = diffDays(minDate, today) * DAY_W;

  type Row =
    | { type: "group"; project: DashboardProject }
    | { type: "task"; task: DashboardTask };

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

  let yOffset = HEADER_H;
  const rowPositions: number[] = [];
  for (const row of rows) {
    rowPositions.push(yOffset);
    yOffset += row.type === "group" ? GROUP_H : ROW_H;
  }
  const svgH = yOffset;
  const svgW = totalDays * DAY_W;

  return (
    <div className="flex flex-col gap-3">
      <div className="border rounded-lg overflow-hidden">
        <div className="flex">
          {/* Left label panel */}
          <div className="shrink-0 border-r bg-background" style={{ width: LEFT_W }}>
            <div style={{ height: HEADER_H }} className="border-b flex items-end px-3 pb-1">
              <span className="text-xs text-muted-foreground">案件 / タスク</span>
            </div>
            {rows.map((row) => {
              if (row.type === "group") {
                return (
                  <div
                    key={`g-${row.project.id}`}
                    style={{ height: GROUP_H }}
                    className="border-b bg-muted/40 flex items-center px-2"
                  >
                    <button
                      onClick={() => navigate(`/sales/projects/${row.project.id}/task`)}
                      className="text-xs font-semibold truncate hover:text-primary transition-colors text-left w-full"
                    >
                      {row.project.gls_number ? `${row.project.gls_number} ` : ""}
                      {row.project.name}
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={`t-${row.task.id}`}
                  style={{ height: ROW_H }}
                  className="border-b flex items-center px-2 pl-4 gap-1.5"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: barColor(columns.find((c) => c.id === row.task.column_id)) }}
                  />
                  <span className="text-xs truncate text-muted-foreground" title={row.task.title}>
                    {row.task.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable SVG */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto">
            <svg width={svgW} height={svgH} className="block" style={{ minWidth: svgW }}>
              {monthTicks.map((tick) => (
                <g key={tick.x}>
                  <line x1={tick.x} y1={0} x2={tick.x} y2={svgH} stroke="#e2e8f0" strokeWidth={1} />
                  <text x={tick.x + 4} y={HEADER_H - 6} fontSize={10} fill="#94a3b8">
                    {tick.label}
                  </text>
                </g>
              ))}

              {todayX >= 0 && todayX <= svgW && (
                <line
                  x1={todayX} y1={0} x2={todayX} y2={svgH}
                  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2"
                />
              )}

              {rows.map((row, i) => {
                const y = rowPositions[i];
                const h = row.type === "group" ? GROUP_H : ROW_H;

                if (row.type === "group") {
                  return <rect key={`bg-${i}`} x={0} y={y} width={svgW} height={h} fill="#f8fafc" />;
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
                      x={bx} y={by} width={bw} height={BAR_H} rx={3}
                      fill={color} opacity={task.is_completed ? 0.4 : 0.85}
                    />
                    {bw > 40 && (
                      <text x={bx + 5} y={by + BAR_H / 2 + 4} fontSize={10} fill="#fff" style={{ pointerEvents: "none" }}>
                        {task.title.slice(0, Math.floor(bw / 7))}
                        {task.title.length > Math.floor(bw / 7) ? "…" : ""}
                      </text>
                    )}
                  </g>
                );
              })}

              <line x1={0} y1={HEADER_H} x2={svgW} y2={HEADER_H} stroke="#e2e8f0" strokeWidth={1} />
            </svg>
          </div>
        </div>
      </div>

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

// ============================================================
// Main export — switches between mobile / desktop
// ============================================================
export default function DashboardGanttView({ projects, columns, tasks }: Props) {
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

  const sharedProps = { projects, columns, tasks, scheduledTasks, minDate, maxDate };

  return (
    <>
      {/* Mobile: card list + mini bars */}
      <div className="sm:hidden">
        <MobileGanttView {...sharedProps} />
      </div>
      {/* Desktop: SVG Gantt */}
      <div className="hidden sm:block">
        <DesktopGanttView {...sharedProps} />
      </div>
    </>
  );
}
