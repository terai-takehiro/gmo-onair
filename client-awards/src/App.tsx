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
import QuizListPage from './pages/QuizListPage';
import QuizEditPage from './pages/QuizEditPage';
import QuizStackControlPage from './pages/QuizStackControlPage';
import QuizStackOutputPage from './pages/QuizStackOutputPage';
import CgCockpitPage from './pages/CgCockpitPage';
import QuizStackOutputNextPage from './pages/QuizStackOutputNextPage';
import OnAirPage from './pages/OnAirPage';
import OutputsPage from './pages/OutputsPage';
import IntakePage from './pages/IntakePage';

// 出力ページ (/awards/output/*) はuseAuthを使わない独立ルーター
// → useAuth内のaxiosが/auth/meを呼び、401でloginにリダイレクトされるのを防ぐ
function OutputRouter() {
  return (
    <BrowserRouter basename="/awards">
      <Routes>
        {/* クイズ/アンケート スタック出力 (event 単位)。OA + NEXT (送出予約) */}
        <Route path="/output/quiz-stack/:eventId/next" element={<QuizStackOutputNextPage />} />
        <Route path="/output/quiz-stack/:eventId" element={<QuizStackOutputPage />} />
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
            {/* 送出（本番中に見る唯一の画面。20章 24a）*/}
            <Route path="/event/:id/onair" element={<OnAirPage />} />
            {/* 出力URLの配り方 (24b) / データを入れる (20f) — どちらも準備 */}
            <Route path="/event/:id/outputs" element={<OutputsPage />} />
            <Route path="/event/:id/intake" element={<IntakePage />} />
            <Route path="/event/:id/cg/control" element={<CgCockpitPage />} />
            <Route path="/event/:id/control" element={<ControlPage />} />
            <Route path="/event/:id/oneshot/control" element={<OneShotControlPage />} />
            <Route path="/event/:id/quiz" element={<QuizListPage />} />
            <Route path="/event/:id/quiz-stack/control" element={<QuizStackControlPage />} />
            <Route path="/event/:id/quiz/:quizId/edit" element={<QuizEditPage />} />
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
