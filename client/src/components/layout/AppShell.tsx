import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppShell as SharedAppShell } from "@gmo-onair/shared/src/client/shell";
import { appOfPath } from "@gmo-onair/shared/src/client/apps";
import { ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { useAuth } from "@/contexts/platform/AuthContext";
import { SALES_MANUAL } from "@/manual/content";
import GlobalSearch from "./GlobalSearch";
import { CLIENT_MOBILE_TABS, CLIENT_NAV } from "./nav";

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * 画面が例外で落ちたときの受け皿。**真っ白にしない**のが目的。
 * P3 で入れた `ErrorPanel` に寄せてあるので、文言と見た目が他の画面とそろう。
 */
class PageErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PageErrorBoundary] Caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-2xl p-6">
          <ErrorPanel
            title="この画面を表示できませんでした"
            cause={{
              cause: '画面の組み立て中に問題が起きました。',
              next: '前の画面に戻るか、ホームからやり直してください。',
            }}
            onRetry={() => {
              this.setState({ hasError: false });
              window.history.back();
            }}
            retryLabel="前の画面に戻る"
            action={
              <button
                type="button"
                className="text-list min-h-tap rounded-control bg-primary px-4 text-primary-foreground"
                onClick={() => {
                  this.setState({ hasError: false });
                  window.location.href = "/";
                }}
              >
                ホームへ
              </button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 案件管理・財務管理・カレンダー・システム管理のシェル — **枠は共通**
 * (`shared/src/client/shell/`)。
 *
 * ── 入口が4つあるアプリ ──────────────────────────────────────
 *
 * URL から今いる入口を判定し (`appOfPath`)、その入口の左メニューだけを出します。
 * トップページ (`/`) はどの入口でもないので**左メニューを出しません**
 * (旧実装と同じ挙動 — 旧 Sidebar は `useActiveApp()` が null のとき自分で
 *  `return null` していました)。
 *
 * 旧実装にあった `/admin` の特例と、アプリ名・色の捏造 (`?? "システム管理"` /
 * `?? "bg-slate-500"`) は**両方不要になりました** — `admin` がアプリ登録に載ったためです。
 *
 * ── グローバル検索 ───────────────────────────────────────────
 *
 * 上辺バーの `searchSlot` に差し込みます。共通シェルは中身を知りません
 * (案件管理だけが持つ機能なので、シェルに畳み込むと他の2アプリが背負う)。
 */
export default function AppShell() {
  const { pathname } = useLocation();
  const { currentUser, logout, hasPermission, permissions } = useAuth();

  const app = appOfPath(pathname);
  const sections = app ? (CLIENT_NAV[app.key] ?? []) : [];
  const isHome = !app;

  return (
    <SharedAppShell
      appKey={app?.key ?? "home"}
      appLabel={app?.label ?? "ONAiR"}
      sections={sections}
      showOtherApps={!isHome}
      mobileTabs={CLIENT_MOBILE_TABS}
      searchSlot={<GlobalSearch />}
      manualContent={SALES_MANUAL}
      user={currentUser ? { name: currentUser.name, role: currentUser.role, email: currentUser.email } : null}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={permissions}
      can={(m) => hasPermission(m)}
    >
      <PageErrorBoundary>
        <Outlet />
      </PageErrorBoundary>
    </SharedAppShell>
  );
}
