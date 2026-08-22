/**
 * 制作技術支援（旧「制作資料」）の左メニュー — **中身は今までの `Sidebar.tsx` のまま**（3項目）。
 *
 * 情報設計はまだ変えない（`shared/src/client/shell/types.ts` の決めごと通り、
 * 今回入れ替えるのは枠だけ）。旧 `Sidebar.tsx` にあった以下を引き継ぐ:
 *
 *   ドキュメント一覧 → `/qsheet/sheets`
 *   スケジュール表   → `/qsheet/schedules`
 *   収録・配信設定   → `/qsheet/device-settings`
 *
 * ── `to` が `/qsheet/...` で始まる理由 ──────────────────────────
 *
 * このアプリはルーターの `basename` を持たず、Vite の `base: '/qsheet/'` だけで
 * 動いている（`client-equipment/src/components/layout/nav.ts` と同じ事情）。
 * 共通シェルは接頭辞を知らないので、ここに閉じ込める。
 *
 * ── 引き継いでいないもの（判断） ────────────────────────────────
 *
 * - **トップ（`/qsheet/home`・案件を選ぶ画面）はまだメニューに出さない。**
 *   `routeSwitch.ts` の `QSHEET_ROOT` はまだ `'list'` のまま（利用者の確認が
 *   取れたら `'home'` に切り替える設計）で、旧 `Sidebar.tsx` も一度もここへ
 *   リンクしていなかった。今回はシェルの載せ替えだけが目的なので、
 *   まだ表に出ていない画面を新たに導線へ加えない
 * - **「新規作成」ボタンはメニューから外した。** 旧 `Sidebar.tsx` のそれは
 *   一覧へ飛んで `[data-create-btn]` を `querySelector` で探して自動クリックする
 *   ショートカットで、`ShellNavItem` はリンク（`to`）しか持てず同じ挙動を
 *   再現できない。`SheetListPage.tsx` 自身に同じ「新規作成」ボタンが既にあるので
 *   （`data-create-btn`）、機能そのものは失われない（一覧を開いてから押す1手間が増えるだけ）
 */
import { LayoutDashboard, CalendarDays, Settings2 } from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';

export const QSHEET_NAV: ShellNavSection[] = [
  {
    items: [
      { label: 'ドキュメント一覧', to: '/qsheet/sheets', icon: LayoutDashboard },
      { label: 'スケジュール表', to: '/qsheet/schedules', icon: CalendarDays },
      { label: '収録・配信設定', to: '/qsheet/device-settings', icon: Settings2 },
    ],
  },
];

/**
 * スマホ下端のタブ。**3本**（`docs/design/v4/_rules.md`「3. スマホ」）。
 *
 * 他の2アプリは3つ目を専用の検索画面（`/search`）に向けているが、
 * 制作技術支援には現状そのような画面が無い（`SheetListPage.tsx` の中の絞り込みのみ）。
 * 新しく検索画面を作るのは今回のシェル載せ替えの範囲を超えるため、
 * ここでは左メニューと同じ3項目をそのままタブにする（判断）。
 */
export const QSHEET_MOBILE_TABS: ShellMobileTab[] = [
  { label: 'ドキュメント', to: '/qsheet/sheets', icon: LayoutDashboard },
  { label: 'スケジュール', to: '/qsheet/schedules', icon: CalendarDays },
  { label: '設定', to: '/qsheet/device-settings', icon: Settings2 },
];
