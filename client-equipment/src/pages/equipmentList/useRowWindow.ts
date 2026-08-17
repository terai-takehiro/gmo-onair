/**
 * 一覧の「いま見えている行だけ描く」ための仕掛け（機材台帳）
 *
 * ── なぜ要るか（実測）──────────────────────────────────────
 *
 * 機材 5,000 点（親 3,800 点）の台帳を実ブラウザで開くと **30.7 秒**かかり、
 * そのうち **28.2 秒は画面が固まったまま**でした（いちばん長い1回で 17.5 秒）。
 * 内訳は DB でもサーバーでもありません — **DB 42ms・API 140ms** で、
 * 残りは全部**ブラウザが 3,800 行ぶんの DOM を作っていた時間**です。
 * DOM の要素は **260,177 個**ありました。
 *
 * 行を作る費用は行数に比例するので、**画面に入る数（数十行）だけ作れば
 * 台帳が何点になっても速さは変わりません**。上下に「無い行のぶんの高さ」を
 * 空の箱で置くので、スクロールバーの長さと位置は今までと同じです。
 *
 * ── 少ない行のときは何もしない ──────────────────────────────
 *
 * `MIN_ROWS_TO_WINDOW` 行までは全部描きます。数十行なら作る費用は元から
 * 小さく、**間引くと Ctrl+F（ブラウザの検索）で当たらない行ができる**ほうが
 * 害が大きいためです。⚠️ この一線を下げるときは、その害と釣り合うか考えること。
 *
 * ── 縦に流れるのは `<main>` であって窓ではない ──────────────
 *
 * 共通シェル（`shared/src/client/shell/AppShell.tsx`）は
 * `<main className="overflow-y-auto">` を持っており、**`window.scrollY` は
 * ずっと 0 のまま**です。だから「いちばん近い流れる親」を自分で探します
 * （見つからなければ窓を使う）。ここを窓に決め打ちすると、
 * **スクロールしても描く行が変わらず、最初の数十行しか出ない画面**になります。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** これ以下の行数なら間引かない（間引く害のほうが大きい） */
export const MIN_ROWS_TO_WINDOW = 80;

/** 画面の外に余分に描く行数（上下それぞれ）。速いスクロールで白が見えないだけ持つ */
export const OVERSCAN = 12;

/** 高さを測れるまで使う1行の高さ（px）。`density="table"` の実測値 */
export const ESTIMATED_ROW_H = 41;

/**
 * 間引く一覧の入れ物に**必ず**付ける指定。
 *
 * ⚠️ **これが無いと、いちばん下まで送りきれません**（実測）。
 * Chrome は「上の中身が伸び縮みしても見ている場所を保つ」ために
 * スクロール位置を勝手に戻します（scroll anchoring）。上に置く空の箱は
 * 送るたびに何十万 px も伸び縮みするので、**この気遣いが毎回こちらを押し戻し**、
 * カードの一覧では底から **2,062px 手前で止まって動かなく**なりました
 * （残り4枚が出てこない。エラーは出ません）。
 */
export const WINDOWED_LIST_STYLE = { overflowAnchor: 'none' } as const;

export interface RowWindow {
  /** 描き始める行の番号（含む） */
  start: number;
  /** 描き終わる行の番号（含まない） */
  end: number;
  /** 上に置く空の箱の高さ */
  padTop: number;
  /** 下に置く空の箱の高さ */
  padBottom: number;
}

/**
 * 描く範囲を決める**素の算数**（テストで固定するためここだけ分けてある）。
 *
 * ── `gap` を引くのを忘れないこと ────────────────────────────
 *
 * スマホのカードは `flex flex-col gap-2` で並んでいるので、
 * **1枚ぶんの送り幅は「カードの高さ ＋ 8px」**です（`pitch`）。
 * さらに、上下に置く空の箱も flex の子なので**その両隣にも隙間が入ります**。
 * だから箱の高さは `n × pitch` ではなく **`n × pitch − gap`**。
 * 引き忘れると、送るたびに 8px ずつ位置がずれていきます
 * （PC の表は隙間 0 なので `gap = 0`＝今までと同じ式になる）。
 *
 * @param scrollTop  流れる親のスクロール位置
 * @param viewportH  流れる親の見えている高さ
 * @param listTop    流れる親の中身の原点から見た、一覧の先頭の位置
 * @param pitch      1行ぶんの送り幅（行の高さ ＋ 行間の隙間）
 * @param gap        行間の隙間（PC の表は 0）
 * @param count      行の総数
 */
