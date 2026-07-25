import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import SharedAppShell from '@gmo-onair/shared/src/client/shell/AppShell';
import { createPaletteSearch } from '@gmo-onair/shared/src/client/commandPalette/search';
import api from '@/lib/api';
import SecondaryNavList, { type SecondaryNavItem } from '@gmo-onair/shared/src/client/shell/SecondaryNavList';
import type { RailLinkRenderer } from '@gmo-onair/shared/src/client/shell/Rail';
import { realPathname } from '@gmo-onair/shared/src/client/shell/realPath';
import { useAuth } from '@/hooks/useAuth';
import { AWARDS_MANUAL } from '@/manual/content';

// href はルーター相対 (basename="/awards")
const NAV_ITEMS: SecondaryNavItem[] = [
  { label: 'イベント一覧', href: '/', Icon: LayoutDashboard, exact: true },
];

const renderLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);

export function AppShell() {
  const { pathname } = useLocation();
  const { currentUser, logout, permissions } = useAuth();

  const searchHits = useMemo(() => createPaletteSearch(api), []);

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={realPathname(pathname)}
      breadcrumb={<span className="font-bold text-foreground">リアルタイムCG</span>}
      secondaryNav={
        <SecondaryNavList items={NAV_ITEMS} currentPath={pathname} renderLink={renderLink} />
      }
      secondaryNavLabel="リアルタイムCG"
      commandPalette={{ onRun: (path) => { window.location.href = path; }, search: searchHits }}
      manualContent={AWARDS_MANUAL}
    >
      <Outlet />
    </SharedAppShell>
  );
}
