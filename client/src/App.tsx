import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import AppShell from "@/components/layout/AppShell";
import LoginPage from "@/features/auth/LoginPage";
import DashboardPage from "@/features/dashboard/DashboardPage";
import OpportunityListPage from "@/features/opportunities/OpportunityListPage";
import OpportunityFormPage from "@/features/opportunities/OpportunityFormPage";
import ProjectListPage from "@/features/projects/ProjectListPage";
import ProjectDetailPage from "@/features/projects/ProjectDetailPage";
import EpisodeListPage from "@/features/episodes/EpisodeListPage";
import RevenueListPage from "@/features/revenues/RevenueListPage";
import PurchaseListPage from "@/features/purchases/PurchaseListPage";
import StudioCalendarPage from "@/features/calendar/StudioCalendarPage";
import CustomerListPage from "@/features/masters/CustomerListPage";
import VendorListPage from "@/features/masters/VendorListPage";
import PartnerListPage from "@/features/masters/PartnerListPage";
import PricingListPage from "@/features/masters/PricingListPage";
import UserListPage from "@/features/users/UserListPage";
import ProjectGroupListPage from "@/features/project-groups/ProjectGroupListPage";
import ProjectGroupDetailPage from "@/features/project-groups/ProjectGroupDetailPage";
import VendorReportPage from "@/features/reports/VendorReportPage";
import { Loader2 } from "lucide-react";

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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/opportunities" element={<OpportunityListPage />} />
        <Route path="/opportunities/new" element={<OpportunityFormPage />} />
        <Route path="/opportunities/:id" element={<OpportunityFormPage />} />
        <Route path="/project-groups" element={<ProjectGroupListPage />} />
        <Route path="/project-groups/:id" element={<ProjectGroupDetailPage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/episodes" element={<EpisodeListPage />} />
        <Route path="/revenues" element={<RevenueListPage />} />
        <Route path="/purchases" element={<PurchaseListPage />} />
        <Route path="/calendar" element={<StudioCalendarPage />} />
        <Route path="/masters/customers" element={<CustomerListPage />} />
        <Route path="/masters/vendors" element={<VendorListPage />} />
        <Route path="/masters/partners" element={<PartnerListPage />} />
        <Route path="/masters/pricing" element={<PricingListPage />} />
        <Route path="/reports/vendors" element={<VendorReportPage />} />
        <Route path="/admin/users" element={<UserListPage />} />
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
