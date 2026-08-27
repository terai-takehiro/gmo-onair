/**
 * ① 予定 / 週表のドラッグ操作（空きマスで新規・札の下端で延長）
 *
 * ── なぜ足したか ────────────────────────────────────────────
 *
 * 着手前の週表は**読むだけ**で、10分の打合せを30分に延ばすにも
 * 「札を押す → 詳細 → 編集 → 時刻の欄を打ち直す」の4手が要りました。
 * 香盤ビューにはマスを押して新規作成する操作が既にあるので、
 * 週表にも同じ直感（空きを押せば入れられる・端を引けば延びる）を持たせます。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 * - **15分刻みに丸める**（手ぶれをそのまま保存しない）
 * - ドラッグせずに押しただけなら **1時間の枠**として扱う（0分の予定を作らせない）
 * - 延長は**下端だけ**（開始をずらすのは編集ダイアログで。誤操作で開始が動くと
 *   「その時間に始まると聞いていた」人が困る）
 * - Escape で取りやめ（押した瞬間に保存はしない — 離すまで何も書かない）
 * - この画面は PC 専用（スマホは `MobileToday`）なのでマウスだけ相手にする
 */
import { useEffect, useRef, useState } from 'react';
import { DAY_START_H, DAY_END_H, fracToMin, snapMin, minToHM, type CalEvent } from './calendarLayout';

const WIN_FROM = DAY_START_H * 60;
const WIN_TO = DAY_END_H * 60;

interface DragState {
  kind: 'create' | 'resize';
  day: string;
  /** 動かない側の端（分）。新規=押した位置 / 延長=札の始まり */
  anchorMin: number;
  /** いま指がある側の端（分） */
  curMin: number;
  /** 対象の列の画面上の枠（ドラッグ中は列の外にマウスが出るため保存しておく） */
  rect: { top: number; height: number };
  ev?: CalEvent;
  /** 一度でも動いたか（動いていない resize は保存しない） */
  moved: boolean;
}

export interface GridDragHandlers {
  /** 列の空きを押した（列の div の onMouseDown に付ける） */
  startCreate: (day: string, e: React.MouseEvent<HTMLElement>) => void;
  /** 札の下端のつまみを押した（つまみの onMouseDown に付ける） */
  startResize: (day: string, ev: CalEvent, startMin: number, endMin: number, e: React.MouseEvent<HTMLElement>) => void;
  /** その日の列に出す選択中の帯。無ければ null */
  overlayFor: (day: string) => { top: number; height: number; label: string } | null;
  dragging: boolean;
}

export function useGridDrag({
  onCreateRange, onResizeEnd,
}: {
  /** 空きマスの選択が確定した（`HH:MM`）。渡さなければ新規のドラッグ自体を始めない */
  onCreateRange?: (day: string, start: string, end: string) => void;
  /** 札の延長が確定した（`HH:MM`）。 */
  onResizeEnd?: (ev: CalEvent, end: string) => void;
}): GridDragHandlers {
  const [drag, setDrag] = useState<DragState | null>(null);
  // window のリスナーから最新の状態を読むための鏡（state だけだと古い closure を掴む）
  const ref = useRef<DragState | null>(null);
  ref.current = drag;
  const cb = useRef({ onCreateRange, onResizeEnd });
  cb.current = { onCreateRange, onResizeEnd };

  const startCreate = (day: string, e: React.MouseEvent<HTMLElement>) => {
    if (!cb.current.onCreateRange || e.button !== 0) return;
    // 札（button）の上から始まったものは拾わない（札は押して開く・つまみは延長）
    if ((e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const min = snapMin(fracToMin((e.clientY - r.top) / r.height));
    e.preventDefault(); // 文字の選択が走ると帯と一緒に青い選択が出る
    setDrag({ kind: 'create', day, anchorMin: min, curMin: min, rect: { top: r.top, height: r.height }, moved: false });
  };

  const startResize = (day: string, ev: CalEvent, startMin: number, endMin: number, e: React.MouseEvent<HTMLElement>) => {
    if (!cb.current.onResizeEnd || e.button !== 0) return;
    // 札の onClick（詳細を開く）に化けさせない
    e.preventDefault();
    e.stopPropagation();
    const col = (e.currentTarget as HTMLElement).closest('[data-cal-col]');
    if (!col) return;
    const r = col.getBoundingClientRect();
    setDrag({ kind: 'resize', day, ev, anchorMin: startMin, curMin: endMin, rect: { top: r.top, height: r.height }, moved: false });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      setDrag((d) => {
        if (!d) return d;
        const min = snapMin(fracToMin((e.clientY - d.rect.top) / d.rect.height));
        return min === d.curMin ? d : { ...d, curMin: min, moved: true };
      });
    };
    const up = () => {
      const d = ref.current;
      setDrag(null);
      if (!d) return;
      if (d.kind === 'create') {
        let from = Math.min(d.anchorMin, d.curMin);
        let to = Math.max(d.anchorMin, d.curMin);
        // 押しただけ（15分未満）は1時間の枠として渡す（0分の予定を作らせない）
        if (to - from < 15) { from = d.anchorMin; to = Math.min(WIN_TO, from + 60); }
        if (to <= from) from = Math.max(WIN_FROM, to - 60);
        cb.current.onCreateRange?.(d.day, minToHM(from), minToHM(to));
      } else if (d.ev && d.moved) {
        // 最低15分は残す（始まりより前へ引き上げて 0 分・マイナスにしない）
        const end = Math.max(d.anchorMin + 15, d.curMin);
        cb.current.onResizeEnd?.(d.ev, minToHM(end));
      }
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrag(null); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('keydown', key);
    };
    // ドラッグの始まり/終わりでだけ張り替える（座標は state 更新で追う）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const overlayFor = (day: string) => {
    if (!drag || drag.day !== day) return null;
    const from = drag.kind === 'resize' ? drag.anchorMin : Math.min(drag.anchorMin, drag.curMin);
    const to = drag.kind === 'resize'
      ? Math.max(drag.anchorMin + 15, drag.curMin)
      : Math.max(Math.min(drag.anchorMin, drag.curMin) + 15, Math.max(drag.anchorMin, drag.curMin));
    const span = WIN_TO - WIN_FROM;
    return {
      top: ((Math.max(WIN_FROM, from) - WIN_FROM) / span) * 100,
      height: ((Math.min(WIN_TO, to) - Math.max(WIN_FROM, from)) / span) * 100,
      label: `${minToHM(from)}–${minToHM(to)}`,
    };
  };

  return { startCreate, startResize, overlayFor, dragging: !!drag };
}
