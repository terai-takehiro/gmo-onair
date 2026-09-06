/**
 * 「見えている行だけ描く」を DOM に貼り付ける（機材台帳）
 *
 * 算数は `rowWindowMath.ts`。ここは**流れる親を見つけて、測って、
 * 描く範囲を返す**係だけを持ちます。
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
import {
  ESTIMATED_ROW_H, rowOffsets, rowWindow, varRowWindow,
  type Edges, type RowWindow,
} from './rowWindowMath';

export * from './rowWindowMath';

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

/**
 * 最初の一手は**0 行**。
 *
 * ⚠️ **ここを「とりあえず 80 行」にすると、間引く前に 80 行ぶん作ります。**
 * 一覧が1つならすぐ直りますが、貸出機材のタブは**カテゴリごとに一覧を持つ**ので、
 * 9 カテゴリなら **720 枚**を作ってから捨てることになります
 * （捨てる前の「作る費用」は払い終わっています）。
 *
 * 0 で始めても画面がちらつきません — 範囲を決め直すのは `useLayoutEffect`、
 * つまり**ブラウザが描く前**だからです。
 */
const EMPTY_WINDOW: RowWindow = { start: 0, end: 0, padTop: 0, padBottom: 0 };

/**
 * いちばん近い「縦に流れる親」。無ければ `null`（＝窓）。
 *
 * ⚠️ **`overflow-y` の値だけで決めてはいけません。** CSS は片方の軸を
 * `visible` 以外にすると**もう片方を自動で `auto` に格上げ**します。
 * 機材台帳の表は横に流すために `overflow-x-auto` を持っているので、
 * **計算後の `overflow-y` も `auto`** です。値だけで選ぶとこの枠を掴み、
 * その `clientHeight` は**中身の高さそのもの（20万 px）**なので
 * 「画面に全部入っている」と判断して**全 3,800 行を描きます**
 * （実測。間引きが丸ごと効かなくなる）。
 *
 * **縦にはみ出しているかどうか**で見分けます。これが正しい見分け方ですが、
 * **中身を描く前は誰もはみ出していません**。だから `read()` のたびに
 * 探し直し、見つかったら**そのときに聞き耳を立て直します**
 * （見つかるまでは窓を相手にする）。
 */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * いま端に着いているか（1px の余裕。小数の誤差で端と見なされないのを防ぐ）。
 *
 * ⚠️ **まだ流れない入れ物では、どちらも「着いていない」とすること。**
 * 描き始めは 0 行なので中身が短く、**何もしなくても「いちばん下まで
 * 見えている」状態**です。そこで「端だから最後まで描く」を当てると、
 * **初回に全件を描いてしまい間引きが丸ごと効きません**
 * （実測: 767px で 3,800 枚すべてを作っていた）。
 */
function edgesOf(scroller: HTMLElement | null): Edges {
  const top = scroller ? scroller.scrollTop : window.scrollY;
  const view = scroller ? scroller.clientHeight : window.innerHeight;
  const full = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
  if (full <= view + 1) return {};
  return { atStart: top <= 1, atEnd: top + view >= full - 1 };
}

/**
 * 流れる親を見つけ、そこに聞き耳を立てる（2つのフックで共通）。
 *
 * **見つかった相手が変わったら付け直します。** 0 行から描き始めるので、
 * 最初は誰もはみ出しておらず窓が相手になります。行が出てはみ出した
 * ところで `<main>` に切り替わる、という順に必ずなります。
 */
function useScrollHost(listRef: React.RefObject<HTMLElement>, read: () => void) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const frame = useRef(0);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      read();
      setHost((prev) => {
        const now = scrollParentOf(listRef.current);
        return now === prev ? prev : now;
      });
    });
  }, [listRef, read]);

  useLayoutEffect(() => {
    read();
    setHost(scrollParentOf(listRef.current));
  }, [listRef, read]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const target: HTMLElement | Window = host ?? window;
    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // 上の絞り込みが開いたり畳んだりすると一覧の先頭の位置が動く
    const ro = new ResizeObserver(schedule);
    ro.observe(list);
    if (host) ro.observe(host);
    return () => {
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [listRef, host, schedule]);

  return schedule;
}

/**
 * 一覧の DOM に貼り付けて、描く範囲を返す。
 *
 * @param listRef 行を並べている入れ物（この中に上下の空の箱と行が入る）
 * @param count   行の総数
 */
