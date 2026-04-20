import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useUiStore } from '@/stores/uiStore';
import { getAccessibleApps } from '@gmo-onair/shared/src/client/appNav';
import {
  Radio, LayoutDashboard, Timer, List, Settings, ChevronLeft, X,
  Home, FileText, Package, Sparkles, Wrench,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Home, FileText, Package, Sparkles, Wrench, Radio,
};

const navItems = [
  { to: '/',         label: 'ダッシュボード', icon: LayoutDashboard, end: true,  managerOnly: false },
  { to: '/timer',    label: 'タイマー',       icon: Timer,           end: false, managerOnly: false },
  { to: '/programs', label: '番組管理',       icon: List,            end: false, managerOnly: false },
  { to: '/settings', label: '設定',           icon: Settings,        end: false, managerOnly: true  },
];

export default function Sidebar() {
  const { currentUser } = useAuth();
  const { canManage, hasPermission, permissionsLoading } = usePermissions();
  const { sidebarOpen, setSidebarOpen } = useUiStore();

  // permissions を Record<string,string> に変換して getAccessibleApps へ渡す
  const permsRecord: Record<string, string> = {};
  if (currentUser?.role === 'system_admin') {
    // system_admin は getAccessibleApps 内で全許可
  } else if (!permissionsLoading) {
    ['sales','budget','studio','qsheet','equipment','interactive','techsheet','liveops'].forEach(m => {
      if (hasPermission(m)) permsRecord[m] = 'reader';
    });
  }

  const otherApps = getAccessibleApps('liveops', currentUser?.role, permsRecord);

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 flex w-[72vw] sm:w-64 flex-col border-r bg-card transition-transform lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* App header */}
        <div className="flex h-14 items-center gap-3 border-b px-3">
          <a href="/" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted" title="ONAiR ホームへ">
            <ChevronLeft className="h-4 w-4" />
          </a>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500 text-white">
              <Radio className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-bold">計時LIVE</span>
          </div>
          <button className="ml-auto lg:hidden p-1 rounded hover:bg-muted" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems
            .filter(item => !item.managerOnly || canManage)
            .map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ))}
        </nav>

        {/* Other apps */}
        {otherApps.length > 0 && (
          <div className="border-t p-3 space-y-1">
            <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">他のアプリ</p>
            {otherApps.map((app) => {
              const Icon = ICON_MAP[app.icon] || Package;
              return (
                <a
                  key={app.key}
                  href={app.path}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {app.label}
                </a>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}
