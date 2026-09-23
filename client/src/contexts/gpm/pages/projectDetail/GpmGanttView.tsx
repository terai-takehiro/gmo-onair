/**
 * ③ プロジェクト詳細「概要」のガント表示 — 工程とタスクを1本の時間軸で
 *
 * ── 案件タスクの `GanttView` を呼ばずに別に作った理由 ────────
 *
 * あちらはタスクだけの平らな表です。プロジェクト管理の主役は**工程**
 * （`gpm_phases` の `started_on`/`ends_on`）で、タスクはその配下に出ます。
 * 平らな表に工程を混ぜると「工程の下にどのタスクがあるか」が読めず、
 * 工程バーを動かす操作（`PUT /gpm/phases/:id`）の行き先も別です。
 * ドラッグの型（move / resize-start / resize-end・`deltaDays` を丸める）と
 * 時間軸ヘッダー（`GanttTimeline`）は同じものを使っています。
 *
 * ── 初期表示は「今日」を必ず視野に入れる ────────────────────
 *
 * 以前は左端（プロジェクト開始日）から表示していたため、進行中の案件を
 * 開くと**今日も残りの工程も画面外**で、バーが1本も見えませんでした
 * （「ガントが実装されていない」と見えた根本原因・実測）。
 *
 * ── 依存関係と「後続もずらす」 ──────────────────────────────
 *
 * 先行→後続（FS）は案件タスクと同じ `task_dependencies` を読む
 * （GPM のタスクは `project_tasks` の行なのでそのまま効く）。
 * 先行を**うしろへ**動かしたときだけ「後続N件もずらすか」を確認して
 * 一括シフトする — 黙って動かすと「勝手に日付が変わった」になる
 * （MS Project が既定を手動に変えた教訓）。前へ戻す・完了済みは動かさない。
 *
 * ── 書き込みは既存の口だけ ──────────────────────────────────
 *
 *   工程バー: `PUT /gpm/phases/:id` に `{started_on, ends_on}` だけ送る
 *   タスクバー: `PUT /gpm/tasks/:id` に `{start_date, due_date}`。
 *             **開始日の無いタスクを動かしたときは期限だけ動かす**
 *
 * ── 日付の解釈 ──────────────────────────────────────────────
 *
 * サーバーの DATE は `2026-05-12T00:00:00.000Z` で来るので `ymd()` で10文字に
 * 切ってから **`T00:00:00`（地元時刻）** で Date にする（`types.ts` の決めごと）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GanttTimeline from '@/contexts/tasks/components/GanttView/GanttTimeline';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useTaskDependencies } from '@/contexts/tasks/hooks/useProjectTasks';
import { useInvalidateGpm } from '../../queries';
import { lateDays, ymd, type GpmPhase, type GpmProjectDetail, type GpmTask } from '../../types';
import { GanttBar, ROW_H, type Mode, type RowItem } from './GpmGanttBar';
import { collectSuccessors, DependencyArrows, GanttLeftRow, WeekendShade, type BarGeom } from './GpmGanttExtras';
import { GANTT_COLORS } from './ganttColors';
const LEFT_W = 224;
const MS_DAY = 86_400_000;

/** ズーム3段。数ヶ月の案件は日表示だと横に長すぎて全体が見えない */
const ZOOMS = [
  { key: 'day', label: '日', w: 24 },
  { key: 'week', label: '週', w: 12 },
  { key: 'month', label: '月', w: 4 },
] as const;

interface Drag {
  kind: 'phase' | 'task';
  id: string;
  mode: Mode;
  startClientX: number;
  origStart: number;
  origEnd: number;
  /** 元から開始日を持っていたか（無いタスクの move は期限だけ書く） */
  hadStart: boolean;
  deltaDays: number;
}

