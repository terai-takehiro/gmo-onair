import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import WeeklyListPage from './pages/WeeklyListPage';
import WeeklyDetailPage from './pages/WeeklyDetailPage';
import DeckPage from './pages/weekly/deck/DeckPage';
import DailyNewsPage from './pages/DailyNewsPage';
import InviewPage from './pages/InviewPage';
import InviewDayPage from './pages/InviewDayPage';
import InquiriesPage from './pages/InquiriesPage';
import SecurityCardsPage from './pages/SecurityCardsPage';
import FeedbackTicketsPage from './pages/FeedbackTicketsPage';
import SearchPage from './pages/SearchPage';
import TasksPage from './pages/TasksPage';

/** 受領書類は財務（別バンドル）へ移した。**フルリロードが要る** */
function RedirectToFinanceDocs() {
  useEffect(() => { window.location.replace('/budget/documents'); }, []);
  return (
    <p className="p-6 text-sm text-muted-foreground">
      受領書類は「財務管理」に移りました。移動しています…
    </p>
  );
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
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/weekly" element={<WeeklyListPage />} />
            <Route path="/weekly/:id" element={<WeeklyDetailPage tab="report" />} />
            {/*
              隔週キープ（docs/design/v4/keep-report.md §3）。左メニューは増やさず、週報のタブで切り替える。
              「隔週キープの数字」はスマホでも読む（要約だけ）。「資料をつくる」は PC 専用
              （`pcOnlyScreens.ts` の `DAILY_PC_ONLY` に理由つきで宣言）
            */}
            <Route path="/weekly/:id/keep" element={<WeeklyDetailPage tab="keep" />} />
            <Route path="/weekly/:id/deck" element={<DeckPage />} />
            <Route path="/news" element={<DailyNewsPage />} />
            <Route path="/inview" element={<InviewPage />} />
            <Route path="/inview/:date" element={<InviewDayPage />} />
            {/*
              v4 ⑥: 受領書類は**財務へ移した**。
              `dailyops` 権限だけを要求していたので**経理が開けなかった**（実測で 403）。
              中身は 金額・締月・支払期日・GLS番号 で経理の道具なので、財務に置いて
              `budget` か `dailyops` のどちらかで通す形にした。
              ここは**別のバンドル**なので `window.location` で送る（`navigate` では飛べない）。
              ブックマークを生かすための転送で、画面は残していない。
            */}
            <Route path="/finance" element={<RedirectToFinanceDocs />} />
            <Route path="/inquiries" element={<InquiriesPage />} />
            <Route path="/security-cards" element={<SecurityCardsPage />} />
            <Route path="/feedback-tickets" element={<FeedbackTicketsPage />} />
            {/* スマホ下タブの3つ目（M9）。PC でも開けるが、入口はスマホの下タブ */}
            <Route path="/search" element={<SearchPage />} />
          </Route>
        ) : (
          <Route path="*" element={<RedirectOnce to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
