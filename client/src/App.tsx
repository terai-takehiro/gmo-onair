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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/admin/users" element={<UserListPage />} />
        <Route path="/admin/data-viewer" element={<DataViewerPage />} />

        {/* 統合案件管理 */}
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/new" element={<ProjectFormPage />} />
        <Route path="/projects/:id" element={<ProjectFormPage />} />
        <Route path="/projects/:projectId/episodes" element={<EpisodeListPage />} />

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
