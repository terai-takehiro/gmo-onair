/**
 * ガントのバー1本と、バー・行が共有する定数/型 — `GpmGanttView` の部品
 *
 * ファイルを分けているのは 400 行の上限のため（`client/CLAUDE.md`）。
 * ドラッグの状態は持たない — 押した位置を親（`GpmGanttView`）に渡すだけ。
 */
import type { GpmPhase, GpmTask } from '../../types';

export const ROW_H = 32;

/** 工程の状態 → バーの色（`PHASE_STATE_TONE` のバッジと同じ系統の実色） */
export const PHASE_COLOR: Record<string, string> = {
  done: '#16a34a', doing: '#2563eb', blocked: '#dc2626', todo: '#94a3b8',
};
export const TASK_COLOR = '#60a5fa';

export type Mode = 'move' | 'resize-start' | 'resize-end';

export type RowItem =
  | { kind: 'phase'; phase: GpmPhase; start: string | null; end: string | null }
  | { kind: 'group'; label: string }
  | { kind: 'task'; task: GpmTask; start: string | null; end: string | null };

/** バー1本。工程は状態の色の太いバー・タスクは進捗フィル付きの細いバー・◆はマイルストーン */
export function GanttBar({
  row, x, y, w, editable, dragging, onStart,
}: {
  row: Extract<RowItem, { kind: 'phase' } | { kind: 'task' }>;
  x: number; y: number; w: number;
  editable: boolean;
  dragging: boolean;
  onStart: (mode: Mode, clientX: number) => void;
}) {
  const isPhase = row.kind === 'phase';
  const pad = isPhase ? 5 : 8;
  const barY = y + pad;
  const barH = ROW_H - pad * 2;
  const color = isPhase ? PHASE_COLOR[row.phase.state] : TASK_COLOR;
  const cursor = editable ? (dragging ? 'grabbing' : 'grab') : 'default';
  const start = (mode: Mode) => (e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    onStart(mode, e.clientX);
  };

  // ◆ マイルストーン（単一日の節目・移動のみ）
  if (!isPhase && row.task.is_milestone) {
    const cx = x + w / 2;
    const cy = y + ROW_H / 2;
    const r = barH / 2 + 2;
    return (
      <g opacity={dragging ? 0.85 : 1}>
        <title>{row.task.title}</title>
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill="#f59e0b" fillOpacity={row.task.is_completed ? 0.4 : 0.95}
          stroke="#b45309" strokeWidth={1}
          style={{ cursor, touchAction: 'none' }}
          onPointerDown={start('move')}
        />
      </g>
    );
  }

  const progress = !isPhase && row.task.is_completed
    ? 100
    : isPhase
      ? (row.phase.state === 'done' ? 100 : 0)
      : Math.max(0, Math.min(100, row.task.progress ?? 0));
  const fillW = (w * progress) / 100;
  const HANDLE = 7;
  const label = isPhase ? row.phase.label : row.task.title;

  return (
    <g opacity={dragging ? 0.85 : 1}>
      {/* SVG の <title>（ブラウザ標準のツールチップ）なので <DateRange> は置けない */}
      <title>{label}{row.start ? `（${row.start.slice(5).replace('-', '/')} 〜 ${row.end?.slice(5).replace('-', '/')}）` : ''}</title>{/* ui-tokens-ok */}
      <rect x={x} y={barY} width={w} height={barH} rx={4} fill={color} fillOpacity={isPhase ? 0.3 : 0.28}
        style={{ cursor, touchAction: 'none' }} onPointerDown={start('move')} />
      {fillW > 0 && (
        <rect x={x} y={barY} width={fillW} height={barH} rx={4} fill={color} fillOpacity={0.9} style={{ pointerEvents: 'none' }} />
      )}
      {w > 60 && (
        <text x={x + HANDLE + 3} y={barY + barH / 2 + 3.5} fontSize={10}
          fill={fillW > 60 ? 'white' : 'currentColor'} fillOpacity={fillW > 60 ? 1 : 0.7}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {label.length > 18 ? `${label.slice(0, 17)}…` : label}
        </text>
      )}
      {editable && (
        <>
          <rect x={x} y={barY} width={HANDLE} height={barH} fill="#fff" fillOpacity={0.001}
            style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={start('resize-start')} />
          <rect x={x + w - HANDLE} y={barY} width={HANDLE} height={barH} fill="#fff" fillOpacity={0.001}
            style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={start('resize-end')} />
        </>
      )}
    </g>
  );
}
