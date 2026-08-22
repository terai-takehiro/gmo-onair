/**
 * 左端から右へなぞると戻る（M11「純粋な操作感の演出」）
 *
 * ── 何のために作ったか ──────────────────────────────────────
 *
 * `client-v4/sheet.tsx` の `<Sheet>` が持っていた「左端 24px から右へなぞると
 * 閉じる」ロジックを、シート以外（ページそのもの）でも使えるように切り出した。
 * **案件作成の3段ウィザード**（`projectNew/MobileNewProject.tsx`）は
 * シートではなく画面そのものなので、`<Sheet>` の中には無い「前の段へ戻る」
 * という操作にこのロジックを再利用する。
 *
 * ── 実装の決めごと（`Sheet` と同じ） ────────────────────────
 *
 * - **左端 24px から始まったときだけ**（本文の横スクロールと衝突させない）
 * - **縦の動きのほうが大きければ追わない**（スクロールを奪わない）
 * - **96px 以上引いて離すと戻る**。それ未満なら 0 へ戻す
 * - **PC では効かない**（マウスは `touchstart` を発火しない）
 */
import { useRef, useState } from 'react';

/** 左端からこの幅の中で触れ始めたときだけスワイプバックとして扱う（px） */
const EDGE_ZONE = 24;
/** これ以上右へ動かして離すと「戻る」を実行する（px） */
const CLOSE_THRESHOLD = 96;

export interface EdgeSwipeBackHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
}

export function useEdgeSwipeBack({ onBack, disabled }: {
  onBack: () => void;
  /** PC 幅など、ジェスチャーを受け付けたくない場面で渡す */
  disabled?: boolean;
}): { dragX: number; dragging: boolean; handlers: EdgeSwipeBackHandlers } {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) { tracking.current = false; return; }
    const t = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    if (t.clientX - rect.left > EDGE_ZONE) { tracking.current = false; return; }
    startX.current = t.clientX;
    startY.current = t.clientY;
    tracking.current = true;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!tracking.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (dx < 0 || Math.abs(dy) > Math.abs(dx)) {
      // 左へ戻した、または縦の動きのほうが大きい → 追わない（スクロールに任せる）
      tracking.current = false;
      setDragging(false);
      setDragX(0);
      return;
    }
    e.preventDefault();
    setDragX(dx);
  };
  const onTouchEnd = () => {
    if (!tracking.current) { setDragging(false); return; }
    tracking.current = false;
    setDragging(false);
    if (dragX >= CLOSE_THRESHOLD) onBack();
    setDragX(0);
  };

  return { dragX, dragging, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}