export function rowWindow(
  { scrollTop, viewportH, listTop, pitch, gap = 0, count, overscan = OVERSCAN }:
  {
    scrollTop: number; viewportH: number; listTop: number;
    pitch: number; gap?: number; count: number; overscan?: number;
  },
): RowWindow {
  if (count <= MIN_ROWS_TO_WINDOW || pitch <= 0) {
    return { start: 0, end: count, padTop: 0, padBottom: 0 };
  }
  const clamp = (n: number) => Math.min(Math.max(n, 0), count);
  // 一覧の先頭から見た、いま見えている範囲
  const from = scrollTop - listTop;
  const start = clamp(Math.floor(from / pitch) - overscan);
  const end = Math.max(clamp(Math.ceil((from + viewportH) / pitch) + overscan), start);
  const after = Math.max(count - end, 0);
  return {
    start,
    end,
    padTop: start > 0 ? start * pitch - gap : 0,
    padBottom: after > 0 ? after * pitch - gap : 0,
  };
}

/** いちばん近い「縦に流れる親」。無ければ `null`（＝窓） */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * 一覧の DOM に貼り付けて、描く範囲を返す。
 *
 * @param listRef 行を並べている入れ物（この中に上下の空の箱と行が入る）
 * @param count   行の総数
 */
export function useRowWindow(listRef: React.RefObject<HTMLElement>, count: number): RowWindow {
  const [win, setWin] = useState<RowWindow>(() => ({
    start: 0,
    end: Math.min(count, MIN_ROWS_TO_WINDOW),
    padTop: 0,
    padBottom: 0,
  }));
  /** 実測した1行ぶんの送り幅と隙間。測れるまでは見積もりを使う */
  const pitch = useRef(ESTIMATED_ROW_H);
  const gap = useRef(0);
  const frame = useRef(0);

  const read = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    /*
     * 送り幅は**実物の2行から測る**（`data-eq-row`）。
     * 1行の高さだけ測ると、`gap` で並べている一覧（スマホのカード）で
     * 1枚あたり 8px ずつ足りなくなります。
     * 編集モードや列の出し入れで高さが変わるので毎回測り直す。
     */
    const sample = list.querySelectorAll<HTMLElement>('[data-eq-row]');
    if (sample.length >= 1) {
      const h = sample[0].getBoundingClientRect().height;
      if (h > 0) {
        if (sample.length >= 2) {
          const p = sample[1].getBoundingClientRect().top - sample[0].getBoundingClientRect().top;
          if (p > 0) { pitch.current = p; gap.current = Math.max(p - h, 0); }
        } else {
          pitch.current = h; gap.current = 0;
        }
      }
    }

    const scroller = scrollParentOf(list);
    const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
    const viewportH = scroller ? scroller.clientHeight : window.innerHeight;
    const listTop = scroller
      ? list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      : list.getBoundingClientRect().top + window.scrollY;

    const next = rowWindow({
      scrollTop, viewportH, listTop, pitch: pitch.current, gap: gap.current, count,
    });
    setWin((prev) => (
      prev.start === next.start && prev.end === next.end
        && prev.padTop === next.padTop && prev.padBottom === next.padBottom
        ? prev : next
    ));
  }, [listRef, count]);

  /** スクロールは1フレームに1回だけ読む（1回ごとに読むと描き直しが詰まる） */
  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; read(); });
  }, [read]);

  useLayoutEffect(() => { read(); }, [read]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const scroller = scrollParentOf(list);
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // 上の絞り込みが開いたり畳んだりすると一覧の先頭の位置が動く
    const ro = new ResizeObserver(schedule);
    ro.observe(list);
    if (scroller) ro.observe(scroller);
    return () => {
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [listRef, schedule]);

  return win;
}
