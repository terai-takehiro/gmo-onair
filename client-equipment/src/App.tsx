import { Routes, Route } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { RedirectOnce } from "@gmo-onair/shared/src/client/RedirectOnce";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import EquipmentDailyPage from "@/pages/EquipmentDailyPage";
import ThingsPage from "@/pages/ThingsPage";
import EquipmentDetailPage from "@/pages/EquipmentDetailPage";
import LendingListPage from "@/pages/LendingListPage";
import MaintenancePage from "@/pages/MaintenancePage";
import InventoryPage from "@/pages/InventoryPage";
import ScanPage from "@/pages/ScanPage";
import LocationPage from "@/pages/LocationPage";
import ManufacturerPage from "@/pages/ManufacturerPage";
import ColorPage from "@/pages/ColorPage";
import RentalSettingsPage from "@/pages/RentalSettingsPage";
import RentalCategoryPage from "@/pages/RentalCategoryPage";
import { Loader2 } from "lucide-react";
import { Delayed } from '@gmo-onair/shared/src/client/states';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Delayed><div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Delayed>;
  if (!isAuthenticated) return <RedirectOnce to="/equipment/login" />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Delayed><div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Delayed>;
  }

  return (
    <Routes>
      <Route
        path="/equipment/login"
        element={isAuthenticated ? <RedirectOnce to="/equipment" /> : <LoginPage />}
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/equipment" element={<EquipmentDailyPage />} />
        <Route path="/equipment/items" element={<ThingsPage />} />
        <Route path="/equipment/items/:id" element={<EquipmentDetailPage />} />
        <Route path="/equipment/lendings" element={<LendingListPage />} />
        <Route path="/equipment/maintenance" element={<MaintenancePage />} />
        <Route path="/equipment/inventory" element={<InventoryPage />} />
        <Route path="/equipment/scan" element={<ScanPage />} />
        <Route path="/equipment/locations" element={<LocationPage />} />
        <Route path="/equipment/manufacturers" element={<ManufacturerPage />} />
        <Route path="/equipment/colors" element={<ColorPage />} />
        <Route path="/equipment/racks" element={<RedirectOnce to="/equipment/items?kind=racks" />} />
        <Route path="/equipment/model-groups" element={<RedirectOnce to="/equipment/items?kind=model-groups" />} />
        <Route path="/equipment/rental-settings" element={<RentalSettingsPage />} />
        <Route path="/equipment/rental-categories" element={<RentalCategoryPage />} />
        <Route path="/equipment/cables" element={<RedirectOnce to="/equipment/items?kind=cables" />} />
        <Route path="/equipment/connectors" element={<RedirectOnce to="/equipment/items?kind=connectors" />} />
      </Route>
      <Route path="*" element={<RedirectOnce to="/equipment" />} />
    </Routes>
  );
}
