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
 * - **「新規作成」ボタンはメニューから外した。** 旧 `Sidebar.tsx` のそれは
 *   一覧へ飛んで `[data-create-btn]` を `querySelector` で探して自動クリックする
 *   ショートカットで、`ShellNavItem` はリンク（`to`）しか持てず同じ挙動を
 *   再現できない。`SheetListPage.tsx` 自身に同じ「新規作成」ボタンが既にあるので
 *   （`data-create-btn`）、機能そのものは失われない（一覧を開いてから押す1手間が増えるだけ）
 *
 * ⚠️ **2026-08-22（ご指摘）: 「トップ」を先頭に足した。** アプリ全体のトップ
 * （`/qsheet/top`・`ProductionTopPage.tsx`）を新設し、`routeSwitch.ts` の
 * `QSHEET_ROOT` も `'top'` に切り替えたため、この画面へ戻る導線が要る。
 * スマホ下タブには足していない（3本の枠は変えない・上辺バーのロゴから
 * `/qsheet` = `/qsheet/top` へ戻れる）。
 */
import { LayoutDashboard, LayoutGrid, CalendarDays, Settings2 } from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';

export const QSHEET_NAV: ShellNavSection[] = [
  {
    items: [
      { label: 'トップ', to: '/qsheet/top', icon: LayoutGrid },
      { label: 'ドキュメント一覧', to: '/qsheet/sheets', icon: LayoutDashboard },
      { label: 'スケジュール表', to: '/qsheet/schedules', icon: CalendarDays },
      { label: '収録・配信設定', to: '/qsheet/device-settings', icon: Settings2 },
    ],
  },
];

/**
 * スマホ下端のタブ。**3本**（`docs/design/v4/_rules.md`「3. スマホ」）。
 *
 * ⚠️ **2026-08-22（ご指摘・ご指示で差し替え）: 「トップ」が無かった。**
 * 段3当時は「他の2アプリは3つ目を専用の検索画面（`/search`）に向けているが、
 * 制作技術支援にはそのような画面が無いので左メニューと同じ3項目をそのまま
 * タブにする」という判断でこの3本にしていた。だが `/qsheet/top` を新設して以来、
 * **この画面へ戻る導線が上辺バーのロゴだけになっており**、スマホでは戻りにくい。
 *
 * ここで「設定」（収録・配信設定の簡易入口 `/qsheet/device-settings`）を落として
 * 「トップ」に差し替えた。収録設定・配信設定はハブ画面（`JourneyPage.tsx`）の
 * ミニアプリタイルから `panelPathOf` で直接開けるため、簡易入口を経由しなくても
 * 迷わない（`client-qsheet/CLAUDE.md`「番組・案件の選び方とミニアプリのハブ」参照）。
 */
export const QSHEET_MOBILE_TABS: ShellMobileTab[] = [
  { label: 'トップ', to: '/qsheet/top', icon: LayoutGrid },
  { label: 'ドキュメント', to: '/qsheet/sheets', icon: LayoutDashboard },
  { label: 'スケジュール', to: '/qsheet/schedules', icon: CalendarDays },
];
