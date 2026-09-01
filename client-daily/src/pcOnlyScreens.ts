/**
 * 日常業務 — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭に書いてあります。
 * このアプリは**現場で開くもの**が多いので、PC 向きはごく少数です。
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

/**
 * ⚠️ **いまは 0 件です**（247）。
 *
 * 唯一残っていた「入ってきた情報」を外しました。日常業務は**現場で開くアプリ**
 * なのに、仕分けの机だけスマホから開けず、探す画面から押しても案内に着いて
 * 行き止まりになっていました（`SearchPage.tsx` にその但し書きが残っていたほど）。
 * 表の列を折り返すのではなく**スマホ専用の2行カード**（`inquiries/InquiryCards.tsx`）
 * に組み直しています（`client/src/contexts/gpm/pages/taskList/TaskCards.tsx` と同じ作り）。
 *
 * 空でも**この表は消さないこと** — `scripts/check-mobile-declared.mjs` が
 * この2つの表と `App.tsx` のルートを突き合わせています。
 */
export const DAILY_PC_ONLY: PcOnlyEntry[] = [];

/**
 * **スマホの左メニューから落とすルート**（`hidden: true` の分）。
 * シェルに渡すと、スマホのときだけ項目が消えます。**ルートは生きています。**
 */
export const DAILY_MOBILE_HIDDEN = DAILY_PC_ONLY.filter((e) => e.hidden).map((e) => e.path);

/**
 * **スマホで触る／読む画面。** ここと `DAILY_PC_ONLY` のどちらにも入っていない
 * ルートがあると `npm run lint` が止まります（決めないまま出さないため）。
 */
export const DAILY_MOBILE_OK: string[] = [
  '/',                 // ホーム
  '/tasks',            // やること
  '/weekly',           // 週報（読む）
  '/weekly/:id',
  '/news',             // デイリーニュース（読む）
  '/inview',           // 内覧会（開催日を選ぶ）
  '/inview/:date',     // 当日の受付 — **現場でいちばん使う**
  '/security-cards',   // カードの貸出・返却
  '/search',           // 探す — **スマホの下タブ3つ目**（M9）
  '/inquiries',        // 入ってきた情報 — 247 で PC 専用をやめた（スマホは2行カード）
];
