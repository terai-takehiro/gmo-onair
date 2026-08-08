/**
 * スクロールで下から出る枠（トップページの各節・カード）
 *
 * **既定は「見える」。** 隠すのは JS が `data-reveal="hidden"` を付けたときだけで、
 * JS が動かない環境では普通に見えます（CSS で先に隠すと、JS が落ちた日に
 * トップページが白紙になり、しかも誰も気づけません）。
 */
import type { ReactNode } from 'react';
import { useCountUp, useReveal } from './motion';

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return <div ref={ref} className={className}>{children}</div>;
}

/** 数字を数え上げて出す（挨拶の件数・タイルの件数バッジ） */
export function CountUp({ n }: { n: number }) {
  // 実装は `motion.ts`。ここは「数字だけ」を出す薄い部品にしてある
  // （囲みの色や大きさは呼ぶ側が決める — 場所ごとに違うため）
  const shown = useCountUp(n);
  return <>{shown ?? n}</>;
}
