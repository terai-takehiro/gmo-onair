// 会場図面 — スペース＋ドラッグで盤をつかんで動かす（設計: venue-layout.md §6②
// 「スペース＋ドラッグ／Ctrl＋ホイール｜図面をつかむ／ズーム」）。
// `client-techops/src/pages/opsmanual/useManualPan.ts` の設計を写したもの
// （盤の実装は運営マニュアルと別の `VenueBoard` を書く方針・§6②・§12-6）。
// `viewportRef` が指す要素（overflow-auto のスクロールコンテナ）を直接
// スクロールさせるだけで、盤自体の座標系（mm）には触れない。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { isEditableTarget } from "@/pages/opsmanual/manualCanvasGeometry";

interface PanSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

export interface VenuePanHandlers {
  isSpaceHeld: boolean;
  isPanning: boolean;
  onPointerDownCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useVenuePan(viewportRef: RefObject<HTMLDivElement>): VenuePanHandlers {
  const [isSpaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setPanning] = useState(false);
  const sessionRef = useRef<PanSession | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || isEditableTarget(e.target)) return;
      setSpaceHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      setSpaceHeld(false);
    }
    function onBlur() {
      setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  function onPointerDownCapture(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isSpaceHeld) return;
    const el = viewportRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    sessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollLeft: el.scrollLeft,
      startScrollTop: el.scrollTop,
    };
    setPanning(true);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    const el = viewportRef.current;
    if (!session || !el || session.pointerId !== e.pointerId) return;
    el.scrollLeft = session.startScrollLeft - (e.clientX - session.startClientX);
    el.scrollTop = session.startScrollTop - (e.clientY - session.startClientY);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (sessionRef.current?.pointerId !== e.pointerId) return;
    sessionRef.current = null;
    setPanning(false);
  }

  return { isSpaceHeld, isPanning, onPointerDownCapture, onPointerMove, onPointerUp };
}
