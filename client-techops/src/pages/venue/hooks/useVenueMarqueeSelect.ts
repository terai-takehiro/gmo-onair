// 会場図面 — マーキー選択（矩形で囲む・Shift で足す）。mm 空間版。
// `client-techops/src/pages/opsmanual/useManualMarqueeSelect.ts` の写しだが、
// 運営マニュアルは A4 縦横の定数から mm 換算できたのに対し、会場図面の盤は
// 図面ごとに大きさが違う（§6②「別の盤 VenueBoard を書く」）ため、
// 呼び出し側（`VenueBoard`）が `toPageMm` を注入する形にしてある。
import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { VenueItem } from "@gmo-onair/shared/src/venue/types";
import { rectsIntersect } from "@/pages/opsmanual/manualCanvasGeometry";
import { toTopLeftRect } from "@gmo-onair/shared/src/venue/geometry";

export interface MarqueeRectMm {
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

export interface VenueMarqueeSelect {
  marqueeRect: MarqueeRectMm | null;
  onPointerDown: (e: ReactPointerEvent<SVGElement>) => void;
  onPointerMove: (e: ReactPointerEvent<SVGElement>) => void;
  onPointerUp: (e: ReactPointerEvent<SVGElement>) => void;
}

export function useVenueMarqueeSelect(
  svgRef: RefObject<SVGSVGElement>,
  toPageMm: (clientX: number, clientY: number) => { x: number; y: number } | null,
  items: VenueItem[],
  selectedIds: string[],
  setSelectedIds: (ids: string[]) => void,
  selectOnly: (id: string | null) => void,
): VenueMarqueeSelect {
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRectMm | null>(null);
  const startRef = useRef<MarqueeStart | null>(null);

  function onPointerDown(e: ReactPointerEvent<SVGElement>) {
    if (e.target !== e.currentTarget) return; // 品目自身の上では動かない（品目側が stopPropagation する）
    const pos = toPageMm(e.clientX, e.clientY);
    if (!pos) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    startRef.current = { x: pos.x, y: pos.y, shiftKey: e.shiftKey, pointerId: e.pointerId };
    setMarqueeRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }

  function onPointerMove(e: ReactPointerEvent<SVGElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    const pos = toPageMm(e.clientX, e.clientY);
    if (!pos) return;
    setMarqueeRect({
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    });
  }

  function onPointerUp(e: ReactPointerEvent<SVGElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    startRef.current = null;
    const rect = marqueeRect;
    setMarqueeRect(null);
    const dragged = !!rect && (rect.w > 4 || rect.h > 4); // 4mm未満はクリック扱い
    if (!dragged) {
      if (!start.shiftKey) selectOnly(null); // 何も無い所をクリック=選択解除。Shift+クリックは維持
      return;
    }
    const hitIds = items.filter((it) => rectsIntersect(rect!, toTopLeftRect(it))).map((it) => it.id);
    setSelectedIds(start.shiftKey ? Array.from(new Set([...selectedIds, ...hitIds])) : hitIds);
  }

  return { marqueeRect, onPointerDown, onPointerMove, onPointerUp };
}
