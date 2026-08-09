/**
 * 横スクロールのレール（掴んで滑らせる帯）
 *
 * 「自動で届いたもの」のように**カードを横に並べる帯**で使います。
 * 素の `overflow-x:auto` だと PC ではマウスで掴めず、スクロールバーを探すか
 * `shift` を押しながらホイールを回すことになります。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**ドラッグで動かし、離すと慣性で滑って止まる**（減衰 0.94）。
 *    止め方を作らないと、指を離した位置で急に固まって「引っかかった」と感じます
 *  ・**8px 動くまではクリック扱い。10px を超えたら直後のクリックを1回だけ捨てる。**
 *    カードを掴もうとしただけで中身が開いてしまう誤爆を止めます。
 *    `preventDefault` で殺すのではなく**1回だけ捨てる**のは、
 *    掴まずに押したときは今までどおり開けなければならないためです
 *  ・**縦ホイールを横送りに変換する。** 帯の上でホイールを回すと、
 *    普通は後ろのページが動いてしまい「このカードの続きが見られない」になります
 *  ・**続きがある側だけ端を溶かす**（`mask-image`）。両端を固定で溶かすと、
 *    いちばん端まで来たときに**まだ続きがあるように見えます**
 *  ・**動きを減らす設定の人には慣性を付けない。** 掴んだぶんだけ動いて止まります
 *
 * ── 使い方 ──────────────────────────────────────────────────
 *
 *   const rail = useRail();
 *   <div ref={rail.ref} onScroll={rail.onScroll} className="flex overflow-x-auto" style={rail.style}>…</div>
 *   {rail.canLeft && <button onClick={() => rail.nudge(-1)}>…</button>}
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** 1回押したときに送る量（カードの幅ぶん）。中身を測れないので固定値でよい */
const NUDGE = 248;
/** これ以上動いたらドラッグ扱い（＝クリックを捨てる） */
const DRAG_THRESHOLD = 10;
/** 慣性の減衰。1 に近いほど長く滑る */
const FRICTION = 0.94;
/** これ以下になったら止める（px/フレーム） */
const STOP_AT = 0.4;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Rail {
  ref: (el: HTMLDivElement | null) => void;
  /** 続きがあるか。左右の丸ボタンの出し分けに使う */
  canLeft: boolean;
  canRight: boolean;
  /** 端を溶かす `mask-image`。**続きがある側だけ**掛かる */
  style: React.CSSProperties;
  nudge: (dir: -1 | 1) => void;
  /** スクロールしたことをこのフックに伝える（端の判定を describe し直す） */
  onScroll: () => void;
}

export function useRail(): Rail {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 1px は端数（拡大率・小数の幅）。0 で比べると端に着いても消えないことがある
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  /**
   * 掴む・滑らせる・捨てる。**`ref` のコールバックで直に付ける** —
   * `useEffect` で付けると、中身（カードの枚数）が変わって
   * 要素が作り直された回に**リスナーの付いていない帯**ができます。
   */
  const attach = useCallback((el: HTMLDivElement | null) => {
    const prev = elRef.current;
    if (prev) (prev as HTMLDivElement & { __railCleanup?: () => void }).__railCleanup?.();
    elRef.current = el;
    if (!el) return;

    let down = false;
    let startX = 0;
    let startScroll = 0;
    let moved = 0;
    let lastX = 0;
    let velocity = 0;
    let raf = 0;
    /** ドラッグ直後のクリックを1回だけ捨てるための旗 */
    let swallowClick = false;

    const glide = () => {
      velocity *= FRICTION;
      if (Math.abs(velocity) < STOP_AT) { raf = 0; return; }
      el.scrollLeft -= velocity;
      measure();
      raf = requestAnimationFrame(glide);
    };

    const onPointerDown = (e: PointerEvent) => {
      // 右クリック・戻る進むボタンでは掴まない
      if (e.button !== 0) return;
      down = true;
      moved = 0;
      velocity = 0;
      startX = lastX = e.clientX;
      startScroll = el.scrollLeft;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      // **8px 動くまでは何もしない。** 押しただけの手ぶれでスクロールしない
      if (moved < 8) return;
      // 掴んだ時点で「ドラッグ中」に切り替える。以後テキスト選択させない
      el.setPointerCapture?.(e.pointerId);
      velocity = e.clientX - lastX;
      lastX = e.clientX;
      el.scrollLeft = startScroll - dx;
      measure();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      el.releasePointerCapture?.(e.pointerId);
      if (moved > DRAG_THRESHOLD) {
        swallowClick = true;
        if (!prefersReducedMotion() && Math.abs(velocity) > STOP_AT) raf = requestAnimationFrame(glide);
      }
    };

    /** 捨てるのは**1回だけ**。掴まずに押したときは今までどおり開ける */
    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    /**
     * 縦ホイールを横送りに変換。**横に振れているホイールはそのまま**
     * （横スクロール付きの機器で二重に動く）。
     * 端に着いているときは `preventDefault` しない — ページが動かなくなる。
     */
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = el.scrollLeft + e.deltaY;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollLeft = next;
      measure();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('wheel', onWheel, { passive: false });

    (el as HTMLDivElement & { __railCleanup?: () => void }).__railCleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('wheel', onWheel);
    };

    measure();
  }, [measure]);

  // 幅が変わると端の判定も変わる（メニューを畳んだ・端末を回した）
  useEffect(() => {
    const on = () => measure();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [measure]);

  const nudge = useCallback((dir: -1 | 1) => {
    const el = elRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * NUDGE, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  /**
   * 端を溶かす。**続きがある側だけ**。
   * `mask-image` は「見せる側を白」で書く。左に続きがあるなら左端を透明にする。
   */
  const fade = 28;
  const from = edges.left ? `transparent 0, #000 ${fade}px` : '#000 0';
  const to = edges.right ? `#000 calc(100% - ${fade}px), transparent 100%` : '#000 100%';
  const mask = `linear-gradient(to right, ${from}, ${to})`;

  return {
    ref: attach,
    canLeft: edges.left,
    canRight: edges.right,
    style: { WebkitMaskImage: mask, maskImage: mask, scrollSnapType: 'x proximity' },
    nudge,
    onScroll: measure,
  };
}
