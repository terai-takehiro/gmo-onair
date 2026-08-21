/**
 * カード行を左スワイプするとアクションが出る（スマホの一覧・M11「純粋な操作感の演出」）
 *
 * ── 何のために作ったか ──────────────────────────────────────
 *
 * v4 ネイティブUI化の残タスク「スワイプで操作」。**新しい業務ロジックは増やさない**
 * ——画面に既にある破壊的／軽微な操作（削除・落とす等）のボタンに、
 * もう1つの入り口（左スワイプ）を足すだけの部品。既存のボタン列は消さない
 * （キーボード操作・読み上げ・タッチに不慣れな人のための入り口を残す）。
 *
 * ── 実装の決めごと ──────────────────────────────────────────
 *
 * - **前面のカードをそのまま横に滑らせ、背面にアクションを敷く。**
 *   カード自身の背景色（`bg-card` 等）が背面を隠すので、カードの見た目を
 *   1つも変えずに使える
 * - **軸を最初の数px で確定する**（`ui/rail.ts` の「8px 動くまではクリック扱い」
 *   と同じ考え方）。縦の動きだと分かったら握りを離し、ふつうのスクロールに任せる
 * - **開いたままタップされたら閉じるだけ**（誤操作防止）。もう一度タップし直せば
 *   下のカードのボタンを押せる
 * - **`disabled` を渡すと素通り。** 権限が無い・削除できない行では
 *   アクションの配列自体を空にする（呼び出し側の責務）
 */
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '../client/utils';

export interface SwipeActionItem {
  label: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  onAction: () => void;
}

/** 1アクションあたりの幅（px）。44px の最低タップ領域に十分な余白を持たせてある */
const ACTION_WIDTH = 84;
/** これ以上引いたら「開いた」まま止める（アクション幅の半分） */
const OPEN_RATIO = 0.5;

export function SwipeAction({ actions, className, children }: {
  actions: SwipeActionItem[];
  className?: string;
  children: ReactNode;
}) {
  const maxReveal = actions.length * ACTION_WIDTH;
  const [dx, setDx] = useState(0); // 0=閉じている 〜 -maxReveal=全開
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const openAtStart = useRef(0);
  const axis = useRef<'x' | 'y' | null>(null);
  const active = useRef(false);

  const close = () => setDx(0);

  if (actions.length === 0) return <>{children}</>;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    openAtStart.current = dx;
    axis.current = null;
    active.current = true;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!active.current) return;
    const cx = e.touches[0].clientX - startX.current;
    const cy = e.touches[0].clientY - startY.current;
    if (!axis.current) {
      // **8px 動くまでは判定しない。** 指が震えただけで縦横どちらかに倒れない
      if (Math.abs(cx) < 8 && Math.abs(cy) < 8) return;
      axis.current = Math.abs(cx) > Math.abs(cy) ? 'x' : 'y';
      if (axis.current === 'y') { active.current = false; setDragging(false); return; }
    }
    if (axis.current !== 'x') return;
    e.preventDefault();
    setDx(Math.min(0, Math.max(-maxReveal, openAtStart.current + cx)));
  };
  const onTouchEnd = () => {
    if (!active.current) return;
    active.current = false;
    setDragging(false);
    setDx((d) => (Math.abs(d) >= maxReveal * OPEN_RATIO ? -maxReveal : 0));
  };

  return (
    <div className={cn('relative overflow-hidden rounded-card', className)}>
      {/* 背面：スワイプで現れるアクション。カードが被さっているあいだは押せない
          位置にあるので、ボタンは常に存在させておいてよい */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: maxReveal }}>
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { a.onAction(); close(); }}
            className={cn(
              'flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 text-badge',
              a.tone === 'danger'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      {/* 前面：カードそのもの。背景色を持つので背面を隠す */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          // **開いているときの1タップは閉じるだけ。** 誤操作でカードの本来の
          // 操作（開く・チェックボックス等）が起きるのを防ぐ
          if (dx !== 0) { e.preventDefault(); e.stopPropagation(); close(); }
        }}
        className={cn(!dragging && 'transition-transform duration-200 motion-reduce:transition-none')}
        style={{ transform: `translateX(${dx}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
