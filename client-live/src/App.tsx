import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import SessionHomePage from './pages/SessionHomePage';
import DashboardPage from './pages/DashboardPage';
import TimerAdminPage from './pages/TimerAdminPage';
import TimerDisplayPage from './pages/TimerDisplayPage';
import ProgramsPage from './pages/ProgramsPage';
import SettingsPage from './pages/SettingsPage';

// タイマー表示ページ (/live/display/*) はuseAuthを使わない独立ルーター
// → useAuth内のaxiosが/auth/meを呼び、401でloginにリダイレクトされるのを防ぐ
function DisplayRouter() {
  return (
    <BrowserRouter basename="/live">
      <Routes>
        <Route path="/display/:timerId" element={<TimerDisplayPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function AuthenticatedApp() {
  const { currentUser: user, loading } = useAuth();

  return (
    <BrowserRouter basename="/live">
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {loading ? (
          <Route path="*" element={
            <div className="flex h-screen items-center justify-center bg-background">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          } />
        ) : user ? (
          <Route element={<AppShell />}>
            <Route index element={<SessionHomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/program/:programId" element={<DashboardPage />} />
            <Route path="/program/:programId/timers" element={<TimerAdminPage />} />
            <Route path="/program/:programId/settings" element={<ProgramsPage />} />
          </Route>
        ) : (
          <Route path="*" element={<RedirectOnce to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  // /live/display/* はuseAuth不要 — 認証ミドルウェアを迂回して直接レンダリング
  if (window.location.pathname.startsWith('/live/display/')) {
    return <DisplayRouter />;
  }
  return <AuthenticatedApp />;
}
