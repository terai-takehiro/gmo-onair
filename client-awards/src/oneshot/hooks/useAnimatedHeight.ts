import { useEffect, useRef, type DependencyList } from 'react';
import { PANEL_HEIGHT_MS } from '../animation/timings';

// パネルの高さを実測して px で animate (auto→auto をスムーズに繋ぐ)。
// v2.8.73+: ResizeObserver ベースに切替え。SlotSwitcher の 3 フェーズ
// (exit → resize → enter) でコンテンツが mount/unmount するたびに
// scrollHeight が変化 → 自動で height 補間が走る。
//
// 第一引数 deps は後方互換のため残置 (空配列推奨)。再 mount や ref 切替
// 時に Observer を貼り直すための dep だけに使用。
export function useAnimatedHeight<T extends HTMLElement>(
  _deps: DependencyList = [],
  duration = PANEL_HEIGHT_MS,
) {
  const ref = useRef<T | null>(null);
  const prevHeight = useRef<number | null>(null);
  const currentAnim = useRef<Animation | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const newHeight = el.scrollHeight;
      if (prevHeight.current == null) {
        prevHeight.current = newHeight;
        return;
      }
      if (Math.abs(prevHeight.current - newHeight) < 0.5) return;

      const from = prevHeight.current;
      const to = newHeight;
      if (currentAnim.current) {
        currentAnim.current.cancel();
        currentAnim.current = null;
      }
      const anim = el.animate(
        [{ height: from + 'px' }, { height: to + 'px' }],
        { duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'none' }
      );
      currentAnim.current = anim;
      anim.onfinish = () => {
        if (currentAnim.current === anim) currentAnim.current = null;
      };
      prevHeight.current = newHeight;
    });
    observer.observe(el);
    // 初期高さを記録
    prevHeight.current = el.scrollHeight;

    return () => {
      observer.disconnect();
      if (currentAnim.current) {
        currentAnim.current.cancel();
        currentAnim.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return ref;
}
