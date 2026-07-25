import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import WeeklyListPage from './pages/WeeklyListPage';
import WeeklyDetailPage from './pages/WeeklyDetailPage';
import DailyNewsPage from './pages/DailyNewsPage';
import InviewPage from './pages/InviewPage';
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
            <Route path="/inview" element={<InviewPage />} />
            <Route path="/finance" element={<FinanceDocsPage />} />
            <Route path="/inquiries" element={<InquiriesPage />} />
            <Route path="/security-cards" element={<SecurityCardsPage />} />
          </Route>
        ) : (
          <Route path="*" element={<RedirectOnce to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
