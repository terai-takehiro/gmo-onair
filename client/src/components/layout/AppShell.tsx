import React, { useCallback, useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import SharedAppShell from "@gmo-onair/shared/src/client/shell/AppShell";
import LocationCrumb from "@gmo-onair/shared/src/client/shell/LocationCrumb";
import type { RailLinkRenderer } from "@gmo-onair/shared/src/client/shell/Rail";
import { ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from "@/contexts/platform/AuthContext";
import { SALES_MANUAL } from "@/manual/content";
import { createPaletteSearch } from "@gmo-onair/shared/src/client/commandPalette/search";
import { createNotificationFetcher } from "@gmo-onair/shared/src/client/notifications";
import api from "@/lib/api";
import { openAppPath } from "@/lib/openAppPath";


interface ErrorBoundaryState {
  hasError: boolean;
  error?: unknown;
}

/**
 * 1画面の描画エラーで**アプリ全体が使えなくなる**のを止める (v3.0.9)。
 *
 * v3.0.8 まで、この境界は `hasError` を一度立てたら下ろす経路が無かった。
 * レールのリンクはクライアント側遷移なので URL は変わるが境界は再生成されず、
 * **どのレールを押しても同じエラー画面が出続ける**。「前の画面に戻る」か
 * 「今日の画面へ」で**フルリロードするまで復帰できない**状態だった
 * (エラーの原因が1画面だけでも、7つのレール全部が死ぬ)。
 *
 * `resetKey` (= 現在地) が変わったら状態を戻す。別の画面に移った時点で
 * その画面が描けるかどうかは分からないので、**もう一度描かせて確かめる**のが正しい。
 */
class PageErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey: string },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; resetKey: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PageErrorBoundary] Caught error:", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPanel
          title="この画面を開けませんでした"
          cause={{
            cause: "画面の組み立て中に処理が止まりました。",
            next: "前の画面に戻るか、今日の画面から開き直してください。",
          }}
          onRetry={() => {
            this.setState({ hasError: false, error: undefined });
            window.history.back();
          }}
          retryLabel="前の画面に戻る"
          action={
            <button
              type="button"
              className="rounded-control bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary-800"
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.href = "/today";
              }}
            >
              今日の画面へ
            </button>
          }
        />
      );
    }
    return this.props.children;
  }
}

/** レールの遷移をアプリ内ルーティングにする (フルリロードを避ける) */
const renderRailLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);


export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, permissions } = useAuth();

  // ⌘K・ベル・マップの行き先。判定は openAppPath に1本化してある
  const runCommand = useCallback((path: string) => openAppPath(path, navigate), [navigate]);

  const searchHits = useMemo(() => createPaletteSearch(api), []);
  const fetchNotifications = useMemo(() => createNotificationFetcher(api), []);


  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={pathname}
      renderLink={renderRailLink}
      breadcrumb={<LocationCrumb path={pathname} fallback="案件管理" />}
      commandPalette={{ onRun: runCommand, search: searchHits }}
      notifications={{ fetchData: fetchNotifications, onRun: runCommand, onOpenPrefs: () => navigate("/settings/notifications") }}
      manualContent={SALES_MANUAL}
      onOpenSiteMap={() => navigate("/map")}
    >
      {/* resetKey に現在地を渡す。別の画面へ移ったらエラー状態を解く */}
      <PageErrorBoundary resetKey={pathname}>
        <Outlet />
      </PageErrorBoundary>
    </SharedAppShell>
  );
}
