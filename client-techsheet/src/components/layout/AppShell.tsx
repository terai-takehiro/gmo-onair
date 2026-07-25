import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import SharedAppShell from "@gmo-onair/shared/src/client/shell/AppShell";
import SecondaryNavList, { type SecondaryNavItem } from "@gmo-onair/shared/src/client/shell/SecondaryNavList";
import type { RailLinkRenderer } from "@gmo-onair/shared/src/client/shell/Rail";
import { realPathname } from "@gmo-onair/shared/src/client/shell/realPath";
import { useAuth } from "@/hooks/useAuth";
import { TECHSHEET_MANUAL } from "@/manual/content";

const NAV_ITEMS: SecondaryNavItem[] = [
  { label: "ダッシュボード", href: "/techsheet", Icon: LayoutDashboard, exact: true },
];

const renderLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);

export default function AppShell() {
  const { pathname } = useLocation();
  const { currentUser, logout, permissions } = useAuth();

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={realPathname(pathname)}
      breadcrumb={<span className="font-bold text-foreground">技術資料</span>}
      secondaryNav={
        <SecondaryNavList items={NAV_ITEMS} currentPath={pathname} renderLink={renderLink} />
      }
      secondaryNavLabel="技術資料"
      manualContent={TECHSHEET_MANUAL}
    >
      <Outlet />
    </SharedAppShell>
  );
}
