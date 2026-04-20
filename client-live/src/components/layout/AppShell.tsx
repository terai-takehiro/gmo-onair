import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Radio, LayoutDashboard, Timer, List, Settings, LogOut, ChevronLeft, ShieldOff } from 'lucide-react';

const navItems = [
  { to: '/', label: 'ダッシュボード', icon: LayoutDashboard, end: true, managerOnly: false },
  { to: '/timer', label: 'タイマー', icon: Timer, end: false, managerOnly: false },
  { to: '/programs', label: '番組管理', icon: List, end: false, managerOnly: false },
  { to: '/settings', label: '設定', icon: Settings, end: false, managerOnly: true },
];

export default function AppShell() {
  const { currentUser, logout } = useAuth();
  const { canView, canManage, permissionsLoading } = usePermissions();

  // 権限なし: アクセス拒否ページ
  if (!permissionsLoading && !canView) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <ShieldOff className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">アクセス権限がありません</h2>
          <p className="text-sm text-muted-foreground">
            計時LIVEへのアクセス権限がありません。<br />
            管理者に <code className="text-xs bg-muted px-1 py-0.5 rounded">liveops</code> モジュールの権限付与を依頼してください。
          </p>
          <a href="/" className="inline-block text-sm text-primary underline">メインアプリに戻る</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-16 sm:w-52 flex-col border-r bg-card py-4">
        {/* GMO ONAiR link */}
        <a
          href="/"
          className="flex items-center gap-2 px-3 pb-3 mb-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="GMO ONAiR メインアプリ"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:block">GMO ONAiR</span>
        </a>

        {/* App header */}
        <div className="flex items-center gap-2 px-3 pb-4 border-b mb-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500 text-white">
            <Radio className="h-4 w-4" />
          </div>
          <span className="hidden sm:block text-sm font-bold">計時LIVE</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {navItems
            .filter(item => !item.managerOnly || canManage)
            .map(({ to, label, icon: Icon, end }) => (
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
            <div className="hidden sm:block px-2.5 space-y-0.5">
              <p className="truncate text-xs font-medium">{currentUser.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {canManage ? '管理者' : '閲覧者'}
              </p>
            </div>
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
