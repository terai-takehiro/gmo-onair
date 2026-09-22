import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { RedirectOnce } from '@gmo-onair/shared/src/client/RedirectOnce';
import { NotFoundPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/home/HomePage';
import SpacePage from './pages/page/SpacePage';
import PageRoute from './pages/database/PageRoute';
import WikiEditorPage from './pages/editor/WikiEditorPage';
import HistoryPage from './pages/history/HistoryPage';
import TemplatesPage from './pages/templates/TemplatesPage';

/** 知らない URL。白紙を出さず、何を開こうとしたかと戻り先を出す */
function WikiNotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <NotFoundPanel
      path={`/wiki${pathname}`}
      home={{ label: 'Wiki のホームへ', onGo: () => navigate('/') }}
    />
  );
}

/**
 * 段A（読むだけ）のルート。
 * 編集・検索・AI に聞く・データベース・見直しの画面はまだ作っていないので、
 * **ルートも置かない** — 空の画面に着く URL を先に配らないため。
 */
export default function App() {
  const { currentUser: user, loading } = useAuth();

  return (
    <BrowserRouter basename="/wiki">
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
            <Route path="/s/:key" element={<SpacePage />} />
            <Route path="/p/:id" element={<PageRoute />} />
            <Route path="/p/:id/edit" element={<WikiEditorPage />} />
            <Route path="/p/:id/history" element={<HistoryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="*" element={<WikiNotFound />} />
          </Route>
        ) : (
          <Route path="*" element={<RedirectOnce to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
