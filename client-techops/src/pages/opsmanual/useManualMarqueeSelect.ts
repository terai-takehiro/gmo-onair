// マーキー選択（複数選択をドラッグで囲む・Shift で足す。production-manual.md §6-2
// 「複数選択｜ドラッグで囲む・Shift で足す」）。キャンバスの背景（`pageRef` が指す要素そのもの）
// でのポインタ操作だけを見る。ブロックの上でのポインタ操作は ManualBlockView 側が
// `e.stopPropagation()` するのでここには来ない。
import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { PAGE_WIDTH_MM, type ManualBlock } from "@gmo-onair/shared/src/opsmanual/types";
import { rectsIntersect } from "./manualCanvasGeometry";

export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MarqueeStart {
  x: number;
  y: number;
  shiftKey: boolean;
  pointerId: number;
}

export interface ManualMarqueeSelect {
  marqueeRect: MarqueeRect | null;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useManualMarqueeSelect(
  pageRef: RefObject<HTMLDivElement>,
  blocks: ManualBlock[],
  selectedIds: string[],
  setSelectedIds: (ids: string[]) => void,
  selectOnly: (id: string | null) => void
): ManualMarqueeSelect {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const startRef = useRef<MarqueeStart | null>(null);

  function toPageMm(e: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const ppm = rect.width / PAGE_WIDTH_MM;
    return { x: (e.clientX - rect.left) / ppm, y: (e.clientY - rect.top) / ppm };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // ブロック自身の上では動かない
    const pos = toPageMm(e);
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: pos.x, y: pos.y, shiftKey: e.shiftKey, pointerId: e.pointerId };
    setMarqueeRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    const pos = toPageMm(e);
    if (!pos) return;
    setMarqueeRect({
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    startRef.current = null;
    const rect = marqueeRect;
    setMarqueeRect(null);
    const dragged = !!rect && (rect.w > 1 || rect.h > 1); // 1mm未満はクリック扱い
    if (!dragged) {
      if (!start.shiftKey) selectOnly(null); // 何も無い所をクリック=選択解除。Shift+クリックは維持
      return;
    }
    const hitIds = blocks.filter((b) => rectsIntersect(rect!, b)).map((b) => b.id);
    setSelectedIds(start.shiftKey ? Array.from(new Set([...selectedIds, ...hitIds])) : hitIds);
  }

  return { marqueeRect, onPointerDown, onPointerMove, onPointerUp };
}
