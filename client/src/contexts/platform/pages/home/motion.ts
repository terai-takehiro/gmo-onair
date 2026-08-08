/**
 * トップページの動き（スクロールで出す・数字を数え上げる）
 *
 * ── 既定は「見える」──────────────────────────────────────────
 *
 * `useReveal()` が返す ref を付けた要素は、**JS が動いたときだけ**
 * `data-reveal="hidden"` が付き、画面に入ると `shown` に変わります。
 * CSS で先に隠して JS で見せる形にすると、**JS が落ちた日に
 * トップページが白紙**になります（しかも誰も気づけない壊れ方をする）。
 *
 * ── 一度だけ ────────────────────────────────────────────────
 *
 * 出たら監視を外します。上下にスクロールするたびに出入りすると、
 * 読み返すときに毎回ちらつきます。
 */
import { useEffect, useRef, useState } from 'react';

/** 動きを減らす設定か。**当たったら何もしない**（隠しもしない） */
function reduced(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `IntersectionObserver` が無い環境（古い端末）でも**そのまま見える**
    if (reduced() || typeof IntersectionObserver === 'undefined') return;

    el.dataset.reveal = 'hidden';
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.reveal = 'shown';
          io.unobserve(e.target);
        }
      },
      // 少しでも見えたら出す。下端ぴったりを待つと、短い画面で出ない節が残る
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}

/**
 * 数字を数え上げる（620ms・ease-out）。
 *
 * **`value` が確定してから動きます。** 読み込み中の `undefined` では
 * 0 を出しません — 0 件だと読まれてから増えるのが一番まぎらわしい。
 * 動きを減らす設定の人には最初から最終値を返します。
 */
export function useCountUp(value: number | undefined, durationMs = 620): number | undefined {
  const [shown, setShown] = useState<number | undefined>(value);
  const from = useRef(0);

  useEffect(() => {
    if (value === undefined) { setShown(undefined); return; }
    if (reduced() || typeof requestAnimationFrame === 'undefined' || value === from.current) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const diff = value - start;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      // ease-out（最後をゆっくり止める）。等速だと数字が回っているだけに見える
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(start + diff * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return shown;
}
