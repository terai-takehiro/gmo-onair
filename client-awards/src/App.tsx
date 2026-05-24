import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppShell } from './components/layout/AppShell';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import DashboardPage from './pages/DashboardPage';
import EventEditorPage from './pages/EventEditorPage';
import ControlPage from './pages/ControlPage';
import OutputPage from './pages/OutputPage';
import LoginPage from './pages/LoginPage';
import OneShotControlPage from './pages/OneShotControlPage';
import OneShotOutputPage from './pages/OneShotOutputPage';
import OneShotOutputNextPage from './pages/OneShotOutputNextPage';
import OutputNextPage from './pages/OutputNextPage';
import StandalonePollPage from './pages/StandalonePollPage';
import QuizListPage from './pages/QuizListPage';
import QuizControlPage from './pages/QuizControlPage';
import QuizEditPage from './pages/QuizEditPage';
import QuizOutputPage from './pages/QuizOutputPage';
import StandalonePollOutputPage from './pages/StandalonePollOutputPage';

// 出力ページ (/awards/output/*) はuseAuthを使わない独立ルーター
// → useAuth内のaxiosが/auth/meを呼び、401でloginにリダイレクトされるのを防ぐ
function OutputRouter() {
  return (
    <BrowserRouter basename="/awards">
      <Routes>
        {/* v2.8.98+: NEXT (送出予約) 出力 URL — 副調整室向け */}
        <Route path="/output/standalone-poll/:room" element={<StandalonePollOutputPage />} />
        <Route path="/output/quiz/:quizId" element={<QuizOutputPage />} />
        <Route path="/output/:eventId/oneshot/next" element={<OneShotOutputNextPage />} />
        <Route path="/output/:eventId/oneshot" element={<OneShotOutputPage />} />
        <Route path="/output/:eventId/next" element={<OutputNextPage />} />
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
            <Route path="/event/:id/oneshot/control" element={<OneShotControlPage />} />
            <Route path="/event/:id/quiz" element={<QuizListPage />} />
            <Route path="/event/:id/quiz/:quizId/control" element={<QuizControlPage />} />
            <Route path="/event/:id/quiz/:quizId/edit" element={<QuizEditPage />} />
            <Route path="/standalone-poll/:room" element={<StandalonePollPage />} />
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
