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
 * ── 書き込みは既存の口だけ ──────────────────────────────────
 *
 *   工程バー: `PUT /gpm/phases/:id` に `{started_on, ends_on}` だけ送る
 *             （部分更新なので名前・状態・ロールは保たれる）
 *   タスクバー: `PUT /gpm/tasks/:id` に `{start_date, due_date}`。
 *             **開始日の無いタスクを動かしたときは期限だけ動かす** —
 *             「期限だけ決めてある」形を、動かしただけで壊さない
 *
 * ── 日付の解釈 ──────────────────────────────────────────────
 *
 * サーバーの DATE は `2026-05-12T00:00:00.000Z` で来るので `ymd()` で10文字に
 * 切ってから **`T00:00:00`（地元時刻）** で Date にする。`new Date(生の文字列)`
 * だと端末の時間帯で1日ずれる（`types.ts` の決めごと）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GanttTimeline from '@/contexts/tasks/components/GanttView/GanttTimeline';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useInvalidateGpm } from '../../queries';
import { PHASE_STATE_LABEL, ymd, type GpmPhase, type GpmProjectDetail, type GpmTask } from '../../types';
import { GanttBar, PHASE_COLOR, ROW_H, type Mode, type RowItem } from './GpmGanttBar';

const DAY_W = 24;
const LEFT_W = 224;
const MS_DAY = 86_400_000;

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
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);

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
    const p = (x: number) => String(x).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    return {
      origin: min ? addDays(min, -3) : addDays(today, -7),
      end: max ? addDays(max, 14) : addDays(today, 30),
    };
  }, [rows]);

  const totalDays = diffDays(end, origin) + 1;
  const totalWidth = totalDays * DAY_W;
  const nowLocal = new Date();
  const pad2 = (x: number) => String(x).padStart(2, '0');
  const todayX = diffDays(
    `${nowLocal.getFullYear()}-${pad2(nowLocal.getMonth() + 1)}-${pad2(nowLocal.getDate())}`,
    origin,
  ) * DAY_W;

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

  const persist = useCallback((d: Drag) => {
    if (d.deltaDays === 0) return;
    let s = d.origStart;
    let e = d.origEnd;
    if (d.mode === 'move') { s += d.deltaDays; e += d.deltaDays; }
    else if (d.mode === 'resize-start') s = Math.min(s + d.deltaDays, e);
    else e = Math.max(e + d.deltaDays, s);
    save.mutate({ d, s: addDays(origin, s), e: addDays(origin, e) });
  }, [origin, save]);

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
      let delta = Math.round((ev.clientX - d.startClientX) / DAY_W);
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
  }, [persist, openEditor]);

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
    return { x: s * DAY_W, w: Math.max((e - s + 1) * DAY_W, DAY_W), y: index * ROW_H };
  };

  const svgH = Math.max(rows.length * ROW_H, ROW_H);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card" style={drag ? { userSelect: 'none' } : undefined}>
      {canEdit && (
        <p className="text-note border-b border-border-subtle bg-surface-subtle px-4 py-1.5 text-muted-foreground">
          バーを押すと直せます。ドラッグで日程ごと移動・端をつまむと期間が変わります（工程もタスクも）。
        </p>
      )}
      <div className="flex border-b border-border">
        <div className="text-th flex shrink-0 items-end border-r border-border px-3 pb-1 text-muted-foreground" style={{ width: LEFT_W }}>
          工程 ／ タスク
        </div>
        <div className="min-w-0 flex-1 overflow-hidden" ref={headRef}>
          <GanttTimeline startDate={atMidnight(origin)} endDate={atMidnight(end)} dayWidth={DAY_W} rowHeight={ROW_H} />
        </div>
      </div>

      <div className="flex" style={{ maxHeight: 560 }}>
        <div ref={leftRef} className="shrink-0 overflow-hidden border-r border-border" style={{ width: LEFT_W }}>
          {rows.map((r, i) => (
            <div
              key={r.kind === 'phase' ? `p-${r.phase.id}` : r.kind === 'task' ? `t-${r.task.id}` : `g-${i}`}
              className="flex items-center gap-1.5 border-b border-border-faint px-3"
              style={{ height: ROW_H }}
            >
              {r.kind === 'phase' && (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-chip" style={{ backgroundColor: PHASE_COLOR[r.phase.state] }} aria-hidden="true" />
                  <span className="text-sub min-w-0 flex-1 truncate font-bold" title={`${r.phase.label}（${PHASE_STATE_LABEL[r.phase.state]}）`}>
                    {r.phase.label}
                  </span>
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
                  {!r.end && <span className="text-badge shrink-0 text-muted-foreground">期限なし</span>}
                </>
              )}
            </div>
          ))}
        </div>

        <div ref={bodyRef} onScroll={onBodyScroll} className="min-w-0 flex-1 overflow-auto">
          <svg width={totalWidth} height={svgH} aria-label="工程とタスクのガントチャート">
            {rows.map((r, i) => (
              <g key={`bg-${i}`}>
                {r.kind !== 'task' && (
                  <rect x={0} y={i * ROW_H} width={totalWidth} height={ROW_H} fill="currentColor" fillOpacity={0.03} />
                )}
                <line x1={0} y1={(i + 1) * ROW_H} x2={totalWidth} y2={(i + 1) * ROW_H} stroke="currentColor" strokeOpacity={0.08} />
              </g>
            ))}
            {rows.map((r, i) => {
              const g = geom(r, i);
              if (!g || r.kind === 'group') return null;
              return (
                <GanttBar
                  key={r.kind === 'phase' ? `pb-${r.phase.id}` : `tb-${r.task.id}`}
                  row={r}
                  x={g.x}
                  y={g.y}
                  w={g.w}
                  editable={canEdit}
                  dragging={!!drag && drag.id === (r.kind === 'phase' ? r.phase.id : r.task.id)}
                  onStart={(mode, cx) => beginDrag(r, mode, cx)}
                />
              );
            })}
            {todayX >= 0 && todayX <= totalWidth && (
              <g>
                <line x1={todayX} y1={0} x2={todayX} y2={svgH} stroke="#f87171" strokeWidth={1.5} strokeDasharray="4,3" />
                <text x={todayX + 3} y={12} fontSize={9} fill="#f87171">今日</text>
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
