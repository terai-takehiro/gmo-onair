import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import NotFoundRoute from './components/NotFoundRoute';
import HomePage from './pages/HomePage';
import WeeklyListPage from './pages/WeeklyListPage';
import WeeklyDetailPage from './pages/WeeklyDetailPage';
import DailyNewsPage from './pages/DailyNewsPage';
import InviewPage from './pages/InviewPage';
import InviewDayPage from './pages/InviewDayPage';
import FinanceDocsPage from './pages/FinanceDocsPage';
import InquiriesPage from './pages/InquiriesPage';
import SecurityCardsPage from './pages/SecurityCardsPage';

/** 別バンドル (案件管理アプリ) へフルリロードで送る */
function ForwardTo({ path }: { path: string }) {
  if (typeof window !== 'undefined') window.location.replace(path);
  return <div className="p-6 text-[13px] text-secondary-foreground">タスク・依頼を開いています…</div>;
}

export default function App() {
  const { currentUser: user, loading } = useAuth();

  return (
    <BrowserRouter basename="/daily">
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
            <Route index element={<HomePage />} />
            {/* タスク・依頼は案件管理アプリの /tasks に統合した (§4.8)。旧URLは壊さずリダイレクト */}
            <Route path="/tasks" element={<ForwardTo path="/tasks?scope=me" />} />
            <Route path="/weekly" element={<WeeklyListPage />} />
            <Route path="/weekly/:id" element={<WeeklyDetailPage />} />
            <Route path="/news" element={<DailyNewsPage />} />
            {/* 内覧会は開催日ごとにページを分ける (/inview = 日の一覧、/inview/:date = その日の受付) */}
            <Route path="/inview" element={<InviewPage />} />
            <Route path="/inview/:date" element={<InviewDayPage />} />
            <Route path="/finance" element={<FinanceDocsPage />} />
            <Route path="/inquiries" element={<InquiriesPage />} />
            <Route path="/security-cards" element={<SecurityCardsPage />} />
                      {/* 知らないURL。v3.0.8 まで path="*" が無く**何も描かれず真っ白**だった
                (壊れたのか読み込み中なのか区別が付かない)。共通の案内を出す */}
            <Route path="*" element={<NotFoundRoute homeLabel="この一覧にもどる" />} />
</Route>
        ) : (
          <Route path="*" element={<RedirectOnce to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
