import { useLayoutEffect, useRef, type DependencyList } from 'react';
import { PANEL_HEIGHT_MS } from '../animation/timings';

// パネルの高さを実測して px で animate (auto→auto をスムーズに繋ぐ)
export function useAnimatedHeight<T extends HTMLElement>(deps: DependencyList, duration = PANEL_HEIGHT_MS) {
  const ref = useRef<T | null>(null);
  const prevHeight = useRef<number | null>(null);
  const currentAnim = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (currentAnim.current) {
      currentAnim.current.cancel();
      currentAnim.current = null;
    }
    const newHeight = el.scrollHeight;
    if (prevHeight.current != null && prevHeight.current !== newHeight) {
      const from = prevHeight.current;
      const to = newHeight;
      const anim = el.animate(
        [{ height: from + 'px' }, { height: to + 'px' }],
        { duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'none' }
      );
      currentAnim.current = anim;
      anim.onfinish = () => {
        if (currentAnim.current === anim) currentAnim.current = null;
      };
    }
    prevHeight.current = newHeight;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
