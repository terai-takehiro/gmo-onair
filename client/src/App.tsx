import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/platform/AuthContext";
import AppShell from "@/components/layout/AppShell";
import PermissionRoute from "@/components/layout/PermissionRoute";
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
        <Route path="/" element={<PermissionRoute module="dashboard"><DashboardPage /></PermissionRoute>} />
        <Route path="/admin/users" element={<PermissionRoute module="admin"><UserListPage /></PermissionRoute>} />
        <Route path="/admin/data-viewer" element={<PermissionRoute module="admin"><DataViewerPage /></PermissionRoute>} />

        {/* 統合案件管理 */}
        <Route path="/projects" element={<PermissionRoute module="projects"><ProjectListPage /></PermissionRoute>} />
        <Route path="/projects/new" element={<PermissionRoute module="projects"><ProjectFormPage /></PermissionRoute>} />
        <Route path="/projects/:id" element={<PermissionRoute module="projects"><ProjectFormPage /></PermissionRoute>} />
        <Route path="/projects/confirmed/:category" element={<PermissionRoute module="projects"><ConfirmedProjectsPage /></PermissionRoute>} />
        <Route path="/projects/:projectId/episodes" element={<PermissionRoute module="projects"><EpisodeListPage /></PermissionRoute>} />
        <Route path="/projects/:projectId/estimates" element={<PermissionRoute module="projects"><EstimatePage /></PermissionRoute>} />
        <Route path="/project-groups" element={<PermissionRoute module="projects"><ProjectGroupListPage /></PermissionRoute>} />

        {/* 旧URLリダイレクト */}
        <Route path="/opportunities" element={<Navigate to="/projects" replace />} />
        <Route path="/opportunities/*" element={<Navigate to="/projects" replace />} />

        {/* Sales support */}
        <Route path="/masters/customers" element={<PermissionRoute module="masters"><CustomerListPage /></PermissionRoute>} />
        <Route path="/masters/pricing" element={<PermissionRoute module="masters"><PricingListPage /></PermissionRoute>} />
        <Route path="/activity-logs" element={<PermissionRoute module="projects"><ActivityLogPage /></PermissionRoute>} />
        <Route path="/sales-review" element={<PermissionRoute module="projects"><SalesReviewPage /></PermissionRoute>} />

        {/* Production */}
        <Route path="/calendar" element={<PermissionRoute module="calendar"><StudioCalendarPage /></PermissionRoute>} />
        <Route path="/reports/vendors" element={<PermissionRoute module="reports"><VendorReportPage /></PermissionRoute>} />

        {/* Finance */}
        <Route path="/revenues" element={<PermissionRoute module="revenues"><RevenueListPage /></PermissionRoute>} />
        <Route path="/purchases" element={<PermissionRoute module="purchases"><PurchaseListPage /></PermissionRoute>} />
        <Route path="/sga" element={<PermissionRoute module="sga"><SgaListPage /></PermissionRoute>} />
        <Route path="/masters/vendors" element={<PermissionRoute module="masters"><VendorListPage /></PermissionRoute>} />
        <Route path="/masters/partners" element={<PermissionRoute module="masters"><PartnerListPage /></PermissionRoute>} />
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
