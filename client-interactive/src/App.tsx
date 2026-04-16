import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppShell } from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import EventEditorPage from './pages/EventEditorPage';
import QuizManagerPage from './pages/QuizManagerPage';
import LiveControlPage from './pages/LiveControlPage';
import OverlayPage from './pages/OverlayPage';
import AudiencePage from './pages/AudiencePage';
import LoginPage from './pages/LoginPage';

export default function App() {
  const { currentUser: user, loading } = useAuth();

  return (
    <BrowserRouter basename="/interactive">
      <Routes>
        {/* Public routes (no auth needed) */}
        <Route path="/audience/:eventId" element={<AudiencePage />} />
        <Route path="/overlay/:eventId" element={<OverlayPage />} />

        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        {loading ? (
          <Route path="*" element={<div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>} />
        ) : user ? (
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/event/:id" element={<EventEditorPage />} />
            <Route path="/event/:id/quiz" element={<QuizManagerPage />} />
            <Route path="/live/:id" element={<LiveControlPage />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
