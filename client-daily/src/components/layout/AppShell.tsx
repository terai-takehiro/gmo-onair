import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ListChecks, CalendarCheck, Newspaper, DoorOpen, FileText, Inbox, KeyRound,
} from 'lucide-react';
import SharedAppShell from '@gmo-onair/shared/src/client/shell/AppShell';
import SecondaryNavList, { type SecondaryNavItem } from '@gmo-onair/shared/src/client/shell/SecondaryNavList';
import type { RailLinkRenderer } from '@gmo-onair/shared/src/client/shell/Rail';
import { realPathname } from '@gmo-onair/shared/src/client/shell/realPath';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { DAILY_MANUAL } from '@/manual/content';

// href はルーター相対 (basename="/daily")
const NAV_ITEMS: SecondaryNavItem[] = [
  { label: 'ホーム', href: '/', Icon: LayoutDashboard, exact: true },
  { label: 'タスク・依頼', href: '/tasks', Icon: ListChecks, groupTitle: 'メニュー' },
  { label: 'ウィークリー活動報告', href: '/weekly', Icon: CalendarCheck },
  { label: 'デイリーニュース報告', href: '/news', Icon: Newspaper },
  { label: '内覧会 来場予約', href: '/inview', Icon: DoorOpen },
  { label: '見積 / 請求書', href: '/finance', Icon: FileText },
  { label: 'その他問い合わせ', href: '/inquiries', Icon: Inbox },
  { label: 'セキュリティカード', href: '/security-cards', Icon: KeyRound },
];

const renderLink: RailLinkRenderer = ({ href, children, className, onClick, title, ...rest }) => (
  <NavLink to={href} className={className} onClick={onClick} title={title} {...rest}>
    {children}
  </NavLink>
);

export default function AppShell() {
  const { pathname } = useLocation();
  const { currentUser, logout, permissions } = useAuth();
  const { canView, permissionsLoading } = usePermissions();

  const body = !permissionsLoading && !canView
    ? <NoPermissionPanel modules={['dailyops']} target="日常業務" />
    : <Outlet />;

  return (
    <SharedAppShell
      currentUser={currentUser}
      onLogout={logout}
      role={currentUser?.role}
      permissions={permissions}
      currentPath={realPathname(pathname)}
      breadcrumb={<span className="font-bold text-foreground">日常業務</span>}
      secondaryNav={
        <SecondaryNavList items={NAV_ITEMS} currentPath={pathname} renderLink={renderLink} />
      }
      secondaryNavLabel="日常業務"
      manualContent={DAILY_MANUAL}
      padMain={!permissionsLoading && !canView}
    >
      {body}
    </SharedAppShell>
  );
}
