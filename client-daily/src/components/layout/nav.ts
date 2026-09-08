/**
 * 日常業務の左メニュー (v4)
 *
 * ── 3つの塊にした ───────────────────────────────────────────
 *
 * v4 のモックの並び。「メニュー」という見出しの下に7項目をべた並べしていたのを、
 * **やることの種類**でまとめた:
 *
 *   定期報告     決まった周期で出すもの (週・日)
 *   届いたもの   外から来て、こちらが仕分けるもの
 *   現場の受付   その日その場で人と向き合うもの
 *
 * ── 消せないもの ────────────────────────────────────────────
 *
 * ・**受領書類 (`/finance`)** — 画面は財務管理へ移した (`/budget/documents`)
 *   が、`dailyops` だけの人はアプリ切替に財務管理が出ないので、**ここを消すと
 *   辿り着く道が無くなる**。行き先の権限は `sales` か `dailyops` のどちらか
 *   （`budget` 区画は権限モデル単純化で `sales` に統合済み）
 * ・**タスク・依頼 (`/tasks`)** — トップページのタイルとタスクのカードから
 *   ここへ来る導線がある (`client/src/contexts/platform/pages/home/{AppTiles,TaskHubCard}.tsx`)。
 *   案件管理へ寄せるかどうかは別の作業
 */
import {
  CalendarCheck,
  DoorOpen,
  FileText,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MessageSquareWarning,
  Newspaper,
  Search,
} from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';

export const DAILY_NAV: ShellNavSection[] = [
  {
    items: [
      { label: 'ホーム', to: '/', icon: LayoutDashboard, end: true },
      { label: 'タスク・依頼', to: '/tasks', icon: ListChecks },
    ],
  },
  {
    title: '定期報告',
    items: [
      { label: 'ウィークリー活動報告', to: '/weekly', icon: CalendarCheck },
      { label: 'デイリーニュース報告', to: '/news', icon: Newspaper },
    ],
  },
  {
    title: '届いたもの',
    items: [
      { label: '問い合わせ', to: '/inquiries', icon: Inbox },
      { label: 'フィードバックチケット', to: '/feedback-tickets', icon: MessageSquareWarning },
      /*
        **画面は財務管理にある**（`/budget/documents`）。ここを消すと
        `dailyops` だけの人はアプリ切替に財務管理が出ないので辿り着けない。

        ⚠️ **押すと別のアプリへ全画面で移ります**（別バンドルなので画面が一度白くなる）。
        それを黙って起こすと「メニューを押したのに知らない画面に飛んだ」になるので、
        右端の札で行き先のアプリ名を出す（シェルの `tag`。`external` は使わない —
        あれは別タブで開く外部リンク用で、ここは同じタブで移る）。
      */
      { label: '受領書類', to: '/finance', icon: FileText, tag: '財務管理' },
    ],
  },
  {
    title: '現場の受付',
    items: [
      { label: '内覧会 来場予約', to: '/inview', icon: DoorOpen },
      { label: 'セキュリティカード', to: '/security-cards', icon: KeyRound },
    ],
  },
];

/**
 * スマホ下端のタブ。**v4 の決めごとどおり ホーム / やること / 探す**（M9）。
 *
 * 3つ目は長らく「メニューを開く」でした（検索の画面が無かったため）。
 * ですが**メニューは上辺バーの ☰ からも開けます** — 3枠しかないうちの1枠を
 * 二重の入口に使っていて、決めごとにある検索がどこにも無い状態でした。
 * `/search` を作って本来の形に戻しています。
 */
export const DAILY_MOBILE_TABS: ShellMobileTab[] = [
  { label: 'ホーム', to: '/', icon: LayoutDashboard, end: true },
  { label: 'やること', to: '/tasks', icon: ListChecks },
  { label: '探す', to: '/search', icon: Search },
];
