import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import AppSwitcher from '@gmo-onair/shared/src/client/AppSwitcher';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser: user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header — unified pattern */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden lg:block">
              <AppSwitcher currentApp="interactive" />
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <a href="/" className="text-sm font-bold text-primary hover:opacity-80 transition-opacity shrink-0">ONAiR</a>
              <span className="text-muted-foreground/40 shrink-0">/</span>
              <span className="text-sm font-semibold text-foreground truncate">インタラクティブ</span>
            </div>
            {location.pathname !== '/' && location.pathname !== '/interactive' && (
              <Button variant="ghost" size="sm" className="hidden sm:flex" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                戻る
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user?.name && (
              <span className="text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト" className="h-9 w-9">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}
