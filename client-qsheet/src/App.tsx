import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EditorPage from "@/pages/EditorPage";
import OnAirPage from "@/pages/OnAirPage";
import RundownPage from "@/pages/RundownPage";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAuthenticated) return <Navigate to="/qsheet/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Routes>
      <Route
        path="/qsheet/login"
        element={isAuthenticated ? <Navigate to="/qsheet" replace /> : <LoginPage />}
      />
      {/* ON AIR page: full screen, no sidebar */}
      <Route
        path="/qsheet/onair/:id"
        element={
          <ProtectedRoute>
            <OnAirPage />
          </ProtectedRoute>
        }
      />
      {/* Rundown page: full screen, no sidebar */}
      <Route
        path="/qsheet/rundown/:id"
        element={
          <ProtectedRoute>
            <RundownPage />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/qsheet" element={<DashboardPage />} />
        <Route path="/qsheet/editor" element={<DashboardPage />} />
        <Route path="/qsheet/editor/:id" element={<EditorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/qsheet" replace />} />
    </Routes>
  );
}
