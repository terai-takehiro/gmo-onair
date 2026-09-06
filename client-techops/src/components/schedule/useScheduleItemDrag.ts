// PC グリッドの項目ドラッグ移動＋下端リサイズ。14-schedule-v2-plan.md §3 B1・§4-3。
//
// `ScheduleGrid.tsx` から切り出した（描画とポインタ追跡を分けると、
// タイムラインが非線形でも計算だけをここに閉じ込められる）。
//
// 決めごと（`client/src/contexts/production/pages/calendar/useGridDrag.ts` を踏襲）:
// - **動くまで保存しない**。しきい値（4px）未満の移動はクリックとして扱う
//   （何も起きていないのに保存されるのを防ぐ・クリックで編集シートを開く既存動作を壊さない）
// - **Esc で取りやめ**。取りやめは保存しない・元の位置に戻すだけ（サーバーには何も送らない）
// - 5分スナップは**ここだけ**（クライアント側）。API は 1 分単位のまま
//   （02-schedule.md 付録「実装で必ず守ること」）
// - 縦方向は `timeline.minOf`（非線形）で変換する。ピクセル差をそのまま分に換算しない
//   （時間の区切りごとに高さが違うため・§4-3 の指示）
// - 横方向（列をまたぐ移動）は「PC は移動＋下端リサイズだけ」の「移動」に含めて許可した
//   （リサイズは下端だけなので列は変えない）
import { useEffect, useRef, useState } from "react";
import type { ScheduleItem } from "@gmo-onair/shared/src/schedule/types";

const MOVE_THRESHOLD_PX = 4;
const SNAP_MIN = 5;
const MIN_DURATION_MIN = SNAP_MIN;
const MAX_MIN = 2880;

function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

interface DragState {
  kind: "move" | "resize";
  item: ScheduleItem;
  originStartMin: number;
  originEndMin: number;
  anchorClientX: number;
  anchorClientY: number;
  columnId: string;
  startMin: number;
  endMin: number;
  moved: boolean;
}

export interface DragOverride {
  columnId: string;
  startMin: number;
  endMin: number;
}

export interface ScheduleItemDragArgs {
  /** タイムラインの Y→分の変換（`buildTimeline().minOf`）。非線形なので必ずこれを通す */
  minOf: (y: number) => number;
  /** Y=0 の基準にする要素（PC グリッドの時刻ルーラー。全列で共通の縦位置を持つ） */
  originRef: React.RefObject<HTMLElement>;
  /** 移動中、ポインタの下にある列 id を返す。見つからなければ null（列は変えない） */
  columnAt: (clientX: number, clientY: number) => string | null;
  /** しきい値を超えて実際に動いたときだけ呼ぶ（未確定の位置は渡さない） */
  onCommit: (item: ScheduleItem, patch: { column_id: string; start_min: number; end_min: number }) => void;
}

