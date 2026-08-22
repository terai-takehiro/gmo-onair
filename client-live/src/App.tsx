import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import LiveHomeNoticePage from './pages/LiveHomeNoticePage';
import TimerDisplayPage from './pages/TimerDisplayPage';
// 旧URLのリダイレクト専用の薄い画面（v4.1 段2・ミニアプリ化フェーズ2）。
// 運用画面（ダッシュボード・タイマー管理・番組設定・組織の鍵設定）は
// `client-qsheet` バンドルへ移植済み — ここに残る `DashboardPage.tsx` 等の実体は
// 参照が無くなっただけで、消してはいない（本番リリースの観測期間を挟んでから
// 別PRで削除する設計・client-live/CLAUDE.md「ミニアプリ化フェーズ2」参照）。
import RedirectFromProgram from './pages/redirects/RedirectFromProgram';
import RedirectFromProgramTimers from './pages/redirects/RedirectFromProgramTimers';
import RedirectFromProgramSettings from './pages/redirects/RedirectFromProgramSettings';
import RedirectFromSettings from './pages/redirects/RedirectFromSettings';
import RedirectFromOpen from './pages/redirects/RedirectFromOpen';

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
            <Route index element={<LiveHomeNoticePage />} />
            <Route path="/open" element={<RedirectFromOpen />} />
            <Route path="/settings" element={<RedirectFromSettings />} />
            <Route path="/program/:programId" element={<RedirectFromProgram />} />
            <Route path="/program/:programId/timers" element={<RedirectFromProgramTimers />} />
            <Route path="/program/:programId/settings" element={<RedirectFromProgramSettings />} />
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
