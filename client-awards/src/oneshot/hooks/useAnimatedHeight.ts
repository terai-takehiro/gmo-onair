import { useEffect, useRef, type DependencyList } from 'react';
import { PANEL_HEIGHT_MS } from '../animation/timings';

// パネルの高さを実測して px で animate (auto→auto をスムーズに繋ぐ)。
//
// v2.8.83+: 「ぴくつく瞬間」修正:
// 進行中アニメを cancel して再開すると、各フレームで anim 再起動が走り視覚的に
// twitch する (特に width transition 中に scrollHeight が連続変化する場合)。
// 修正方針:
// 1. アニメ実行中は新しい trigger を無視して完走させる
// 2. アニメ終了時に最終 scrollHeight が target と一致しているか再確認、ズレてれば追加アニメ
// これで「1 回の滑らかなアニメ + 必要なら follow-up」のシンプルな動きに。
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

    let scheduledFrame: number | null = null;
    let pendingTarget: number | null = null;

    const triggerAnim = () => {
      scheduledFrame = null;
      if (pendingTarget == null) return;

      // 進行中アニメがあれば cancel せず完走させる (twitch 防止)
      if (currentAnim.current && currentAnim.current.playState === 'running') {
        return;
      }

      const target = pendingTarget;
      pendingTarget = null;

      const fromActual = el.getBoundingClientRect().height;
      if (Math.abs(fromActual - target) < 0.5) {
        prevHeight.current = target;
        return;
      }

      try {
        const anim = el.animate(
          [{ height: fromActual + 'px' }, { height: target + 'px' }],
          { duration, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'none' }
        );
        currentAnim.current = anim;
        anim.onfinish = () => {
          if (currentAnim.current === anim) currentAnim.current = null;
          if (!el.isConnected) return;
          // アニメ終了時の最終 scrollHeight が target からずれていれば
          // (= 途中で content が再フローしていたら) 1 度だけ follow-up
          const finalHeight = el.scrollHeight;
          if (Math.abs(target - finalHeight) > 0.5) {
            pendingTarget = finalHeight;
            if (scheduledFrame == null) {
              scheduledFrame = requestAnimationFrame(triggerAnim);
            }
          }
          prevHeight.current = finalHeight;
        };
      } catch {
        // 古いブラウザで el.animate 未対応時は CSS 自然遷移にフォールバック
      }
      prevHeight.current = target;
    };

    const observer = new ResizeObserver(() => {
      const newHeight = el.scrollHeight;
      if (prevHeight.current == null) {
        prevHeight.current = newHeight;
        return;
      }
      if (Math.abs(prevHeight.current - newHeight) < 0.5) return;
      pendingTarget = newHeight;
      if (scheduledFrame == null) {
        scheduledFrame = requestAnimationFrame(triggerAnim);
      }
    });
    observer.observe(el);
    prevHeight.current = el.scrollHeight;

    return () => {
      observer.disconnect();
      if (scheduledFrame != null) {
        cancelAnimationFrame(scheduledFrame);
        scheduledFrame = null;
      }
      if (currentAnim.current) {
        currentAnim.current.cancel();
        currentAnim.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return ref;
}
