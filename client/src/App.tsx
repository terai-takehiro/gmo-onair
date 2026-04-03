import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/platform/AuthContext";
import AppShell from "@/components/layout/AppShell";
import { Loader2 } from "lucide-react";

// Platform
import LoginPage from "@/contexts/platform/pages/LoginPage";
import DashboardPage from "@/contexts/platform/pages/DashboardPage";
import UserListPage from "@/contexts/platform/pages/UserListPage";
import DataViewerPage from "@/contexts/platform/pages/DataViewerPage";

// Sales (統合案件管理)
import ProjectListPage from "@/contexts/sales/pages/ProjectListPage";
import ProjectFormPage from "@/contexts/sales/pages/ProjectFormPage";
import CustomerListPage from "@/contexts/sales/pages/CustomerListPage";
import PricingListPage from "@/contexts/sales/pages/PricingListPage";
import ActivityLogPage from "@/contexts/sales/pages/ActivityLogPage";
import SalesReviewPage from "@/contexts/sales/pages/SalesReviewPage";
import ConfirmedProjectsPage from "@/contexts/sales/pages/ConfirmedProjectsPage";
import EstimatePage from "@/contexts/sales/pages/EstimatePage";
import ProjectGroupListPage from "@/contexts/sales/pages/ProjectGroupListPage";

// Production
import EpisodeListPage from "@/contexts/production/pages/EpisodeListPage";
import StudioCalendarPage from "@/contexts/production/pages/StudioCalendarPage";
import VendorReportPage from "@/contexts/production/pages/VendorReportPage";

// Finance
import RevenueListPage from "@/contexts/finance/pages/RevenueListPage";
import PurchaseListPage from "@/contexts/finance/pages/PurchaseListPage";
import SgaListPage from "@/contexts/finance/pages/SgaListPage";
import VendorListPage from "@/contexts/finance/pages/VendorListPage";
import PartnerListPage from "@/contexts/finance/pages/PartnerListPage";

// Equipment
import EquipmentDashboardPage from "@/contexts/equipment/pages/DashboardPage";
import EquipmentListPage from "@/contexts/equipment/pages/EquipmentListPage";
import EquipmentDetailPage from "@/contexts/equipment/pages/EquipmentDetailPage";
import LendingListPage from "@/contexts/equipment/pages/LendingListPage";
import CategoryPage from "@/contexts/equipment/pages/CategoryPage";
import LocationPage from "@/contexts/equipment/pages/LocationPage";
import MaintenancePage from "@/contexts/equipment/pages/MaintenancePage";
import InventoryPage from "@/contexts/equipment/pages/InventoryPage";
import ScanPage from "@/contexts/equipment/pages/ScanPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/** ロールベースのルート保護。許可されたロール以外はダッシュボードにリダイレクト */
function RoleRoute({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (!currentUser || !roles.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* Platform */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/admin/users" element={<RoleRoute roles={["system_admin"]}><UserListPage /></RoleRoute>} />
        <Route path="/admin/data-viewer" element={<RoleRoute roles={["system_admin"]}><DataViewerPage /></RoleRoute>} />

        {/* 統合案件管理 */}
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/new" element={<ProjectFormPage />} />
        <Route path="/projects/:id" element={<ProjectFormPage />} />
        <Route path="/projects/confirmed/:category" element={<ConfirmedProjectsPage />} />
        <Route path="/projects/:projectId/episodes" element={<EpisodeListPage />} />
        <Route path="/projects/:projectId/estimates" element={<EstimatePage />} />
        <Route path="/project-groups" element={<ProjectGroupListPage />} />

        {/* 旧URLリダイレクト */}
        <Route path="/opportunities" element={<Navigate to="/projects" replace />} />
        <Route path="/opportunities/*" element={<Navigate to="/projects" replace />} />
        <Route path="/project-groups" element={<Navigate to="/projects" replace />} />
        <Route path="/project-groups/*" element={<Navigate to="/projects" replace />} />

        {/* Sales support */}
        <Route path="/masters/customers" element={<CustomerListPage />} />
        <Route path="/masters/pricing" element={<PricingListPage />} />
        <Route path="/activity-logs" element={<ActivityLogPage />} />
        <Route path="/sales-review" element={<SalesReviewPage />} />

        {/* Production */}
        <Route path="/calendar" element={<StudioCalendarPage />} />
        <Route path="/reports/vendors" element={<VendorReportPage />} />

        {/* Finance */}
        <Route path="/revenues" element={<RevenueListPage />} />
        <Route path="/purchases" element={<PurchaseListPage />} />
        <Route path="/sga" element={<SgaListPage />} />
        <Route path="/masters/vendors" element={<VendorListPage />} />
        <Route path="/masters/partners" element={<PartnerListPage />} />

        {/* Equipment */}
        <Route path="/equipment" element={<EquipmentDashboardPage />} />
        <Route path="/equipment/items" element={<EquipmentListPage />} />
        <Route path="/equipment/items/:id" element={<EquipmentDetailPage />} />
        <Route path="/equipment/lending" element={<LendingListPage />} />
        <Route path="/equipment/categories" element={<CategoryPage />} />
        <Route path="/equipment/locations" element={<LocationPage />} />
        <Route path="/equipment/maintenance" element={<MaintenancePage />} />
        <Route path="/equipment/inventory" element={<InventoryPage />} />
        <Route path="/equipment/scan" element={<ScanPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
