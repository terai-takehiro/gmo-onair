import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppShell } from './components/layout/AppShell';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import DashboardPage from './pages/DashboardPage';
import EventEditorPage from './pages/EventEditorPage';
import ControlPage from './pages/ControlPage';
import OutputPage from './pages/OutputPage';
import LoginPage from './pages/LoginPage';

// 出力ページ (/awards/output/*) はuseAuthを使わない独立ルーター
// → useAuth内のaxiosが/auth/meを呼び、401でloginにリダイレクトされるのを防ぐ
function OutputRouter() {
  return (
    <BrowserRouter basename="/awards">
      <Routes>
        <Route path="/output/:eventId" element={<OutputPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function AuthenticatedApp() {
  const { currentUser: user, loading } = useAuth();
  return (
    <BrowserRouter basename="/awards">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {loading ? (
          <Route
            path="*"
            element={
              <div className="flex h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            }
          />
        ) : user ? (
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/event/:id" element={<EventEditorPage />} />
            <Route path="/event/:id/control" element={<ControlPage />} />
          </Route>
        ) : (
          <Route path="*" element={<RedirectOnce to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  // /awards/output/* はuseAuth不要 — 認証ミドルウェアを迂回して直接レンダリング
  if (window.location.pathname.startsWith('/awards/output/')) {
    return <OutputRouter />;
  }
  return <AuthenticatedApp />;
}
