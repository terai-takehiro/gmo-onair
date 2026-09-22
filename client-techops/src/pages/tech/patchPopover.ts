// 技術資料 ②映像パッチ — 候補の開け閉め（機材・パッチ番号・行の操作で共通）。
// 外側を押したとき・Esc を押したときに閉じる。器（<ConfirmHost /> 等）を持たない
// 小さな一覧なので、Radix を足さずにここで閉じ方だけを揃える。
import { useEffect, type RefObject } from "react";

export function usePopoverDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) close();
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
  }, [ref, open, close]);
}
