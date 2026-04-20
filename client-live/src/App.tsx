import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
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
        {/* Public — no auth (display screen for large monitors) */}
        <Route path="/display/:timerId" element={<TimerDisplayPage />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected */}
        {loading ? (
          <Route path="*" element={
            <div className="flex h-screen items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          } />
        ) : user ? (
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/timer" element={<TimerAdminPage />} />
            <Route path="/programs" element={<ProgramsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
