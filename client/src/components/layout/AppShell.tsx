import React, { useCallback, useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import SharedAppShell from "@gmo-onair/shared/src/client/shell/AppShell";
import { activeRailKey, resolveRailItems } from "@gmo-onair/shared/src/client/shell/railItems";
import type { RailLinkRenderer } from "@gmo-onair/shared/src/client/shell/Rail";
import { ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { useAuth } from "@/contexts/platform/AuthContext";
import { SALES_MANUAL } from "@/manual/content";
import { createPaletteSearch } from "@gmo-onair/shared/src/client/commandPalette/search";
import api from "@/lib/api";
import SecondaryNav, { activeNavSection, SECONDARY_NAV_LABELS } from "./SecondaryNav";

/** 別バンドルのアプリ。ここへ行くときだけフルリロードする */
const EXTERNAL_PREFIXES = ["/equipment", "/qsheet", "/techsheet", "/live", "/awards", "/daily"];

interface ErrorBoundaryState {
  hasError: boolean;
  error?: unknown;
}

class PageErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PageErrorBoundary] Caught error:", error, info.componentStack);
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

/** 上辺のパンくず。いまはレールの区画名 (案件の名前を出すのは Phase 4) */
function useBreadcrumb(pathname: string, role?: string, permissions?: Record<string, string>): string | null {
  const items = resolveRailItems({ role, permissions });
  const key = activeRailKey(pathname, items);
  return items.find((i) => i.key === key)?.label ?? null;
}

export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, permissions } = useAuth();
  const breadcrumb = useBreadcrumb(pathname, currentUser?.role, permissions);

  // ⌘K の行き先。案件管理アプリ内はルーティング、別アプリはフルリロード
  const runCommand = useCallback(
    (path: string) => {
      if (EXTERNAL_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) {
        window.location.href = path;
        return;
      }
      navigate(path);
    },
    [navigate]
  );

  const searchHits = useMemo(() => createPaletteSearch(api), []);


  const navSection = activeNavSection(pathname);
  const hasSecondaryNav = navSection !== null;

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={pathname}
      renderLink={renderRailLink}
      breadcrumb={breadcrumb ? <span className="font-bold text-foreground">{breadcrumb}</span> : undefined}
      secondaryNav={hasSecondaryNav ? <SecondaryNav /> : undefined}
      secondaryNavLabel={navSection ? SECONDARY_NAV_LABELS[navSection] : undefined}
      commandPalette={{ onRun: runCommand, search: searchHits }}
      manualContent={SALES_MANUAL}
    >
      <PageErrorBoundary>
        <Outlet />
      </PageErrorBoundary>
    </SharedAppShell>
  );
}
