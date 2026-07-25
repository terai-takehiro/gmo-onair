import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, FilePlus } from "lucide-react";
import SharedAppShell from "@gmo-onair/shared/src/client/shell/AppShell";
import SecondaryNavList, { type SecondaryNavItem } from "@gmo-onair/shared/src/client/shell/SecondaryNavList";
import type { RailLinkRenderer } from "@gmo-onair/shared/src/client/shell/Rail";
import { realPathname } from "@gmo-onair/shared/src/client/shell/realPath";
import { useAuth } from "@/hooks/useAuth";
import { QSHEET_MANUAL } from "@/manual/content";

const NAV_ITEMS: SecondaryNavItem[] = [
  { label: "ドキュメント一覧", href: "/qsheet", Icon: LayoutDashboard, exact: true },
];

const renderLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);

export default function AppShell() {
  const { pathname } = useLocation();
  const { currentUser, logout, permissions } = useAuth();

  const nav = (
    <SecondaryNavList
      items={NAV_ITEMS}
      currentPath={pathname === "/qsheet/editor" ? "/qsheet" : pathname}
      renderLink={renderLink}
      footer={
        <button
          type="button"
          onClick={() => {
            const btn = document.querySelector("[data-create-btn]") as HTMLButtonElement | null;
            if (btn) btn.click();
            else window.location.href = "/qsheet";
          }}
          className="flex w-full items-center gap-2.5 rounded-control border border-primary/25 px-3 py-2 text-[13px] font-bold text-primary transition-colors hover:bg-accent"
        >
          <FilePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          新規作成
        </button>
      }
    />
  );

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={realPathname(pathname)}
      breadcrumb={<span className="font-bold text-foreground">Qシート</span>}
      secondaryNav={nav}
      secondaryNavLabel="Qシート"
      manualContent={QSHEET_MANUAL}
    >
      <Outlet />
    </SharedAppShell>
  );
}
