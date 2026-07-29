import { useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SharedAppShell from '@gmo-onair/shared/src/client/shell/AppShell';
import LocationCrumb from '@gmo-onair/shared/src/client/shell/LocationCrumb';
import BackToProject from '@gmo-onair/shared/src/client/shell/BackToProject';
import { createPaletteSearch } from '@gmo-onair/shared/src/client/commandPalette/search';
import { createNotificationFetcher } from '@gmo-onair/shared/src/client/notifications';
import api from '@/lib/api';
import { realPathname } from '@gmo-onair/shared/src/client/shell/realPath';
import { useAuth } from '@/hooks/useAuth';
import { AWARDS_MANUAL } from '@/manual/content';

// href はルーター相対 (basename="/awards")
export function AppShell() {
  const { pathname, search } = useLocation();
  const { currentUser, logout, permissions } = useAuth();

  const searchHits = useMemo(() => createPaletteSearch(api), []);
  const fetchNotifications = useMemo(() => createNotificationFetcher(api), []);

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={realPathname(pathname)}
      breadcrumb={
        <span className="flex min-w-0 items-center gap-1.5">
          <BackToProject search={search} />
          <LocationCrumb path={realPathname(pathname)} fallback="リアルタイムCG" home={{ path: '/awards', onGo: () => { window.location.href = '/awards'; } }} />
        </span>
      }
      commandPalette={{ onRun: (path) => { window.location.href = path; }, search: searchHits }}
      notifications={{ fetchData: fetchNotifications, onRun: (path) => { window.location.href = path; }, onOpenPrefs: () => { window.location.href = "/settings/notifications"; } }}
      manualContent={AWARDS_MANUAL}
      onOpenSiteMap={() => { window.location.href = "/map"; }}
    >
      <Outlet />
    </SharedAppShell>
  );
}
