/**
 * 日常業務 — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭に書いてあります。
 * このアプリは**現場で開くもの**が多いので、PC 向きはごく少数です。
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

export const DAILY_PC_ONLY: PcOnlyEntry[] = [
  {
    path: '/inquiries',
    what: '入ってきた情報',
    why: '差出人・要件・希望日・人数・予算が横に並ぶ一覧で、仕分けて案件にするまでを続けて行う画面です。',
    instead: { label: 'やることを開く', to: '/tasks' },
  },
];

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
];