export default function useScheduleItemDrag({ minOf, originRef, columnAt, onCommit }: ScheduleItemDragArgs) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // window のリスナーから最新の state を読むための鏡（state だけだと古い closure を掴む）
  const stateRef = useRef<DragState | null>(null);
  stateRef.current = drag;
  // ドラッグ確定直後、その項目の click を1回だけ打ち消すための印（項目 id 付き）。
  // id を持たせるのは、万一 click が発火しなかった場合に、次の別項目へのクリックまで
  // 誤って打ち消さないようにするため（`consumeClickSuppression` は呼ぶたびに必ずクリアする）
  const suppressClickForIdRef = useRef<string | null>(null);

  const begin = (kind: "move" | "resize", item: ScheduleItem, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // 列の空きクリック（新規作成）に化けさせない
    e.preventDefault(); // ドラッグ中に文字選択の青い反転が走らないように
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({
      kind,
      item,
      originStartMin: item.start_min,
      originEndMin: item.end_min,
      anchorClientX: e.clientX,
      anchorClientY: e.clientY,
      columnId: item.column_id,
      startMin: item.start_min,
      endMin: item.end_min,
      moved: false,
    });
  };

  const startMove = (item: ScheduleItem, e: React.PointerEvent<HTMLElement>) => begin("move", item, e);
  const startResize = (item: ScheduleItem, e: React.PointerEvent<HTMLElement>) => begin("resize", item, e);

  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const d = stateRef.current;
      if (!d) return;
      const top = originRef.current?.getBoundingClientRect().top ?? 0;
      // ⚠️ 縦方向だけで判定しない — 列をまたぐ移動（横方向）はほぼ縦に動かないことがあり、
      // Y 差だけで見ると「動いていない」扱いになって保存されない実バグがあった（Playwright で発見）
      const moved = d.moved || Math.hypot(e.clientX - d.anchorClientX, e.clientY - d.anchorClientY) >= MOVE_THRESHOLD_PX;

      if (d.kind === "resize") {
        const endMin = Math.min(MAX_MIN, Math.max(d.originStartMin + MIN_DURATION_MIN, snap(minOf(e.clientY - top))));
        setDrag({ ...d, endMin, moved });
        return;
      }

      // 移動: 2点をそれぞれ minOf で分に変換してから差を取る（タイムラインは非線形なので
      // ピクセル差 × 係数のような線形換算はできない）
      const deltaMin = minOf(e.clientY - top) - minOf(d.anchorClientY - top);
      const duration = d.originEndMin - d.originStartMin;
      const startMin = Math.max(0, Math.min(MAX_MIN - duration, snap(d.originStartMin + deltaMin)));
      const columnId = columnAt(e.clientX, e.clientY) ?? d.columnId;
      setDrag({ ...d, startMin, endMin: startMin + duration, columnId, moved });
    };

    const finish = (cancelled: boolean) => {
      const d = stateRef.current;
      setDrag(null);
      if (!d || !d.moved) return; // 動いていなければクリックとして扱う（何も送らない・元から何も上書きしていない）
      // ⚠️ Esc は「マウスを押したまま」押されることがある（Playwright での検証で発見・実機でも
      // 起こりうる）。ここで click の打ち消しを立てておかないと、この直後に来る pointerup で
      // ブラウザが素の click を発火させ、キャンセルしたはずの操作が「項目を編集」ダイアログを
      // 開いてしまう（動いた形跡がある以上、後続の click は必ずドラッグ由来として扱う）。
      suppressClickForIdRef.current = d.item.id;
      if (cancelled) return; // 保存はしない。位置は「動いていない」ときと同じく破棄される
      onCommit(d.item, { column_id: d.columnId, start_min: d.startMin, end_min: d.endMin });
    };

    const up = () => finish(false);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") finish(true); };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
    };
    // ドラッグの開始/終了でだけ張り替える（座標は state 更新で追う。useGridDrag.ts と同じ形）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  /** その項目がいまドラッグ中なら、表示用に上書きする座標。ドラッグ中でなければ null */
  const overrideOf = (itemId: string): DragOverride | null => {
    if (!drag || drag.item.id !== itemId) return null;
    return { columnId: drag.columnId, startMin: drag.startMin, endMin: drag.endMin };
  };

  /**
   * その項目でドラッグが確定した直後の click を1回だけ打ち消す（onClick の先頭で呼ぶ）。
   * 呼ぶと（一致してもしなくても）必ず消費する — 万一 click が発火しなかった場合に、
   * 印が残ったまま次の別項目のクリックまで巻き込むのを防ぐ。
   */
  const consumeClickSuppression = (itemId: string): boolean => {
    const matched = suppressClickForIdRef.current === itemId;
    suppressClickForIdRef.current = null;
    return matched;
  };

  return {
    dragging: !!drag,
    draggingItemId: drag?.item.id ?? null,
    /** いま動かしているのが「移動」か「下端リサイズ」か（時刻の吹き出しの出し方に使う） */
    dragKind: drag?.kind ?? null,
    overrideOf, startMove, startResize, consumeClickSuppression,
  };
}
