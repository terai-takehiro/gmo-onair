import { useMemo } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Timer, LayoutDashboard, Settings, ArrowLeft, KeyRound } from 'lucide-react';
import SharedAppShell from '@gmo-onair/shared/src/client/shell/AppShell';
import LocationCrumb from '@gmo-onair/shared/src/client/shell/LocationCrumb';
import BackToProject from '@gmo-onair/shared/src/client/shell/BackToProject';
import { createPaletteSearch } from '@gmo-onair/shared/src/client/commandPalette/search';
import { createNotificationFetcher } from '@gmo-onair/shared/src/client/notifications';
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
  const { pathname, search } = useLocation();
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
        // 「設定」が2行並んで区別が付かなかったので中身の名前にする
        // (/live/settings は YouTube などの APIキーを入れる画面)
        { label: '視聴者数のAPIキー', href: '/settings', Icon: KeyRound },
      ]
    : [
        { label: 'セッション一覧', href: '/', Icon: Timer, exact: true },
        { label: '視聴者数のAPIキー', href: '/settings', Icon: KeyRound },
      ];

  const noAccess = !permissionsLoading && !canView;

  // 区分 + 画面名は共通部品から (全アプリで同じ形にする)。番組名はこのアプリ固有なので後ろに足す
  const breadcrumb = (
    <span className="flex min-w-0 items-center gap-1.5">
      <BackToProject search={search} />
      <LocationCrumb path={realPathname(pathname)} fallback="計時LIVE" />
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
  const fetchNotifications = useMemo(() => createNotificationFetcher(api), []);

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
      notifications={{ fetchData: fetchNotifications, onRun: (path) => { window.location.href = path; }, onOpenPrefs: () => { window.location.href = "/settings/notifications"; } }}
      manualContent={LIVE_MANUAL}
      onOpenSiteMap={() => { window.location.href = "/map"; }}
      padMain={noAccess}
    >
      {noAccess ? <NoPermissionPanel modules={['liveops']} target="計時LIVE" /> : <Outlet />}
    </SharedAppShell>
  );
}
