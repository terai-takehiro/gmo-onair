/**
 * 機材管理のルート (v4 で 16画面 → 8画面)
 *
 * ── 旧 URL は全部生かす ────────────────────────────────────
 *
 * 畳んだ画面の URL はブックマークされているので、`<Navigate replace>` で
 * 新しい画面のタブへ送ります。`replace` なので「戻る」で転送のページに
 * 戻り続けることはありません。
 *
 *   /equipment/model-groups      → /equipment/items?view=lend
 *   /equipment/cables            → /equipment/items?view=supply
 *   /equipment/connectors        → /equipment/items?view=supply
 *   /equipment/locations         → /equipment/settings?tab=loc
 *   /equipment/manufacturers     → /equipment/settings?tab=maker
 *   /equipment/colors            → /equipment/settings?tab=maker  (色はメーカーと同じタブ)
 *   /equipment/rental-categories → /equipment/settings?tab=cat
 *   /equipment/rental-settings   → /equipment/settings?tab=rule
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { RedirectOnce } from "@gmo-onair/shared/src/client/RedirectOnce";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EquipmentLedgerPage from "@/pages/EquipmentLedgerPage";
import EquipmentDetailPage from "@/pages/EquipmentDetailPage";
import LendingListPage from "@/pages/LendingListPage";
import MaintenancePage from "@/pages/MaintenancePage";
import InventoryPage from "@/pages/InventoryPage";
import ScanPage from "@/pages/ScanPage";
import SearchPage from './pages/SearchPage';
import RackLayoutPage from "@/pages/RackLayoutPage";
import SettingsPage from "@/pages/SettingsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAuthenticated) return <RedirectOnce to="/equipment/login" />;
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
        element={isAuthenticated ? <RedirectOnce to="/equipment" /> : <LoginPage />}
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* v4 の8画面 */}
        <Route path="/equipment" element={<DashboardPage />} />
        <Route path="/equipment/items" element={<EquipmentLedgerPage />} />
        <Route path="/equipment/items/:id" element={<EquipmentDetailPage />} />
        <Route path="/equipment/racks" element={<RackLayoutPage />} />
        <Route path="/equipment/maintenance" element={<MaintenancePage />} />
        <Route path="/equipment/inventory" element={<InventoryPage />} />
        <Route path="/equipment/scan" element={<ScanPage />} />
        {/* スマホ下タブの3つ目（M9）。PC でも開けるが、入口はスマホの下タブ */}
        <Route path="/equipment/search" element={<SearchPage />} />
        <Route path="/equipment/lendings" element={<LendingListPage />} />
        <Route path="/equipment/settings" element={<SettingsPage />} />

        {/* 畳んだ画面の旧 URL (ブックマークを生かす) */}
        <Route path="/equipment/model-groups" element={<Navigate to="/equipment/items?view=lend" replace />} />
        <Route path="/equipment/cables" element={<Navigate to="/equipment/items?view=supply" replace />} />
        <Route path="/equipment/connectors" element={<Navigate to="/equipment/items?view=supply" replace />} />
        <Route path="/equipment/locations" element={<Navigate to="/equipment/settings?tab=loc" replace />} />
        <Route path="/equipment/manufacturers" element={<Navigate to="/equipment/settings?tab=maker" replace />} />
        <Route path="/equipment/colors" element={<Navigate to="/equipment/settings?tab=maker" replace />} />
        <Route path="/equipment/rental-categories" element={<Navigate to="/equipment/settings?tab=cat" replace />} />
        <Route path="/equipment/rental-settings" element={<Navigate to="/equipment/settings?tab=rule" replace />} />
      </Route>
      <Route path="*" element={<RedirectOnce to="/equipment" />} />
    </Routes>
  );
}
