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
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppSwitcher currentApp="interactive" />
            <Link to="/" className="flex items-center gap-2 font-sans font-bold text-primary">
              <Sparkles className="h-5 w-5" />
              <span>EventStamp</span>
            </Link>
            {location.pathname !== '/' && location.pathname !== '/interactive' && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                ダッシュボード
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト">
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
