// 技術資料 ②映像パッチ — 候補の開け閉め（機材・パッチ番号・行の操作で共通）。
// 外側を押したとき・Esc を押したときに閉じる。器（ConfirmHost 等）を持たない
// 小さな一覧なので、Radix を足さずにここで閉じ方だけを揃える。
//
// 候補は `FloatingPanel` で body 直下に出す。表は横スクロールの器（overflow-x-auto）の中にあり、
// その中に absolute で出すと器の下端で切れて、検索欄しか見えなかった（利用者指摘）。
import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type AnyRef = RefObject<HTMLElement | null>;

export function usePopoverDismiss(
  refs: AnyRef | AnyRef[],
  open: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const list = Array.isArray(refs) ? refs : [refs];
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!(e.target instanceof Node)) return;
      const target = e.target;
      if (list.some((r) => r.current?.contains(target))) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // refs は呼び出し側で毎回作る配列なので依存に入れない（中身の ref は不変）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

const GAP = 4;
const MARGIN = 8;

/**
 * 基準の要素（anchorRef）のすぐ下に、画面に固定で出す候補の箱。
 * 下に入りきらず上のほうが広いときは上に開く。左右は画面からはみ出さないよう寄せる。
 */
export function FloatingPanel({
  anchorRef, panelRef, align = "left", width, className, children,
}: {
  anchorRef: AnyRef;
  panelRef: RefObject<HTMLDivElement>;
  align?: "left" | "right";
  /** px */
  width: number;
  className?: string;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - MARGIN * 2);
      const h = panel.offsetHeight;
      let left = align === "left" ? r.left : r.right - w;
      left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
      const below = vh - r.bottom - GAP - MARGIN;
      const above = r.top - GAP - MARGIN;
      const up = h > below && above > below;
      setStyle({
        position: "fixed",
        left,
        width: w,
        maxHeight: Math.max(160, up ? above : below),
        ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
      });
    };
    place();
    // 表の横スクロール・ページのスクロール・窓の大きさが変わったら付け直す
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, panelRef, align, width]);

  return createPortal(
    <div ref={panelRef} style={style} className={`z-50 flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-lg ${className ?? ""}`}>
      {children}
    </div>,
    document.body,
  );
}
