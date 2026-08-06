/**
 * 日常業務の左メニュー — **中身は今までと1項目も変えていない**。
 *
 * v4 で入れ替えたのは枠 (`shared/src/client/shell/`) だけで、
 * 項目・並び・ラベルは旧 `Sidebar.tsx` からそのまま持ってきています。
 * 情報設計 (項目を減らす・並べ替える・呼び名を変える) は Phase 4 で相談します。
 */
import {
  LayoutDashboard,
  ListChecks,
  CalendarCheck,
  Newspaper,
  DoorOpen,
  FileText,
  Inbox,
  KeyRound,
  Search,
} from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';

export const DAILY_NAV: ShellNavSection[] = [
  {
    items: [{ label: 'ホーム', to: '/', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'メニュー',
    items: [
      { label: 'タスク・依頼', to: '/tasks', icon: ListChecks },
      { label: 'ウィークリー活動報告', to: '/weekly', icon: CalendarCheck },
      { label: 'デイリーニュース報告', to: '/news', icon: Newspaper },
      { label: '内覧会 来場予約', to: '/inview', icon: DoorOpen },
      // v4 ⑥: 画面は財務管理へ移した (`/budget/documents`)。`/finance` は転送だけ。
      // **項目は消せない** — `dailyops` だけの人はアプリ切替に財務管理が出ないので、
      // ここを消すと辿り着く道が無くなる (行き先の権限は budget か dailyops のどちらか)
      { label: '受け取った書類', to: '/finance', icon: FileText },
      { label: 'その他問い合わせ', to: '/inquiries', icon: Inbox },
      { label: 'セキュリティカード', to: '/security-cards', icon: KeyRound },
    ],
  },
];

/**
 * スマホ下端のタブ。
 *
 * v4 の決めごとは **ホーム / やること / 検索** の3つですが、
 * 日常業務にはまだ「検索」の画面がありません。無い画面のタブを置くと
 * 押しても何も起きないので、**いまはメニューを開くタブ**にしてあります。
 * Phase 6 (スマホ) で検索の画面を作るときに差し替えます。
 */
export const DAILY_MOBILE_TABS: ShellMobileTab[] = [
  { label: 'ホーム', to: '/', icon: LayoutDashboard, end: true },
  { label: 'やること', to: '/tasks', icon: ListChecks },
  { label: 'メニュー', icon: Search, action: 'menu' },
];
