import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EquipmentListPage from "@/pages/EquipmentListPage";
import EquipmentDetailPage from "@/pages/EquipmentDetailPage";
import LendingListPage from "@/pages/LendingListPage";
import MaintenancePage from "@/pages/MaintenancePage";
import InventoryPage from "@/pages/InventoryPage";
import CategoryPage from "@/pages/CategoryPage";
import ScanPage from "@/pages/ScanPage";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAuthenticated) return <Navigate to="/equipment/login" replace />;
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
        path="/equipment/login"
        element={isAuthenticated ? <Navigate to="/equipment" replace /> : <LoginPage />}
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/equipment" element={<DashboardPage />} />
        <Route path="/equipment/items" element={<EquipmentListPage />} />
        <Route path="/equipment/items/:id" element={<EquipmentDetailPage />} />
        <Route path="/equipment/lendings" element={<LendingListPage />} />
        <Route path="/equipment/maintenance" element={<MaintenancePage />} />
        <Route path="/equipment/inventory" element={<InventoryPage />} />
        <Route path="/equipment/categories" element={<CategoryPage />} />
        <Route path="/equipment/scan" element={<ScanPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/equipment" replace />} />
    </Routes>
  );
}
