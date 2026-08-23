/**
 * 共通シェル (S2) — v4 対象3アプリだけが使う
 *
 *   上辺バー 64px ＋ 左メニュー 248px ＋ スマホ下タブ
 *
 * **凍結3アプリは載せ替えません** (`client-techops` / `client-live` /
 * `client-awards` は `src/components/layout/` の旧シェルのまま)。
 *
 * 使い方:
 * ```tsx
 * <AppShell appKey="dailyops" sections={NAV} user={currentUser} onLogout={logout}
 *           role={currentUser?.role} permissions={currentUser?.permissions}>
 *   <Outlet />
 * </AppShell>
 * ```
 *
 * **`<NoticeBar />` と `<ConfirmHost />` はシェルが持ちます。** アプリ側に置かないこと。
 */
export { AppShell } from './AppShell';
export { AppTopbar } from './AppTopbar';
export { AppSideMenu } from './AppSideMenu';
export { MobileTabs } from './MobileTabs';
export type {
  ShellNavItem,
  ShellNavSection,
  ShellMobileTab,
  ShellUser,
  ShellAccess,
  ShellChrome,
} from './types';
