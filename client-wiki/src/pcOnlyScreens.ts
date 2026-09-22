/**
 * Wiki — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭に書いてあります。
 * Wiki は**現場でスマホで読む**のが主な使い方（docs/design/v4/wiki.md §6-⑧）なので、
 * PC 向きは「2つの版を横に並べて比べる」画面だけです。
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

export const WIKI_PC_ONLY: PcOnlyEntry[] = [
  {
    path: '/p/:id/history',
    what: 'ページの履歴（2つの版の違い）',
    why: '2つの版を左右に並べて、行ごとに追加と削除を見比べる画面です。この幅では1行が何度も折り返して、どこが変わったのかが読み取れません。',
    // 版の一覧（いつ・誰が・何を変えたか）はページの右の「履歴」で読める
    instead: { label: 'ページを開いて履歴を見る', to: '/' },
  },
  {
    path: '/templates',
    what: 'テンプレート管理',
    why: '一覧と本文を左右に並べて見比べる画面です。この幅では本文が1行ずつ折り返して、どのテンプレートを選んでいるのかが分からなくなります。',
    // テンプレートから作ること自体は「ページを追加」でスマホでもできる
    instead: { label: 'ページを追加する', to: '/' },
  },
];

/**
 * **スマホの左メニューから落とすルート**（`hidden: true` の分）。
 * シェルに渡すと、スマホのときだけ項目が消えます。**ルートは生きています。**
 */
export const WIKI_MOBILE_HIDDEN = WIKI_PC_ONLY.filter((e) => e.hidden).map((e) => e.path);

/**
 * **スマホで触る／読む画面。** ここと `WIKI_PC_ONLY` のどちらにも入っていない
 * ルートがあると `npm run lint` が止まります（決めないまま出さないため）。
 */
export const WIKI_MOBILE_OK: string[] = [
  '/',            // ホーム
  '/s/:key',      // スペースのツリー
  '/p/:id',       // ページ（読む）
  '/p/:id/edit',  // ページの編集 — スマホでも使える（設計 §6-⑨）。下のツールバーは5つに絞る
];
