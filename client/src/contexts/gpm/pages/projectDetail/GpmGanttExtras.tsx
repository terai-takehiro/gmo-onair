/**
 * ガントの追加部品 — 依存関係の矢印・後続の収集・土日の陰影
 *
 * `GpmGanttView` から切り出してある（1ファイル400行の上限）。
 * 依存関係のデータは**案件タスクと同じ `task_dependencies`**
 * （`GET /projects/:id/tasks/dependencies`・GPM のタスクは `project_tasks` の行なので
 * そのまま効く — サーバー側の追加は無し）。
 */
import type { TaskDependency } from '@/contexts/tasks/hooks/useProjectTasks';
import { lateDays, PHASE_STATE_LABEL, ymd } from '../../types';
import { PHASE_COLOR, ROW_H, type RowItem } from './GpmGanttBar';
import { GANTT_COLORS } from './ganttColors';

/** 左パネルの1行（工程名／タスク名＋遅れ・件数の印）。`GpmGanttView` の400行対策で分離 */
export function GanttLeftRow({ r, today }: { r: RowItem; today: string }) {
  const late = r.kind === 'phase'
    ? lateDays(ymd(r.phase.ends_on), today, r.phase.state === 'done')
    : r.kind === 'task' ? lateDays(ymd(r.task.due_at), today, r.task.is_completed) : 0;
  return (
    <div className="flex items-center gap-1.5 border-b border-border-faint px-3" style={{ height: ROW_H }}>
      {r.kind === 'phase' && (
        <>
          <span className="h-2 w-2 shrink-0 rounded-chip" style={{ backgroundColor: PHASE_COLOR[r.phase.state] }} aria-hidden="true" />
          <span className="text-sub min-w-0 flex-1 truncate font-bold" title={`${r.phase.label}（${PHASE_STATE_LABEL[r.phase.state]}）`}>
            {r.phase.label}
          </span>
          {late > 0 && <span className="text-badge shrink-0 font-bold text-destructive">{late}日遅れ</span>}
          {r.phase.task_count > 0 && (
            <span className="text-sub-sm font-number shrink-0 text-muted-foreground">
              {r.phase.task_done}/{r.phase.task_count}
            </span>
          )}
          {!r.start && <span className="text-badge shrink-0 text-muted-foreground">日付なし</span>}
        </>
      )}
      {r.kind === 'group' && (
        <span className="text-sub-sm min-w-0 flex-1 truncate font-bold text-muted-foreground">{r.label}</span>
      )}
      {r.kind === 'task' && (
        <>
          <span className={`text-sub min-w-0 flex-1 truncate pl-4 ${r.task.is_completed ? 'text-muted-foreground line-through' : ''}`} title={r.task.title}>
            {r.task.title}
          </span>
          {late > 0 && <span className="text-badge shrink-0 text-destructive">超過</span>}
          {!r.end && <span className="text-badge shrink-0 text-muted-foreground">期限未設定</span>}
        </>
      )}
    </div>
  );
}

/**
 * このタスクの**後続ぜんぶ**（推移的）。先行を後ろへ動かしたとき
 * 「後続もまとめてずらすか」を訊く相手を数えるのに使う。
 * サーバーが循環を拒否している（再帰CTE）が、**古いデータに循環が居ても
 * 無限ループしない**よう訪問済みで守る。
 */
export function collectSuccessors(taskId: string, deps: TaskDependency[]): Set<string> {
  const next = new Map<string, string[]>();
  for (const d of deps) {
    const list = next.get(d.predecessor_id);
    if (list) list.push(d.successor_id); else next.set(d.predecessor_id, [d.successor_id]);
  }
  const out = new Set<string>();
  const queue = [...(next.get(taskId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const n of next.get(id) ?? []) if (!out.has(n)) queue.push(n);
  }
  return out;
}

/** バーの位置（`GpmGanttView` の `geom()` が作る）。矢印はこの点を結ぶ */
export interface BarGeom { x: number; w: number; y: number }

/**
 * 依存関係の矢印（先行の右端 → 後続の左端）。
 * 描き方は案件タスクの `GanttView` と同じ折れ線＋三角
 * （見た目を揃える — 同じ意味の線が画面によって違う形だと別物に見える）。
 */
export function DependencyArrows({
  deps, geomById, rowH,
}: {
  deps: TaskDependency[];
  geomById: Map<string, BarGeom>;
  rowH: number;
}) {
  return (
    <>
      {deps.map((dep) => {
        const p = geomById.get(dep.predecessor_id);
        const s = geomById.get(dep.successor_id);
        if (!p || !s) return null;
        const ex = p.x + p.w;
        const ey = p.y + rowH / 2;
        const sx = s.x;
        const sy = s.y + rowH / 2;
        const midX = ex + 8;
        return (
          <g key={dep.id} style={{ pointerEvents: 'none' }}>
            <polyline
              points={`${ex},${ey} ${midX},${ey} ${midX},${sy} ${sx},${sy}`}
              fill="none" stroke={GANTT_COLORS.mutedForeground} strokeWidth={1.3} strokeOpacity={0.75}
            />
            <polygon points={`${sx - 6},${sy - 3} ${sx},${sy} ${sx - 6},${sy + 3}`} fill={GANTT_COLORS.mutedForeground} fillOpacity={0.85} />
          </g>
        );
      })}
    </>
  );
}

/**
 * 土日の陰影。**列の数だけ** rect を置く（1日ずつだと数百個になる）。
 * `origin` は `YYYY-MM-DD`。土曜の列に2日ぶんの幅で1枚置く。
 */
export function WeekendShade({
  origin, totalDays, dayW, height,
}: {
  origin: string;
  totalDays: number;
  dayW: number;
  height: number;
}) {
  const start = new Date(`${origin}T00:00:00`);
  const firstSat = (6 - start.getDay() + 7) % 7;
  const rects: React.ReactNode[] = [];
  for (let d = firstSat; d < totalDays; d += 7) {
    rects.push(
      <rect
        key={d}
        x={d * dayW}
        y={0}
        width={Math.min(2, totalDays - d) * dayW}
        height={height}
        fill="currentColor"
        fillOpacity={0.035}
        style={{ pointerEvents: 'none' }}
      />,
    );
  }
  // 範囲が日曜始まりのときの先頭1日ぶん
  if (start.getDay() === 0) {
    rects.push(
      <rect key="lead-sun" x={0} y={0} width={dayW} height={height}
        fill="currentColor" fillOpacity={0.035} style={{ pointerEvents: 'none' }} />,
    );
  }
  return <>{rects}</>;
}