const atMidnight = (s: string) => new Date(`${s}T00:00:00`);
const addDays = (s: string, n: number) => {
  const d = atMidnight(s);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const diffDays = (a: string, b: string) =>
  Math.round((atMidnight(a).getTime() - atMidnight(b).getTime()) / MS_DAY);
const todayYmd = () => {
  const now = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export function GpmGanttView({
  project, tasks, canEdit, onEditPhase, onEditTask,
}: {
  project: GpmProjectDetail;
  tasks: GpmTask[];
  canEdit: boolean;
  onEditPhase: (phase: GpmPhase) => void;
  onEditTask: (task: GpmTask) => void;
}) {
  const invalidate = useInvalidateGpm();
  const depsQuery = useTaskDependencies(project.id);
  // `?? []` を直に書くと毎描画で新しい配列になり、下の useCallback が毎回作り直される
  const deps = useMemo(() => depsQuery.data ?? [], [depsQuery.data]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dayW, setDayW] = useState<number>(ZOOMS[0].w);
  const dragRef = useRef<Drag | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const today = todayYmd();

  /** 行の並び: 工程 → その配下のタスク → 「工程なし」の束 */
  const rows = useMemo<RowItem[]>(() => {
    const byPhase = new Map<string, GpmTask[]>();
    for (const t of tasks) {
      const key = t.phase_id ?? '';
      const list = byPhase.get(key);
      if (list) list.push(t); else byPhase.set(key, [t]);
    }
    const taskRow = (t: GpmTask): RowItem => {
      const s = ymd(t.start_date);
      const e = ymd(t.due_at);
      return { kind: 'task', task: t, start: s ?? e, end: e ?? s };
    };
    const out: RowItem[] = [];
    for (const ph of project.phases) {
      const s = ymd(ph.started_on);
      const e = ymd(ph.ends_on);
      out.push({ kind: 'phase', phase: ph, start: s ?? e, end: e ?? s });
      for (const t of byPhase.get(ph.id) ?? []) out.push(taskRow(t));
    }
    const loose = byPhase.get('') ?? [];
    if (loose.length > 0) {
      out.push({ kind: 'group', label: `工程なし（${loose.length}件）` });
      for (const t of loose) out.push(taskRow(t));
    }
    return out;
  }, [project.phases, tasks]);

  /** 時間軸の範囲。日付を1つも持たないプロジェクトは今日を中心に出す */
  const { origin, end } = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const r of rows) {
      if (r.kind === 'group') continue;
      if (r.start && (!min || r.start < min)) min = r.start;
      if (r.end && (!max || r.end > max)) max = r.end;
    }
    // 遅れている案件は今日が右端を超えることがある。**今日線が範囲外に落ちないよう**今日まで広げる
    if (max && max < todayYmd()) max = todayYmd();
    return {
      origin: min ? addDays(min, -3) : addDays(todayYmd(), -7),
      end: max ? addDays(max, 14) : addDays(todayYmd(), 30),
    };
  }, [rows]);

  const totalDays = diffDays(end, origin) + 1;
  const totalWidth = totalDays * dayW;
  const todayX = diffDays(today, origin) * dayW;

  /** 今日が視野の1/3の位置に来るようスクロール。開いた直後とズーム変更時 */
  const scrollToToday = useCallback(() => {
    const b = bodyRef.current;
    if (!b) return;
    b.scrollLeft = Math.max(0, todayX - b.clientWidth / 3);
    if (headRef.current) headRef.current.scrollLeft = b.scrollLeft;
  }, [todayX]);
  useEffect(() => { scrollToToday(); }, [scrollToToday]);

  // 本体スクロールに時間軸ヘッダーと左パネルを追従させる（案件の GanttView と同じ形）
  const onBodyScroll = useCallback(() => {
    const b = bodyRef.current;
    if (!b) return;
    if (headRef.current) headRef.current.scrollLeft = b.scrollLeft;
    if (leftRef.current) leftRef.current.scrollTop = b.scrollTop;
  }, []);

  const save = useMutation({
    mutationFn: ({ d, s, e }: { d: Drag; s: string; e: string }) => {
      const body: Record<string, string> = d.kind === 'phase'
        ? { started_on: s, ends_on: e }
        : !d.hadStart && d.mode === 'move' ? { due_date: e } : { start_date: s, due_date: e };
      return api.put(d.kind === 'phase' ? `/gpm/phases/${d.id}` : `/gpm/tasks/${d.id}`, body);
    },
    onSuccess: () => invalidate(project.id),
    onError: (err) => notifyApiError('日付を動かせませんでした', err),
  });

  /**
   * 後続の一括シフト。**訊いてから**動かす・完了済みは動かさない・
   * 開始日の無いタスクは期限だけ動かす（1本のドラッグと同じ規則）。
   */
  const shiftChain = useCallback(async (predId: string, delta: number) => {
    const ids = collectSuccessors(predId, deps);
    const targets = tasks.filter((t) => ids.has(t.id) && !t.is_completed && ymd(t.due_at));
    if (targets.length === 0) return;
    const ok = await confirmAction({
      title: `後続のタスク ${targets.length} 件も ${delta}日 後ろへ移動しますか？`,
      description: '先行タスクの日程がうしろへ動いたので、依存でつながった後続も同じだけずらせます。対応済のタスクは動かしません。',
      confirmLabel: 'ずらす',
    });
    if (!ok) return;
    try {
      for (const t of targets) {
        const due = addDays(ymd(t.due_at)!, delta);
        const start = ymd(t.start_date);
        await api.put(`/gpm/tasks/${t.id}`, start ? { start_date: addDays(start, delta), due_date: due } : { due_date: due });
      }
      notifySuccess(`後続 ${targets.length} 件をずらしました`);
    } catch (err) {
      notifyApiError('後続をずらせませんでした', err);
    } finally {
      invalidate(project.id);
    }
  }, [deps, tasks, invalidate, project.id]);

  const persist = useCallback((d: Drag) => {
    if (d.deltaDays === 0) return;
    let s = d.origStart;
    let e = d.origEnd;
    if (d.mode === 'move') { s += d.deltaDays; e += d.deltaDays; }
    else if (d.mode === 'resize-start') s = Math.min(s + d.deltaDays, e);
    else e = Math.max(e + d.deltaDays, s);
    save.mutate({ d, s: addDays(origin, s), e: addDays(origin, e) });
    // 期限がうしろへ動いたタスクだけ、後続の一括シフトを提案する
    const dueDelta = e - d.origEnd;
    if (d.kind === 'task' && dueDelta > 0 && d.mode !== 'resize-start') void shiftChain(d.id, dueDelta);
  }, [origin, save, shiftChain]);

  // ドラッグ量ゼロ（= クリック/タップ）は編集ダイアログを開く
  const openEditor = useCallback((d: Drag) => {
    for (const r of rows) {
      if (r.kind === 'phase' && d.kind === 'phase' && r.phase.id === d.id) return onEditPhase(r.phase);
      if (r.kind === 'task' && d.kind === 'task' && r.task.id === d.id) return onEditTask(r.task);
    }
  }, [rows, onEditPhase, onEditTask]);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      let delta = Math.round((ev.clientX - d.startClientX) / dayW);
      if (d.mode === 'resize-start') delta = Math.min(delta, d.origEnd - d.origStart);
      if (d.mode === 'resize-end') delta = Math.max(delta, d.origStart - d.origEnd);
      const next = { ...d, deltaDays: delta };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d) {
        if (d.deltaDays === 0 && d.mode === 'move') openEditor(d); else persist(d);
      }
      dragRef.current = null;
      setDrag(null);
    };
    const onCancel = () => { dragRef.current = null; setDrag(null); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [persist, openEditor, dayW]);

  const beginDrag = (row: RowItem, mode: Mode, clientX: number) => {
    if (!canEdit || row.kind === 'group' || !row.start || !row.end) return;
    const hadStart = row.kind === 'task' ? !!ymd(row.task.start_date) : !!ymd(row.phase.started_on);
    const d: Drag = {
      kind: row.kind, id: row.kind === 'phase' ? row.phase.id : row.task.id, mode,
      startClientX: clientX,
      origStart: Math.max(0, diffDays(row.start, origin)),
      origEnd: diffDays(row.end, origin),
      hadStart, deltaDays: 0,
    };
    dragRef.current = d;
    setDrag(d);
  };

  const geom = (row: RowItem, index: number) => {
    if (row.kind === 'group' || !row.start || !row.end) return null;
    let s = Math.max(0, diffDays(row.start, origin));
    let e = diffDays(row.end, origin);
    const id = row.kind === 'phase' ? row.phase.id : row.task.id;
    if (drag && drag.id === id && drag.kind === row.kind) {
      if (drag.mode === 'move') { s = drag.origStart + drag.deltaDays; e = drag.origEnd + drag.deltaDays; }
      else if (drag.mode === 'resize-start') s = drag.origStart + drag.deltaDays;
      else e = drag.origEnd + drag.deltaDays;
    }
    return { x: s * dayW, w: Math.max((e - s + 1) * dayW, dayW), y: index * ROW_H };
  };

  const svgH = Math.max(rows.length * ROW_H, ROW_H);

  // 矢印の端点（タスクのバーだけ。工程は依存の相手にならない）
  const geomById = new Map<string, BarGeom>();
  rows.forEach((r, i) => {
    if (r.kind !== 'task') return;
    const g = geom(r, i);
    if (g) geomById.set(r.task.id, g);
  });

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card" style={drag ? { userSelect: 'none' } : undefined}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-subtle px-4 py-1.5">
        <p className="text-note min-w-0 flex-1 text-muted-foreground">
          {canEdit
            ? 'バーを押すと編集できます。ドラッグで日程ごと移動・端をつまむと期間が変わります。先行タスクを持つバーには矢印が出ます。'
            : '赤い枠は期限超過の工程・タスクです。矢印は先行→後続の順序です。'}
        </p>
        <div role="group" aria-label="ズーム" className="flex shrink-0 overflow-hidden rounded-control border border-border bg-card">
          {ZOOMS.map((z, i) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setDayW(z.w)}
              aria-pressed={dayW === z.w}
              className={cn(
                'text-sub flex h-7 items-center px-2.5',
                i > 0 && 'border-l border-border',
                dayW === z.w ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={scrollToToday}
          className="text-sub flex h-7 shrink-0 items-center rounded-control-md border border-border bg-card px-2.5 text-muted-foreground hover:bg-muted"
        >
          今日へ
        </button>
      </div>
      <div className="flex border-b border-border">
        <div className="text-th flex shrink-0 items-end border-r border-border px-3 pb-1 text-muted-foreground" style={{ width: LEFT_W }}>
          工程 ／ タスク
        </div>
        <div className="min-w-0 flex-1 overflow-hidden" ref={headRef}>
          <GanttTimeline startDate={atMidnight(origin)} endDate={atMidnight(end)} dayWidth={dayW} rowHeight={ROW_H} />
        </div>
      </div>

      <div className="flex" style={{ maxHeight: 560 }}>
        <div ref={leftRef} className="shrink-0 overflow-hidden border-r border-border" style={{ width: LEFT_W }}>
          {rows.map((r, i) => (
            <GanttLeftRow
              key={r.kind === 'phase' ? `p-${r.phase.id}` : r.kind === 'task' ? `t-${r.task.id}` : `g-${i}`}
              r={r}
              today={today}
            />
          ))}
        </div>

        <div ref={bodyRef} onScroll={onBodyScroll} className="min-w-0 flex-1 overflow-auto">
          <svg width={totalWidth} height={svgH} aria-label="工程とタスクのガントチャート">
            {/* 月ズーム（4px/日）では縞がノイズになるので土日の陰影を出さない */}
            {dayW >= 8 && <WeekendShade origin={origin} totalDays={totalDays} dayW={dayW} height={svgH} />}
            {rows.map((r, i) => (
              <g key={`bg-${i}`}>
                {r.kind !== 'task' && (
                  <rect x={0} y={i * ROW_H} width={totalWidth} height={ROW_H} fill="currentColor" fillOpacity={0.03} />
                )}
                <line x1={0} y1={(i + 1) * ROW_H} x2={totalWidth} y2={(i + 1) * ROW_H} stroke="currentColor" strokeOpacity={0.08} />
              </g>
            ))}
            <DependencyArrows deps={deps} geomById={geomById} rowH={ROW_H} />
            {rows.map((r, i) => {
              const g = geom(r, i);
              if (!g || r.kind === 'group') return null;
              const late = r.kind === 'phase'
                ? lateDays(ymd(r.phase.ends_on), today, r.phase.state === 'done') > 0
                : lateDays(ymd(r.task.due_at), today, r.task.is_completed) > 0;
              return (
                <GanttBar
                  key={r.kind === 'phase' ? `pb-${r.phase.id}` : `tb-${r.task.id}`}
                  row={r}
                  x={g.x}
                  y={g.y}
                  w={g.w}
                  editable={canEdit}
                  late={late}
                  dragging={!!drag && drag.id === (r.kind === 'phase' ? r.phase.id : r.task.id)}
                  onStart={(mode, cx) => beginDrag(r, mode, cx)}
                />
              );
            })}
            {todayX >= 0 && todayX <= totalWidth && (
              <g>
                <line x1={todayX} y1={0} x2={todayX} y2={svgH} stroke={GANTT_COLORS.destructive} strokeWidth={1.5} strokeDasharray="4,3" />
                <text x={todayX + 3} y={12} fontSize={9} fill={GANTT_COLORS.destructive}>今日</text>
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
