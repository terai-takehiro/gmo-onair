import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import ProjectSelectorPage from './pages/ProjectSelectorPage';
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
        {/* Public display screen */}
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
            {/* Global: project selector */}
            <Route index element={<ProjectSelectorPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* Per-project scope */}
            <Route path="/p/:projectId">
              <Route index element={<DashboardPage />} />
              <Route path="timer" element={<TimerAdminPage />} />
              <Route path="programs" element={<ProgramsPage />} />
            </Route>
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
