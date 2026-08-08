/**
 * スマホの「下端に固定した主アクション」の置き場所 (docs/design/v4/_rules.md「3. スマホ」)
 *
 * 決めごとはこうです:
 *
 * > 主要アクションは**画面下部に固定した大きなボタン**。
 * > 下部固定の主アクションは共通シェルが置きます
 * > (`<PageHeader primaryAction={...}>` を宣言すると、PC では右上・スマホでは下端固定)。
 * > **73画面が個別に `fixed bottom-0` を書かないこと。**
 *
 * ── なぜ「状態」ではなく「差し込み口の DOM」を配るのか ──────────
 *
 * 素直に書くと「PageHeader が context に ReactNode を `setState` して、
 * シェルがそれを描く」形になりますが、これは**毎描画で新しい要素が来る**ので
 * 「描画 → setState → 再描画」が回り続けます (deps に要素は置けない)。
 *
 * そこで**シェルが空の `<div>` を1つ用意して、その DOM 要素だけを配ります**。
 * `PageHeader` は `createPortal` でそこへ描きます。中身は PageHeader の
 * React ツリーのままなので、状態も onClick もそのまま動き、
 * シェル側は再描画しません。
 *
 * ── なぜ `fixed` にしないのか ────────────────────────────────
 *
 * 差し込み口はシェルの縦並び (上辺バー → 本文 → **ここ** → 下タブ) の中にあります。
 * `position: fixed` にすると本文の最後の行がボタンの下に隠れるので、
 * 画面ごとに下余白を足して回ることになります (足し忘れると最後の行が押せない)。
 * 普通の流れに置けば、本文のスクロール領域が勝手にその分縮みます。
 *
 * 中身が無いときは `empty:hidden` で消えます (罫線だけが残らない)。
 */
import { createContext, useContext } from 'react';

/** シェルが用意する差し込み口。まだ無い (シェルの外・初回描画) ときは `null` */
export const PrimaryActionSlotContext = createContext<HTMLElement | null>(null);

/**
 * スマホの主アクションを描く先。
 * `null` のときは差し込み口が無い ＝ **PC 側の表示だけにする**
 * (シェルの外で `<PageHeader>` を使う画面が、下端に何も出せずに落ちないため)。
 */
export function usePrimaryActionSlot(): HTMLElement | null {
  return useContext(PrimaryActionSlotContext);
}


/* ═══════════════════════════════════════════════════════════════════
   ページ名の差し込み口（M7）
   ───────────────────────────────────────────────────────────────────
   **スマホでページ名が二重に出ていました。** 上辺バーはアプリ切替のチップ
   （「案件管理 ▾」）に幅を使い、そのすぐ下で本文が「案件一覧」ともう一度
   名乗ります。**64px の帯が現在地を1文字も伝えていない**状態でした。

   スマホでは**上辺バーがページ名を出し、本文の大見出しは消します**。
   仕組みは主アクションとまったく同じ（シェルが空の要素を1つ配り、
   `PageHeader` が `createPortal` でそこへ描く）。
   状態を配ると「描画 → setState → 再描画」が回り続けるため、
   **配るのは DOM 要素だけ**です。

   ⚠️ **まだ `PageTitle`（v4 より前の見出し）を使っている画面が 38 あります。**
   その画面は何も描かないので差し込み口は空のままです。上辺バーは
   **空のときだけアプリ名に戻します**（`tokens-v4.css` の
   `[data-shell-title]:not(:empty) + [data-shell-applabel]` で切り替え）。
   ここを JS で判定すると、`PageHeader` が描くたびにシェルが再描画します。
   ═══════════════════════════════════════════════════════════════════ */

/** シェルが用意するページ名の差し込み口。シェルの外では `null` */
export const PageTitleSlotContext = createContext<HTMLElement | null>(null);

/**
 * ページ名を描く先。`null` のときは**本文の見出しをそのまま出す**
 * （シェルの外で `<PageHeader>` を使う画面が、名前を失わないため）。
 */
export function usePageTitleSlot(): HTMLElement | null {
  return useContext(PageTitleSlotContext);
}
