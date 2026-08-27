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

/** 期限を過ぎて未完了（遅れ）の印。バーの枠と◆の縁をこの色にする */
const LATE_STROKE = '#dc2626';

/** バー1本。工程は状態の色の太いバー・タスクは進捗フィル付きの細いバー・◆はマイルストーン */
export function GanttBar({
  row, x, y, w, editable, dragging, late, onStart,
}: {
  row: Extract<RowItem, { kind: 'phase' } | { kind: 'task' }>;
  x: number; y: number; w: number;
  editable: boolean;
  dragging: boolean;
  /** 期限超過（終わりが今日より前で未完了）。赤い枠で知らせる — 塗りは変えない */
  late?: boolean;
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

  // 検証（Playwright）がバーを名指しでつかむための印。座標で探すと行の増減で壊れる
  const barKey = isPhase ? `p-${row.phase.id}` : `t-${row.task.id}`;

  // ◆ マイルストーン（単一日の節目・移動のみ）
  if (!isPhase && row.task.is_milestone) {
    const cx = x + w / 2;
    const cy = y + ROW_H / 2;
    const r = barH / 2 + 2;
    return (
      <g data-bar={barKey} opacity={dragging ? 0.85 : 1}>
        <title>{row.task.title}</title>
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill="#f59e0b" fillOpacity={row.task.is_completed ? 0.4 : 0.95}
          stroke={late ? LATE_STROKE : '#b45309'} strokeWidth={late ? 1.8 : 1}
          style={{ cursor, touchAction: 'none' }}
          onPointerDown={start('move')}
        />
      </g>
    );
  }

  // 工程の塗りは配下タスクの完了数から（従来は完了/未完了の二値で、
  // 「6工程中2つ済み」のような途中経過がバーに出なかった）
  const progress = !isPhase && row.task.is_completed
    ? 100
    : isPhase
      ? (row.phase.state === 'done'
        ? 100
        : row.phase.task_count > 0
          ? Math.round((row.phase.task_done / row.phase.task_count) * 100)
          : 0)
      : Math.max(0, Math.min(100, row.task.progress ?? 0));
  const fillW = (w * progress) / 100;
  const HANDLE = 7;
  const label = isPhase ? row.phase.label : row.task.title;

  return (
    <g data-bar={barKey} opacity={dragging ? 0.85 : 1}>
      {/* SVG の <title>（ブラウザ標準のツールチップ）なので <DateRange> は置けない */}
      <title>{label}{row.start ? `（${row.start.slice(5).replace('-', '/')} 〜 ${row.end?.slice(5).replace('-', '/')}）` : ''}</title>{/* ui-tokens-ok */}
      <rect x={x} y={barY} width={w} height={barH} rx={4} fill={color} fillOpacity={isPhase ? 0.3 : 0.28}
        stroke={late ? LATE_STROKE : undefined} strokeWidth={late ? 1.5 : undefined}
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
      {/* 端の掴み（伸縮）は**中央の移動ゾーンが残る幅のときだけ**。
          1日幅（24px以下）のバーに両端7pxずつ置くと移動でつかめる場所が無くなる — 実測 */}
      {editable && w >= HANDLE * 3 && (
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
