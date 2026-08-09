/**
 * 並び替え・絞り込みで行を滑らせる（FLIP）
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * 一覧の並び順を変えると、行は**一瞬で入れ替わります**。同じ見た目の行が
 * 20 個あるので、「いま見ていた案件がどこへ行ったか」が読み取れません。
 * 動かす**前の位置を覚えておいて、動いた後に元の位置へ戻してから
 * 1回だけ元に戻す**と、行が滑って見えます（First / Last / Invert / Play）。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**再測定をループさせない。** 動かすのは1回だけで、終わったら印を外します。
 *    毎フレーム測り直すと、滑っている途中の位置を「元の位置」として覚えて
 *    永久に追いかけっこになります
 *  ・**行に一意の鍵（`data-flip-key`）を持たせる。** 位置だけで覚えると、
 *    絞り込みで行数が変わったときに別の案件どうしを結んでしまいます。
 *    `data-row`（`ui/row.tsx` が付ける検査の印・`verify-ui.mjs` が読む）とは
 *    **別の属性**にしてあります — 意味を兼ねさせると、片方の都合で値を変えたときに
 *    もう片方が黙って壊れます
 *  ・**シート・モーダルを閉じる更新と同時に測らない。** 閉じるのは次のコマに回します
 *    （`closeAfterFrame`）。閉じている最中に測ると、消えかけの高さが混ざって
 *    行が飛びます
 *  ・**動きを減らす設定の人には何もしない。** CSS 側でも止めていますが、
 *    ここでも測らないことで無駄な処理ごと省きます
 *
 * ── 使い方 ──────────────────────────────────────────────────
 *
 *   const flip = useFlip(containerRef);
 *   // 並びが変わる操作の**直前**に呼ぶ
 *   <button onClick={() => { flip.capture(); setSort(next); }}>
 *   // 中身が変わったら呼ぶ（`useEffect` の依存に並び替えの鍵を入れる）
 *   useEffect(() => { flip.play(); }, [rows]);
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';

function reduced(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Flip {
  /** 並びが変わる**直前**に呼ぶ。いまの位置を覚える */
  capture: () => void;
  /**
   * その鍵が**この更新で新しく現れた**か。新しい行は滑らせず、
   * **8px 下からフェードイン**させます（`data-row-in`）。
   *
   * 元から居た行を一緒にフェードさせると、絞り込むたびに一覧全体が明滅して
   * 「読み込み直した」ように見えます。
   */
  isNew: (key: string) => boolean;
  /** 中身が変わったあとに呼ぶ。覚えた位置から1回だけ滑らせる */
  play: () => void;
  /**
   * シートを閉じるなど、**閉じる動きと並び替えを同じ回でやるとき**に使う。
   * 閉じるのを次のコマに回してから測ります。
   */
  /** いま並んでいる鍵を渡す。**描く前に1回だけ**（`isNew` の元になる） */
  sync: (keys: string[]) => void;
  closeAfterFrame: (close: () => void) => void;
}

export function useFlip(container: RefObject<HTMLElement | null>): Flip {
  /** 鍵 → 直前の上端。**位置ではなく鍵で覚える** */
  const before = useRef<Map<string, number>>(new Map());
  /**
   * 前回この一覧に出ていた鍵。**描くたびに更新する**（`play` ではなく）—
   * `play` は動きを減らす設定のとき何もしないので、そこで更新すると
   * その人だけ全行が永久に「新しい行」になります。
   */
  const seen = useRef<Set<string>>(new Set());
  const fresh = useRef<Set<string>>(new Set());

  const capture = useCallback(() => {
    const root = container.current;
    if (!root || reduced()) return;
    const map = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('[data-flip-key]').forEach((el) => {
      const key = el.dataset.flipKey;
      if (key) map.set(key, el.getBoundingClientRect().top);
    });
    before.current = map;
  }, [container]);

  const play = useCallback(() => {
    const root = container.current;
    if (!root || reduced() || before.current.size === 0) return;
    const prev = before.current;
    // **1回で使い切る。** 残しておくと、次の再描画でも同じ「昔の位置」から
    // 滑ってしまい、動かしていないのに一覧が揺れます
    before.current = new Map();

    const moves: { el: HTMLElement; dy: number }[] = [];
    root.querySelectorAll<HTMLElement>('[data-flip-key]').forEach((el) => {
      const key = el.dataset.flipKey;
      if (!key) return;
      const was = prev.get(key);
      if (was === undefined) return;         // 新しく現れた行は `data-row-in` が担当
      const dy = was - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;          // 動いていない行は触らない
      moves.push({ el, dy });
    });
    if (moves.length === 0) return;

    // Invert: いまの位置から**元居た場所**へずらす（この時点では動きを付けない）
    for (const { el, dy } of moves) {
      el.style.transform = `translateY(${dy}px)`;
    }
    // Play: 次のコマで印を付けて transform を外す。**1回だけ**
    requestAnimationFrame(() => {
      for (const { el } of moves) {
        el.dataset.flip = 'run';
        el.style.transform = '';
      }
    });

    // 終わったら印を外す。付けっぱなしにすると、ページをめくったときにも滑る
    const done = () => {
      for (const { el } of moves) {
        delete el.dataset.flip;
        el.style.transform = '';
      }
    };
    window.setTimeout(done, 480);
  }, [container]);

  /**
   * いま並んでいる鍵を渡して、新しく現れたものを覚える。
   * **描く前に1回だけ**呼びます（描画のたびに数え直すと、
   * 同じ行が2回フェードインします）。
   */
  const sync = useCallback((keys: string[]) => {
    const next = new Set(keys);
    const added = new Set<string>();
    // **最初の読み込みでは何も「新しい」としない。** 一覧を開いた瞬間に
    // 20 行が順に立ち上がると、読み込みが遅いと受け取られます
    if (seen.current.size > 0) {
      for (const k of keys) if (!seen.current.has(k)) added.add(k);
    }
    fresh.current = added;
    seen.current = next;
  }, []);

  const closeAfterFrame = useCallback((close: () => void) => {
    requestAnimationFrame(() => close());
  }, []);

  // 画面を離れるときに印を残さない（戻ってきたときに1行だけ滑る）
  useEffect(() => () => { before.current = new Map(); seen.current = new Set(); }, []);

  return {
    capture,
    play,
    sync,
    isNew: (key: string) => fresh.current.has(key),
    closeAfterFrame,
  };
}
