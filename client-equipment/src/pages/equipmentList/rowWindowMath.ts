/**
 * 「見えている行だけ描く」ための**素の算数**（機材台帳）
 *
 * ここには DOM も React も出てきません。貼り付ける側は `useRowWindow.ts`。
 * ⚠️ **分けてあるのは検査のためです** — ここの間違いはどれも画面を見て
 * 気づけないので、`shared/tests/equipmentLedgerRows.test.ts` が
 * **間違った書き方だと落ちる**形で固定しています。
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

/**
 * **端に着いているかどうか**。着いていたらそこまで必ず描く。
 *
 * ⚠️ **これが無いと、最後の数行にたどり着けません**（実測）。
 * 位置は「1行ぶんの送り幅 × 行数」で見積もりますが、行の高さは
 * **1px も違わないわけではありません**（スマホのカードは実測 122.42px と
 * 122.97px が混ざる）。0.5px の差でも **3,800 行なら 1,900px** になり、
 * 見積もりの終わりが実物より下に来ます。すると**いちばん下まで送っても
 * 「まだ下に 4 枚ある」と判断され、白いところが残ったまま止まります**
 * （エラーは出ません）。
 *
 * 送りきった／戻りきったときだけ**見積もりを信じず端まで描く**ことで、
 * 見積もりが多少ずれていても**最初と最後は必ず出ます**。
 */
export interface Edges {
  /** いちばん上まで戻りきっている */
  atStart?: boolean;
  /** いちばん下まで送りきっている */
  atEnd?: boolean;
}

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
  { scrollTop, viewportH, listTop, pitch, gap = 0, count, overscan = OVERSCAN, atStart, atEnd }:
  {
    scrollTop: number; viewportH: number; listTop: number;
    pitch: number; gap?: number; count: number; overscan?: number;
  } & Edges,
): RowWindow {
  if (count <= MIN_ROWS_TO_WINDOW || pitch <= 0) {
    return { start: 0, end: count, padTop: 0, padBottom: 0 };
  }
  const clamp = (n: number) => Math.min(Math.max(n, 0), count);
  // 一覧の先頭から見た、いま見えている範囲
  const from = scrollTop - listTop;
  const outside = offscreen(from, viewportH, count * pitch, count);
  let start = outside ? outside.start : clamp(Math.floor(from / pitch) - overscan);
  let end = outside ? outside.end : Math.max(clamp(Math.ceil((from + viewportH) / pitch) + overscan), start);
  if (atStart) start = 0;
  if (atEnd) end = count;
  if (end < start) end = start;
  const after = Math.max(count - end, 0);
  return {
    start,
    end,
    padTop: start > 0 ? start * pitch - gap : 0,
    padBottom: after > 0 ? after * pitch - gap : 0,
  };
}

/**
 * 一覧そのものが画面の外にあるとき、**1行も描かない**ための判定。
 *
 * ⚠️ これが無いと、**画面の外にある一覧も「のぞき見ぶん」だけ描きます**。
 * 一覧が1つなら気になりませんが、貸出機材のタブは**カテゴリごとに
 * 一覧を持つ**ので、6 カテゴリなら**見えていない 5 つがそれぞれ 13 枚**
 * 描いて 78 枚が無駄になります（実測: DOM 2,238 個のうち大半がこれでした）。
 */
function offscreen(from: number, viewportH: number, total: number, count: number) {
  if (from + viewportH <= 0) return { start: 0, end: 0 };        // 一覧はまだ下にある
  if (from >= total) return { start: count, end: count };        // 一覧はもう上に流れた
  return null;
}

/**
 * 行ごとに高さが違うとき用。**上からの積み上げ（`offsets`）で決める。**
 *
 * ── なぜ別の式が要るか ──────────────────────────────────────
 *
 * 貸出機材のタブは「型番ごとのカード」が並びますが、**開くと中に1台ずつの行が
 * 生えて高さが変わります**。1行ぶんの送り幅を1つに決める `rowWindow` では、
 * 開いた塊のぶんだけ位置がずれていきます。
 *
 * `offsets[i]` は**一覧の先頭から数えた i 行目の上端**（隙間も込み）。
 * `offsets[count]` は最後の行の下端 ＋ 隙間1つぶんです。
 * 出す `padTop` / `padBottom` の意味と、**隙間を1つ引く**ところは
 * `rowWindow` と同じなので、`offsets[i] = i × pitch` を入れれば
 * `rowWindow` と同じ答えになります（`shared/tests/` で突き合わせてある）。
 */
export function varRowWindow(
  { scrollTop, viewportH, listTop, offsets, gap = 0, overscan = OVERSCAN, atStart, atEnd }:
  {
    scrollTop: number; viewportH: number; listTop: number;
    offsets: number[]; gap?: number; overscan?: number;
  } & Edges,
): RowWindow {
  const count = Math.max(offsets.length - 1, 0);
  if (count <= MIN_ROWS_TO_WINDOW || offsets[count] <= 0) {
    return { start: 0, end: count, padTop: 0, padBottom: 0 };
  }
  const clamp = (n: number) => Math.min(Math.max(n, 0), count);
  const from = scrollTop - listTop;

  /** `offsets[i] <= y` を満たす最大の i（＝ y の位置にある行） */
  const rowAt = (y: number) => {
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
    }
    return lo;
  };

  const outside = offscreen(from, viewportH, offsets[count], count);
  let start = outside ? outside.start : clamp(rowAt(from) - overscan);
  let end = outside ? outside.end : Math.max(clamp(rowAt(from + viewportH) + 1 + overscan), start);
  if (atStart) start = 0;
  if (atEnd) end = count;
  if (end < start) end = start;
  return {
    start,
    end,
    padTop: start > 0 ? offsets[start] - gap : 0,
    padBottom: end < count ? offsets[count] - offsets[end] - gap : 0,
  };
}

/**
 * 行ごとの高さから積み上げを作る。`gap` は行と行のあいだの隙間。
 *
 * `offsets[i] = 高さ[0..i-1] の合計 ＋ i × gap`
 */
export function rowOffsets(heights: number[], gap = 0): number[] {
  const out = new Array(heights.length + 1);
  out[0] = 0;
  for (let i = 0; i < heights.length; i++) out[i + 1] = out[i] + heights[i] + gap;
  return out;
}

