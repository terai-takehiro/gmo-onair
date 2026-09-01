/**
 * 上に引っ張って再取得する（スマホの一覧・M11「純粋な操作感の演出」）
 *
 * ── 何のために作ったか ──────────────────────────────────────
 *
 * v4 の一覧画面はどれも react-query の `useQuery` でデータを持っており、
 * 再取得の手段は `ErrorPanel` の「もう一度読み込む」（失敗したときだけ）しか
 * 無かった。スマホでは「上に引っ張って更新する」が iOS ネイティブアプリの
 * 一般的な操作感で、失敗していなくても最新の状態を自分で確かめたい場面
 * （他の人が触った直後の一覧など）で使う。
 *
 * ── 実装の決めごと ──────────────────────────────────────────
 *
 * - **一覧を丸ごと包むだけ**（呼び出し側はラップするだけで使える）。
 *   中身のカード・行の実装には一切手を入れない
 * - **スクロール可能な祖先を自分で探す**（`findScrollParent`）。
 *   v4 のシェルはページごとに `overflow-y: auto` を持たず、
 *   共通シェルの `<main>`（`shared/src/client/shell/AppShell.tsx`）が
 *   ページをまたいで1つだけ持つため、`ref` で直接渡してもらう形にしない
 * - **祖先が最上部（`scrollTop === 0`）のときだけ**引っ張りを受け付ける。
 *   スクロール中に受け付けると、ふつうのスクロールが引っ張りに化ける
 * - **押している間だけ `transition` を切る**（`tokens-v4.css` の決めごと
 *   「`transition: all` を使わない」と同じ理由 — 指に追従する動きに
 *   遅延の transition を掛けると、指から遅れて動いているように見える）
 * - **`disabled` は opt-in ではなく呼び出し側が明示する。** PC では
 *   タッチイベントが飛ばないので実害は無いが、指標の枠だけ残るのを避けるため
 *   `useIsMobile()` の結果をそのまま渡してもらう
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { cn } from '../client/utils';

/** 引っ張れる最大の高さ（px）。ここまで来ると指を離せば必ず動く */
const MAX_PULL = 64;
/** 離したときに再取得へ入る境目（px） */
const TRIGGER = 52;
/** 生の移動量に掛ける抵抗（1 だと指と同じ速さで伸び、iOS のゴムのような重さが出ない） */
const RESISTANCE = 0.5;

/** `wrap` の祖先から、縦にスクロールできる最初の要素を探す（v4 シェルの `<main>`） */
function findScrollParent(el: HTMLElement): HTMLElement | Element | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return document.scrollingElement;
}

function usePullToRefresh({ onRefresh, disabled }: {
  onRefresh: () => Promise<unknown> | unknown;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollParentRef = useRef<Element | null>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (disabled) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    scrollParentRef.current = findScrollParent(wrap);

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      const sp = scrollParentRef.current;
      if (!sp || sp.scrollTop > 0) { pulling.current = false; return; }
      startY.current = e.touches[0].clientY;
      pulling.current = true;
      setDragging(true);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const sp = scrollParentRef.current;
      if (dy <= 0 || (sp && sp.scrollTop > 0)) {
        // 上へ戻した、または途中で本文がスクロールし始めた → 引っ張りをやめる
        pulling.current = false;
        setDragging(false);
        setPull(0);
        return;
      }
      // ここから下は「引っ張っている」として扱う。ネイティブのバウンスと二重に
      // 動かないよう、確定してから止める（決めごと通り止め方を用意する）
      e.preventDefault();
      setPull(Math.min(dy * RESISTANCE, MAX_PULL));
    };
    const onTouchEnd = () => {
      if (!pulling.current) { setDragging(false); return; }
      pulling.current = false;
      setDragging(false);
      setPull((d) => {
        if (d >= TRIGGER) {
          setRefreshing(true);
          Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
        }
        return 0;
      });
    };

    wrap.addEventListener('touchstart', onTouchStart, { passive: true });
    wrap.addEventListener('touchmove', onTouchMove, { passive: false });
    wrap.addEventListener('touchend', onTouchEnd, { passive: true });
    wrap.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart);
      wrap.removeEventListener('touchmove', onTouchMove);
      wrap.removeEventListener('touchend', onTouchEnd);
      wrap.removeEventListener('touchcancel', onTouchEnd);
    };
    // `refreshing` を依存に入れているのは、更新中に指を離した／触れ直したときに
    // 二重で走らせないため（`onTouchStart` の中で毎回いちばん新しい値を見る）
  }, [disabled, onRefresh, refreshing]);

  return { wrapRef, dragging, pull, refreshing };
}

/**
 * `usePullToRefresh` を薄く包んだ部品。呼び出し側は一覧をこれで包むだけでよい。
 *
 * ```tsx
 * <PullToRefresh onRefresh={() => query.refetch()} disabled={!isMobile}>
 *   <ProjectCards rows={rows} … />
 * </PullToRefresh>
 * ```
 */
export function PullToRefresh({ onRefresh, disabled, children }: {
  onRefresh: () => Promise<unknown> | unknown;
  /** PC など、引っ張る手段が無い場面では素通りさせる（`useIsMobile()` の否定を渡す） */
  disabled?: boolean;
  children: ReactNode;
}) {
  const { wrapRef, dragging, pull, refreshing } = usePullToRefresh({ onRefresh, disabled });

  if (disabled) return <>{children}</>;

  const indicatorHeight = refreshing ? 40 : pull;
  const armed = pull >= TRIGGER;

  return (
    <div ref={wrapRef} className="relative">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-center justify-center overflow-hidden text-muted-foreground',
          !dragging && 'transition-[height] duration-200 motion-reduce:transition-none',
        )}
        style={{ height: indicatorHeight }}
      >
        {refreshing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="sr-only">更新しています</span>
          </>
        ) : indicatorHeight > 0 ? (
          <ArrowDown
            className={cn('h-5 w-5 transition-transform', armed && 'rotate-180')}
            aria-hidden="true"
          />
        ) : null}
      </div>
      {children}
    </div>
  );
}
