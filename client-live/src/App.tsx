import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import SessionHomePage from './pages/SessionHomePage';
import DashboardPage from './pages/DashboardPage';
import TimerAdminPage from './pages/TimerAdminPage';
import TimerDisplayPage from './pages/TimerDisplayPage';
import ProgramsPage from './pages/ProgramsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { currentUser: user, loading } = useAuth();

  return (
    <BrowserRouter basename="/live">
      <Routes>
        {/* Public display screen — no auth required */}
        <Route path="/display/:timerId" element={<TimerDisplayPage />} />
        <Route path="/login" element={<LoginPage />} />

        {loading ? (
          <Route path="*" element={
            <div className="flex h-screen items-center justify-center bg-background">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          } />
        ) : user ? (
          <Route element={<AppShell />}>
            <Route index element={<SessionHomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/program/:programId">
              <Route index element={<DashboardPage />} />
              <Route path="timers" element={<TimerAdminPage />} />
              <Route path="settings" element={<ProgramsPage />} />
            </Route>
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
