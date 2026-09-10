/**
 * ① 予定 / 週表のドラッグ操作（空きマスで新規・札の上下端で延長・札を掴んで移動）
 *
 * ── なぜ足したか ────────────────────────────────────────────
 *
 * 着手前の週表は**読むだけ**で、10分の打合せを30分に延ばすにも
 * 「札を押す → 詳細 → 編集 → 時刻の欄を打ち直す」の4手が要りました。
 * 香盤ビューにはマスを押して新規作成する操作が既にあるので、
 * 週表にも同じ直感（空きを押せば入れられる・端を引けば延びる）を持たせます。
 *
 * v4.6.13 で「下端しか延ばせない」「動かせない」という声を受け、
 * 上端の延長（開始をずらす）と、札を掴んでの移動（開始・終了・曜日を
 * まとめてずらす）を足しました。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 * - **15分刻みに丸める**（手ぶれをそのまま保存しない）
 * - ドラッグせずに押しただけなら **1時間の枠**として扱う（0分の予定を作らせない）
 * - 移動は**長さを変えない**（開始と終了を両方同じだけずらす）。伸び縮みは
 *   端のつまみの役目にして混ぜない — 混ざると「動かしたつもりが延びた」になる
 * - Escape で取りやめ（押した瞬間に保存はしない — 離すまで何も書かない）
 * - この画面は PC 専用（スマホは `MobileToday`）なのでマウスだけ相手にする
 */
import { useEffect, useRef, useState } from 'react';
import { DAY_START_H, DAY_END_H, fracToMin, snapMin, minToHM, type CalEvent } from './calendarLayout';

const WIN_FROM = DAY_START_H * 60;
const WIN_TO = DAY_END_H * 60;

interface DragState {
  kind: 'create' | 'resize' | 'move';
  /** 延長でどちら側の端を動かしているか（resize のみ） */
  edge?: 'start' | 'end';
  /** ドラッグを始めた列の日 */
  day: string;
  /** 今マウスの下にある列の日（move だけ動く。create/resize は常に `day` のまま） */
  curDay: string;
  /** 動かない側の端（分）。新規=押した位置 / 延長=動かさない方の端 / 移動=掴んだ位置と開始時刻のずれ */
  anchorMin: number;
  /** いま指がある側の端（分） */
  curMin: number;
  /** 対象の列の画面上の枠（ドラッグ中は列の外にマウスが出るため保存しておく） */
  rect: { top: number; height: number };
  ev?: CalEvent;
  /** 移動中の予定の長さ（分）。新しい開始が決まればこれを足すだけで終了になる（move のみ） */
  durationMin?: number;
  /** 一度でも動いたか（動いていない resize/move は保存しない） */
  moved: boolean;
}

export interface GridDragHandlers {
  /** 列の空きを押した（列の div の onMouseDown に付ける） */
  startCreate: (day: string, e: React.MouseEvent<HTMLElement>) => void;
  /** 札の端のつまみを押した（つまみの onMouseDown に付ける） */
  startResize: (
    day: string, ev: CalEvent, startMin: number, endMin: number, edge: 'start' | 'end', e: React.MouseEvent<HTMLElement>,
  ) => void;
  /** 札本体を押した（移動の開始）。つまみは別に `stopPropagation` するので競合しない */
  startMove: (day: string, ev: CalEvent, startMin: number, endMin: number, e: React.MouseEvent<HTMLElement>) => void;
  /** その日の列に出す選択中の帯。無ければ null */
  overlayFor: (day: string) => { top: number; height: number; label: string } | null;
  /** 移動中の札そのものの key。元の位置には描かず帯だけ見せるために使う */
  movingKey: string | null;
  /** 直前の mouseup が「動かした」ドラッグだったか。札の click（詳細を開く）に化けさせないためのガード */
  wasDragged: () => boolean;
  dragging: boolean;
}

