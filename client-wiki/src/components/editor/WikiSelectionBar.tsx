/**
 * 文字を選ぶと浮かぶ小さなバー（太字・リンク。設計 §6-③）
 *
 * 選んだところのすぐ上に出します。位置は `caretPoint.ts` が測り、測れなかったときは
 * 本文の左上に出します（**出ないという状態は作らない**）。
 *
 * ⚠️ `onMouseDown` で既定の動きを止めています。止めないとボタンを押した瞬間に
 * `<textarea>` からフォーカスが外れ、**選んでいた範囲が消えてから**処理が走ります。
 */
import { Bold, Link2 } from 'lucide-react';
import type { CaretPoint } from './caretPoint';

interface Props {
  point: CaretPoint | null;
  onBold: () => void;
  onLink: () => void;
}

export default function WikiSelectionBar({ point, onBold, onLink }: Props) {
  // 行の上に置く。いちばん上の行のときは行の下へ回す（画面の外に出さない）
  const above = (point?.y ?? 0) > 34;
  const top = point ? (above ? point.y - 36 : point.y + point.lineHeight + 6) : 8;
  // 左右は本文の幅に収める（`clamp` なので親の幅を測らなくてよい）
  const left = `clamp(8px, ${Math.round(point?.x ?? 8)}px, calc(100% - 132px))`;

  return (
    <div
      role="toolbar"
      aria-label="選んだ文字の操作"
      onMouseDown={(e) => e.preventDefault()}
      style={{ top, left }}
      className="absolute z-20 flex items-center gap-0.5 rounded-control border border-border bg-card px-1 py-1 shadow-lg"
    >
      <button
        type="button"
        onClick={onBold}
        className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-sub text-foreground hover:bg-muted"
      >
        <Bold className="h-3.5 w-3.5" aria-hidden />
        太字
      </button>
      <button
        type="button"
        onClick={onLink}
        className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-sub text-foreground hover:bg-muted"
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        リンク
      </button>
    </div>
  );
}