export function useRowWindow(listRef: React.RefObject<HTMLElement>, count: number): RowWindow {
  const [win, setWin] = useState<RowWindow>(EMPTY_WINDOW);
  /** 実測した1行ぶんの送り幅と隙間。測れるまでは見積もりを使う */
  const pitch = useRef(ESTIMATED_ROW_H);
  const gap = useRef(0);

  const read = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    /*
     * 送り幅は**実物の行から測る**（`data-eq-row`）。
     * 1行の高さだけ測ると、`gap` で並べている一覧（スマホのカード）で
     * 1枚あたり 8px ずつ足りなくなるので、**行の頭どうしの間隔**を測る。
     * 編集モードや列の出し入れで高さが変わるので毎回測り直す。
     *
     * ⚠️ **先頭の2行だけで決めないこと。** 商品名が2行になる行とならない行が
     * 混ざるようになったので（`EquipmentCells.tsx` の `line-clamp-2`）、
     * たまたま上の2行が短いと送り幅を低く見積もり、**下に行くほど
     * 描く範囲と実際の位置がずれます**。**見えている行ぜんぶの平均**
     * （先頭から末尾までの距離 ÷ 間隔の数）にすると、混ざり方に寄らず
     * 実際の平均に収束します。
     */
    const sample = list.querySelectorAll<HTMLElement>('[data-eq-row]');
    if (sample.length >= 1) {
      const first = sample[0].getBoundingClientRect();
      if (first.height > 0) {
        if (sample.length >= 2) {
          const last = sample[sample.length - 1].getBoundingClientRect();
          const p = (last.top - first.top) / (sample.length - 1);
          // 隙間は「送り幅 − 1行の高さ」。行の高さがまちまちなので**いちばん低い行**を
          // 高さとみなす（高いほうで引くと隙間が 0 に潰れ、カードの一覧で足りなくなる）
          let minH = first.height;
          for (const el of sample) {
            const h = el.getBoundingClientRect().height;
            if (h > 0 && h < minH) minH = h;
          }
          if (p > 0) { pitch.current = p; gap.current = Math.max(p - minH, 0); }
        } else {
          pitch.current = first.height; gap.current = 0;
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
      ...edgesOf(scroller),
    });
    setWin((prev) => (
      prev.start === next.start && prev.end === next.end
        && prev.padTop === next.padTop && prev.padBottom === next.padBottom
        ? prev : next
    ));
  }, [listRef, count]);

  // 流れる親を見つけて聞き耳を立てるところは2つのフックで共通
  useScrollHost(listRef, read);

  return win;
}

/** `useVarRowWindow` に渡す1行。`height` は**計算で出した見積もり** */
export interface VarRow {
  /** 行を見分ける鍵。DOM 側に `data-eq-key` で同じものを書くこと */
  key: string;
  /** 見積もりの高さ（px）。実物を描けたら実測で上書きする */
  height: number;
}

/**
 * 行ごとに高さが違う一覧を間引く。
 *
 * ── 見積もり ＋ 実測の二段構え ──────────────────────────────
 *
 * **見積もりは呼ぶ側が計算します**（貸出機材なら「カード ＋ 開いていれば
 * 台数 × 1台ぶんの高さ」）。描いていない行の高さも数式で出せるので、
 * **「すべて開く」を押した瞬間にスクロールバーが正しい長さになります**。
 * 実測だけに頼る作りだと、描いていない行は高さが分からないので
 * **送るほどスクロールバーが伸びていく**（今までの見え方と変わる）。
 *
 * ⚠️ **それでも実測で上書きします。** 台の下に出る「↳ 付属品」の行は
 * 折り返すので、数式だけでは何行になるか決まりません。描けた行はそのつど
 * 測って覚え、次の積み上げに使います（**0.5px 以上ずれたときだけ**
 * 覚え直す — 端数で覚え直し続けると描き直しが止まりません）。
 */
export function useVarRowWindow(
  listRef: React.RefObject<HTMLElement>,
  rows: VarRow[],
): RowWindow & { typical: number | null } {
  const [win, setWin] = useState<RowWindow & { typical: number | null }>(
    () => ({ ...EMPTY_WINDOW, typical: null }),
  );
  /** 実測して覚えた高さ（鍵 → px） */
  const measured = useRef(new Map<string, number>());
  const gap = useRef(0);
  // 積み上げの計算に使う「いまの行」。`read` を作り直さずに最新を見る
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const read = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const current = rowsRef.current;

    // 描けている行を測って覚える（鍵は DOM の `data-eq-key`）
    const drawn = list.querySelectorAll<HTMLElement>('[data-eq-row][data-eq-key]');
    for (const el of drawn) {
      const key = el.dataset.eqKey;
      if (!key) continue;
      const h = el.getBoundingClientRect().height;
      if (h <= 0) continue;
      const before = measured.current.get(key);
      if (before === undefined || Math.abs(before - h) > 0.5) measured.current.set(key, h);
    }
    // 隙間は連続する2行の「下端から次の上端まで」
    if (drawn.length >= 2) {
      const g = drawn[1].getBoundingClientRect().top - drawn[0].getBoundingClientRect().bottom;
      if (g >= 0) gap.current = g;
    }

    const offsets = rowOffsets(
      current.map((r) => measured.current.get(r.key) ?? r.height),
      gap.current,
    );

    const scroller = scrollParentOf(list);
    const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
    const viewportH = scroller ? scroller.clientHeight : window.innerHeight;
    const listTop = scroller
      ? list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      : list.getBoundingClientRect().top + window.scrollY;

    /**
     * **いちばん低かった実測値**を呼ぶ側に返す。
     *
     * 呼ぶ側は「まだ描いていない行」の高さを数式で見積もりますが、
     * その土台（畳んだカード1枚の高さ）は**幅で変わります**
     * （スマホでは行が折り返して背が高くなる）。ここで実物のいちばん低い
     * ものを返せば、**畳んだカードの実寸**がそのまま土台になります。
     * 決め打ちにすると、スマホで見積もりが足りず**送るほど
     * スクロールバーが伸びていきます**。
     */
    let typical: number | null = null;
    for (const h of measured.current.values()) if (typical === null || h < typical) typical = h;

    const next = varRowWindow({
      scrollTop, viewportH, listTop, offsets, gap: gap.current, ...edgesOf(scroller),
    });
    setWin((prev) => (
      prev.start === next.start && prev.end === next.end
        && prev.padTop === next.padTop && prev.padBottom === next.padBottom
        && prev.typical === typical
        ? prev : { ...next, typical }
    ));
  }, [listRef]);

  const schedule = useScrollHost(listRef, read);

  // 行の並びや開閉が変わったら読み直す（鍵と高さの並びを見る）
  const shape = rows.map((r) => `${r.key}:${r.height}`).join('|');
  useLayoutEffect(() => { schedule(); }, [schedule, shape]);

  return win;
}