export function useGridDrag({
  onCreateRange, onResize, onMove,
}: {
  /** 空きマスの選択が確定した（`HH:MM`）。渡さなければ新規のドラッグ自体を始めない */
  onCreateRange?: (day: string, start: string, end: string) => void;
  /** 札の端の延長が確定した（`HH:MM`）。`edge` がどちらの端を動かしたか */
  onResize?: (ev: CalEvent, edge: 'start' | 'end', time: string) => void;
  /** 札を掴んで移動した（新しい日・開始・終了）。長さは変えない */
  onMove?: (ev: CalEvent, day: string, start: string, end: string) => void;
}): GridDragHandlers {
  const [drag, setDrag] = useState<DragState | null>(null);
  // window のリスナーから最新の状態を読むための鏡（state だけだと古い closure を掴む）
  const ref = useRef<DragState | null>(null);
  ref.current = drag;
  const cb = useRef({ onCreateRange, onResize, onMove });
  cb.current = { onCreateRange, onResize, onMove };
  // 直前のドラッグで実際に動いたか。mouseup の瞬間に `drag` は null に戻るため、
  // 札の click ハンドラから読めるよう ref に残しておく
  const wasDraggedRef = useRef(false);

  const startCreate = (day: string, e: React.MouseEvent<HTMLElement>) => {
    if (!cb.current.onCreateRange || e.button !== 0) return;
    // 札（button）の上から始まったものは拾わない（札は押して開く・つまみは延長・本体は移動）
    if ((e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const min = snapMin(fracToMin((e.clientY - r.top) / r.height));
    e.preventDefault(); // 文字の選択が走ると帯と一緒に青い選択が出る
    setDrag({ kind: 'create', day, curDay: day, anchorMin: min, curMin: min, rect: { top: r.top, height: r.height }, moved: false });
  };

  const startResize = (
    day: string, ev: CalEvent, startMin: number, endMin: number, edge: 'start' | 'end', e: React.MouseEvent<HTMLElement>,
  ) => {
    if (!cb.current.onResize || e.button !== 0) return;
    // 札の onClick（詳細を開く）に化けさせない
    e.preventDefault();
    e.stopPropagation();
    const col = (e.currentTarget as HTMLElement).closest('[data-cal-col]');
    if (!col) return;
    const r = col.getBoundingClientRect();
    // 動かさない方の端を anchor に置く（end を伸ばすなら start が anchor・逆も同様）
    const anchorMin = edge === 'end' ? startMin : endMin;
    const curMin = edge === 'end' ? endMin : startMin;
    setDrag({ kind: 'resize', edge, day, curDay: day, anchorMin, curMin, rect: { top: r.top, height: r.height }, ev, moved: false });
  };

  const startMove = (day: string, ev: CalEvent, startMin: number, endMin: number, e: React.MouseEvent<HTMLElement>) => {
    if (!cb.current.onMove || e.button !== 0) return;
    // 端のつまみの上から始まったものは拾わない（そちらは延長。つまみ側で stopPropagation 済み）
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    e.preventDefault();
    const col = (e.currentTarget as HTMLElement).closest('[data-cal-col]');
    if (!col) return;
    const r = col.getBoundingClientRect();
    const grabMin = snapMin(fracToMin((e.clientY - r.top) / r.height));
    setDrag({
      kind: 'move', day, curDay: day,
      anchorMin: grabMin - startMin, // 掴んだ位置と開始時刻のずれ（動かしてもこの関係を保つ）
      curMin: grabMin,
      rect: { top: r.top, height: r.height },
      ev, durationMin: Math.max(15, endMin - startMin), moved: false,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      setDrag((d) => {
        if (!d) return d;
        const min = snapMin(fracToMin((e.clientY - d.rect.top) / d.rect.height));
        let curDay = d.curDay;
        if (d.kind === 'move') {
          // 今マウスの下にある列を探す。ドラッグ中はマウスの下に札やオーバーレイが
          // 乗っているため、React のイベント対象（固定された自分の列）ではなく
          // 実際に指の下にある DOM を都度 `elementFromPoint` で拾う
          const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const hitDay = el?.closest<HTMLElement>('[data-cal-col]')?.dataset.day;
          if (hitDay) curDay = hitDay;
        }
        if (min === d.curMin && curDay === d.curDay) return d;
        return { ...d, curMin: min, curDay, moved: true };
      });
    };
    const up = () => {
      const d = ref.current;
      wasDraggedRef.current = !!d?.moved;
      setDrag(null);
      if (!d) return;
      if (d.kind === 'create') {
        let from = Math.min(d.anchorMin, d.curMin);
        let to = Math.max(d.anchorMin, d.curMin);
        // 押しただけ（15分未満）は1時間の枠として渡す（0分の予定を作らせない）
        if (to - from < 15) { from = d.anchorMin; to = Math.min(WIN_TO, from + 60); }
        if (to <= from) from = Math.max(WIN_FROM, to - 60);
        cb.current.onCreateRange?.(d.day, minToHM(from), minToHM(to));
      } else if (d.kind === 'resize' && d.ev && d.moved) {
        if (d.edge === 'end') {
          const end = Math.max(d.anchorMin + 15, d.curMin);
          cb.current.onResize?.(d.ev, 'end', minToHM(end));
        } else {
          const start = Math.max(WIN_FROM, Math.min(d.anchorMin - 15, d.curMin));
          cb.current.onResize?.(d.ev, 'start', minToHM(start));
        }
      } else if (d.kind === 'move' && d.ev && d.moved) {
        const dur = d.durationMin ?? 60;
        const start = Math.max(WIN_FROM, Math.min(WIN_TO - dur, d.curMin - d.anchorMin));
        cb.current.onMove?.(d.ev, d.curDay, minToHM(start), minToHM(start + dur));
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
    if (!drag) return null;
    const span = WIN_TO - WIN_FROM;
    if (drag.kind === 'move') {
      if (drag.curDay !== day) return null; // 移動先の列にだけ帯を出す（元の列は札を隠すだけ）
      const dur = drag.durationMin ?? 60;
      const start = Math.max(WIN_FROM, Math.min(WIN_TO - dur, drag.curMin - drag.anchorMin));
      const end = start + dur;
      return { top: ((start - WIN_FROM) / span) * 100, height: ((end - start) / span) * 100, label: `${minToHM(start)}–${minToHM(end)}` };
    }
    if (drag.day !== day) return null;
    let from: number; let to: number;
    if (drag.kind === 'resize') {
      from = drag.edge === 'end' ? drag.anchorMin : Math.min(drag.anchorMin - 15, drag.curMin);
      to = drag.edge === 'end' ? Math.max(drag.anchorMin + 15, drag.curMin) : drag.anchorMin;
    } else {
      from = Math.min(drag.anchorMin, drag.curMin);
      to = Math.max(Math.min(drag.anchorMin, drag.curMin) + 15, Math.max(drag.anchorMin, drag.curMin));
    }
    return {
      top: ((Math.max(WIN_FROM, from) - WIN_FROM) / span) * 100,
      height: ((Math.min(WIN_TO, to) - Math.max(WIN_FROM, from)) / span) * 100,
      label: `${minToHM(from)}–${minToHM(to)}`,
    };
  };

  return {
    startCreate, startResize, startMove, overlayFor,
    movingKey: drag?.kind === 'move' ? drag.ev?.key ?? null : null,
    // **読んだら消費する。** `onClickCapture` は動かせない札（パートナー予定・タスク・
    // 外部同期の個人予定など）にも付いているが、そちらは `startMove` を呼ばないため
    // このフラグをリセットする機会が無い。消費せずに残すと、ドラッグで動かした
    // 直後に無関係の札を押しても「動かした後のクリック」と誤認され続け、
    // その札の詳細が開けなくなる（Codex レビュー指摘・P2）
    wasDragged: () => {
      const v = wasDraggedRef.current;
      wasDraggedRef.current = false;
      return v;
    },
    dragging: !!drag,
  };
}
