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
import SearchPage from './pages/search/SearchPage';
import AskPage from './pages/ask/AskPage';
import ReviewPage from './pages/review/ReviewPage';
import TransferPage from './pages/importexport/TransferPage';
import SpacesPage from './pages/spaces/SpacesPage';
import WikiSearchGlobal from './components/search/WikiSearchGlobal';

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
 * ルート。設計 §6-① の画面はこれで全部そろった（スペース管理 `/spaces` が最後）。
 * 「AI に聞く」（`/ask`）は段E、「見直し」（`/review`）は段F で作った。
 *
 * `WikiSearchGlobal` だけは `Routes` の外に置く。`⌘K` の窓と「最近見たもの」の
 * 記録は、画面を移っても消えずに効いている必要があるため（ログインの画面では出さない）。
 */
export default function App() {
  const { currentUser: user, loading } = useAuth();

  return (
    <BrowserRouter basename="/wiki">
      {user ? <WikiSearchGlobal /> : null}
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
            <Route path="/search" element={<SearchPage />} />
            <Route path="/ask" element={<AskPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/spaces" element={<SpacesPage />} />
            <Route path="*" element={<WikiNotFound />} />
          </Route>
        ) : (
          <Route path="*" element={<RedirectOnce to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
