import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Radio, LayoutDashboard, Timer, List, Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/', label: 'ダッシュボード', icon: LayoutDashboard, end: true },
  { to: '/timer', label: 'タイマー', icon: Timer, end: false },
  { to: '/programs', label: '番組管理', icon: List, end: false },
  { to: '/settings', label: '設定', icon: Settings, end: false },
];

export default function AppShell() {
  const { currentUser, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-16 sm:w-52 flex-col border-r bg-card py-4">
        <div className="flex items-center gap-2 px-3 pb-4 border-b mb-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500 text-white">
            <Radio className="h-4 w-4" />
          </div>
          <span className="hidden sm:block text-sm font-bold">計時LIVE</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t px-2 pt-3 mt-2 space-y-1">
          {currentUser && (
            <p className="hidden sm:block truncate px-2.5 text-xs text-muted-foreground">{currentUser.name}</p>
          )}
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden sm:block">ログアウト</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
