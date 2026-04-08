import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EditorPage from "@/pages/EditorPage";
import PrintPage from "@/pages/PrintPage";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAuthenticated) return <Navigate to="/techsheet/login" replace />;
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
        path="/techsheet/login"
        element={isAuthenticated ? <Navigate to="/techsheet" replace /> : <LoginPage />}
      />
      {/* Print page: full screen, no sidebar */}
      <Route
        path="/techsheet/print/:id"
        element={
          <ProtectedRoute>
            <PrintPage />
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
        <Route path="/techsheet" element={<DashboardPage />} />
        <Route path="/techsheet/editor/:id" element={<EditorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/techsheet" replace />} />
    </Routes>
  );
}
