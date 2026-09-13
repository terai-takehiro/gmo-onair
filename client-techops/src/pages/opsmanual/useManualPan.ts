// キャンバスをスペース＋ドラッグでつかんで動かす（production-manual.md §6-2
// 「スペース＋ドラッグ｜キャンバスをつかんで動かす」）。`viewportRef` が指す要素
// （overflow-auto のスクロールコンテナ）を直接スクロールさせるだけで、
// キャンバス自体の座標系（mm）には触れない。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { isEditableTarget } from "./manualCanvasGeometry";

interface PanSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

export interface ManualPanHandlers {
  /** スペースキーを押している間（=つかんで動かせる状態）か。カーソルの出し分けに使う */
  isSpaceHeld: boolean;
  /** 実際にドラッグ中か */
  isPanning: boolean;
  onPointerDownCapture: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useManualPan(viewportRef: RefObject<HTMLDivElement>): ManualPanHandlers {
  const [isSpaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setPanning] = useState(false);
  const sessionRef = useRef<PanSession | null>(null);

  // スペースキーはウィンドウ全体で見る（キャンバスにフォーカスが無くても押せてよい。
  // 入力欄で押したときはテキスト入力として素通しする）
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
    // マーキー選択やブロックのドラッグ開始より先に奪う（スペース中はパン優先）
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
