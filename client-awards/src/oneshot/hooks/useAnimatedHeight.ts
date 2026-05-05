import { useEffect, useRef, type DependencyList } from 'react';
import { PANEL_HEIGHT_MS } from '../animation/timings';

// パネルの高さを実測して px で animate (auto→auto をスムーズに繋ぐ)。
// v2.8.73+: ResizeObserver ベースに切替え。SlotSwitcher の 3 フェーズ
// (exit → resize → enter) でコンテンツが mount/unmount するたびに
// scrollHeight が変化 → 自動で height 補間が走る。
//
// v2.8.75+: 「画面揺れ」バグ修正:
// 1. 連続発火する ResizeObserver イベントを requestAnimationFrame で coalesce
// 2. 進行中アニメをキャンセルして新規開始するときは「現在の実 box 高さ」(rect.height)
//    を `from` として使用 → 古い prevHeight にジャンプして揺れる現象を解消
// 3. アニメ終了時に prevHeight を最新の scrollHeight に同期 (drift 補正)
// 4. width transition 中の連続的な scrollHeight 変化 (overflow:hidden + 内容リフロー)
//    にも対応 — 1 フレーム coalesce で最後の値だけが反映される
//
// 第一引数 deps は後方互換のため残置 (空配列推奨)。
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
      const target = pendingTarget;
      pendingTarget = null;

      // 現在の実 box 高さを from に使う (アニメ進行中も滑らか)
      const fromActual = el.getBoundingClientRect().height;
      if (Math.abs(fromActual - target) < 0.5) {
        prevHeight.current = target;
        return;
      }

      // 既存アニメをキャンセル
      if (currentAnim.current) {
        currentAnim.current.cancel();
        currentAnim.current = null;
      }
      try {
        // v2.8.78: 'cubic-bezier(.4,0,.2,1)' (Material 標準) → expoOut '.16,1,.3,1'
        // で「すっと動いて柔らかく止まる」自然なリサイズ感に
        const anim = el.animate(
          [{ height: fromActual + 'px' }, { height: target + 'px' }],
          { duration, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'none' }
        );
        currentAnim.current = anim;
        anim.onfinish = () => {
          if (currentAnim.current === anim) currentAnim.current = null;
          // アニメ終了後、prevHeight を実際の scrollHeight に同期 (drift 補正)
          if (el.isConnected) prevHeight.current = el.scrollHeight;
        };
      } catch {
        // 古いブラウザで el.animate 未対応の場合: 何もしない (CSS 自然遷移にフォールバック)
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

      // 連続発火を 1 フレームに集約 (width transition 中の連続変化を coalesce)
      pendingTarget = newHeight;
      if (scheduledFrame == null) {
        scheduledFrame = requestAnimationFrame(triggerAnim);
      }
    });
    observer.observe(el);
    // 初期高さを記録
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
