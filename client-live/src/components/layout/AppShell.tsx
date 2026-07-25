import { useMemo } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Timer, LayoutDashboard, Settings, ArrowLeft } from 'lucide-react';
import SharedAppShell from '@gmo-onair/shared/src/client/shell/AppShell';
import { createPaletteSearch } from '@gmo-onair/shared/src/client/commandPalette/search';
import SecondaryNavList, { type SecondaryNavItem } from '@gmo-onair/shared/src/client/shell/SecondaryNavList';
import type { RailLinkRenderer } from '@gmo-onair/shared/src/client/shell/Rail';
import { realPathname } from '@gmo-onair/shared/src/client/shell/realPath';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { LIVE_MANUAL } from '@/manual/content';
import api from '@/lib/api';

interface LiveProgram {
  id: string;
  name: string;
  project_id: string | null;
  project_name?: string;
  gls_number?: string | null;
}

const renderLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);

export default function AppShell() {
  const { pathname } = useLocation();
  const { programId } = useParams<{ programId?: string }>();
  const { currentUser, logout, permissions } = useAuth();
  const { canView, permissionsLoading } = usePermissions();

  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then((r) => r.data.data as LiveProgram),
    enabled: !!programId,
    staleTime: 60_000,
  });

  // href はルーター相対 (basename="/live")
  const navItems: SecondaryNavItem[] = programId
    ? [
        { label: 'ダッシュボード', href: `/program/${programId}`, Icon: LayoutDashboard, exact: true },
        { label: 'タイマー管理', href: `/program/${programId}/timers`, Icon: Timer },
        { label: '番組設定', href: `/program/${programId}/settings`, Icon: Settings },
        { label: 'セッション一覧へ', href: '/', Icon: ArrowLeft, exact: true, groupTitle: 'ほか' },
        { label: '設定', href: '/settings', Icon: Settings },
      ]
    : [
        { label: 'セッション一覧', href: '/', Icon: Timer, exact: true },
        { label: '設定', href: '/settings', Icon: Settings },
      ];

  const noAccess = !permissionsLoading && !canView;

  const breadcrumb = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 font-bold text-foreground">計時LIVE</span>
      {program && (
        <>
          <span className="shrink-0 select-none text-border" aria-hidden="true">
            /
          </span>
          <span className="min-w-0 truncate text-secondary-foreground">
            {program.gls_number ? `${program.gls_number} ${program.name}` : program.name}
          </span>
        </>
      )}
    </span>
  );

  const searchHits = useMemo(() => createPaletteSearch(api), []);

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={realPathname(pathname)}
      breadcrumb={breadcrumb}
      secondaryNav={
        <SecondaryNavList items={navItems} currentPath={pathname} renderLink={renderLink} />
      }
      secondaryNavLabel="計時LIVE"
      commandPalette={{ onRun: (path) => { window.location.href = path; }, search: searchHits }}
      manualContent={LIVE_MANUAL}
      padMain={noAccess}
    >
      {noAccess ? <NoPermissionPanel modules={['liveops']} target="計時LIVE" /> : <Outlet />}
    </SharedAppShell>
  );
}
