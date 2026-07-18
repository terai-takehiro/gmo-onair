import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/platform/AuthContext";
import { RedirectOnce } from "@gmo-onair/shared/src/client/RedirectOnce";
import AppShell from "@/components/layout/AppShell";
import PermissionRoute from "@/components/layout/PermissionRoute";
import { Loader2 } from "lucide-react";

// Platform
import LoginPage from "@/contexts/platform/pages/LoginPage";
import AuthCallbackPage from "@/contexts/platform/pages/AuthCallbackPage";
import AcceptInvitationPage from "@/contexts/platform/pages/AcceptInvitationPage";
import HomePage from "@/contexts/platform/pages/HomePage";
import UserListPage from "@/contexts/platform/pages/UserListPage";
import DataViewerPage from "@/contexts/platform/pages/DataViewerPage";
import DbBackupsPage from "@/contexts/platform/pages/DbBackupsPage";
import KessanImportPage from "@/contexts/platform/pages/KessanImportPage";

// Sales (営業管理)
import DashboardPage from "@/contexts/platform/pages/DashboardPage";
import ProjectListPage from "@/contexts/sales/pages/ProjectListPage";
import InboxPage from "@/contexts/sales/pages/InboxPage";
import GlsImportProjectsPage from "@/contexts/sales/pages/GlsImportProjectsPage";
import ProjectFormPage from "@/contexts/sales/pages/ProjectFormPage";
import CustomerListPage from "@/contexts/sales/pages/CustomerListPage";
import CompanyListPage from "@/contexts/sales/pages/CompanyListPage";
import PricingListPage from "@/contexts/sales/pages/PricingListPage";
import ActivityLogPage from "@/contexts/sales/pages/ActivityLogPage";
import AiActivityPage from "@/contexts/sales/pages/AiActivityPage";
import KeepReportPage from "@/contexts/sales/pages/KeepReportPage";
import SalesReviewPage from "@/contexts/sales/pages/SalesReviewPage";
import ConfirmedProjectsPage from "@/contexts/sales/pages/ConfirmedProjectsPage";
import EstimatePage from "@/contexts/sales/pages/EstimatePage";
import ProjectGroupListPage from "@/contexts/sales/pages/ProjectGroupListPage";

// Tasks (タスク管理)
import ProjectTasksPage from "@/contexts/tasks/pages/ProjectTasksPage";
import TaskDashboardPage from "@/contexts/tasks/pages/TaskDashboardPage";

// Production (スタジオ予約)
import EpisodeListPage from "@/contexts/production/pages/EpisodeListPage";
import StudioCalendarPage from "@/contexts/production/pages/StudioCalendarPage";
import PartnerSchedulePage from "@/contexts/production/pages/PartnerSchedulePage";
import MyCalendarPage from "@/contexts/production/pages/MyCalendarPage";
import UnifiedCalendarPage from "@/contexts/production/pages/UnifiedCalendarPage";
import SignagePage from "@/contexts/production/pages/SignagePage";
import VendorReportPage from "@/contexts/production/pages/VendorReportPage";

// Finance (財務管理)
import RevenueListPage from "@/contexts/finance/pages/RevenueListPage";
import PurchaseListPage from "@/contexts/finance/pages/PurchaseListPage";
import SgaListPage from "@/contexts/finance/pages/SgaListPage";
import XpointImportPage from "@/contexts/finance/pages/XpointImportPage";
import VendorListPage from "@/contexts/finance/pages/VendorListPage";
import PartnerListPage from "@/contexts/finance/pages/PartnerListPage";
import BudgetDetailPage from "@/contexts/finance/pages/BudgetDetailPage";
import BudgetDashboardPage from "@/contexts/finance/pages/BudgetDashboardPage";

// 機材管理は client-equipment/ が /equipment 配下で配信 (案件管理アプリ側では扱わない)
import SettingsPage from "@/contexts/platform/pages/SettingsPage";

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
    return <RedirectOnce to="/login" />;
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
        element={isAuthenticated ? <RedirectOnce to="/" /> : <LoginPage />}
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/accept-invitation" element={<AcceptInvitationPage />} />
      <Route path="/signage/:roomId" element={<SignagePage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* ホーム（アプリランチャー） */}
        <Route path="/" element={<HomePage />} />

        {/* ===== 営業管理 (sales) ===== */}
        <Route path="/sales/dashboard" element={<PermissionRoute module="sales"><DashboardPage /></PermissionRoute>} />
        <Route path="/sales/projects" element={<PermissionRoute module="sales"><ProjectListPage /></PermissionRoute>} />
        <Route path="/sales/gls-import" element={<PermissionRoute module="sales"><GlsImportProjectsPage /></PermissionRoute>} />
        <Route path="/sales/projects/new" element={<PermissionRoute module="sales"><ProjectFormPage /></PermissionRoute>} />
        <Route path="/sales/projects/:id" element={<PermissionRoute module="sales"><ProjectFormPage /></PermissionRoute>} />
        <Route path="/sales/projects/confirmed/:category" element={<PermissionRoute module="sales"><ConfirmedProjectsPage /></PermissionRoute>} />
        <Route path="/sales/projects/:projectId/episodes" element={<PermissionRoute module="sales"><EpisodeListPage /></PermissionRoute>} />
        <Route path="/sales/projects/:projectId/estimates" element={<PermissionRoute module="sales"><EstimatePage /></PermissionRoute>} />
        <Route path="/sales/projects/:projectId/tasks" element={<PermissionRoute module="sales"><ProjectTasksPage /></PermissionRoute>} />
        <Route path="/sales/tasks" element={<Navigate to="/sales/tasks/kanban" replace />} />
        <Route path="/sales/tasks/:view" element={<PermissionRoute module="sales"><TaskDashboardPage /></PermissionRoute>} />
        <Route path="/sales/project-groups" element={<PermissionRoute module="sales"><ProjectGroupListPage /></PermissionRoute>} />
        <Route path="/sales/inbox" element={<PermissionRoute module="sales"><InboxPage /></PermissionRoute>} />
        <Route path="/sales/activity-logs" element={<PermissionRoute module="sales"><ActivityLogPage /></PermissionRoute>} />
        <Route path="/sales/ai-activity" element={<PermissionRoute module="sales"><AiActivityPage /></PermissionRoute>} />
        <Route path="/sales/keep-report" element={<PermissionRoute module="sales"><KeepReportPage /></PermissionRoute>} />
        <Route path="/sales/review" element={<PermissionRoute module="sales"><SalesReviewPage /></PermissionRoute>} />
        <Route path="/sales/customers" element={<PermissionRoute module="sales"><CustomerListPage /></PermissionRoute>} />
        <Route path="/sales/companies" element={<PermissionRoute module="sales"><CompanyListPage /></PermissionRoute>} />
        <Route path="/sales/pricing" element={<PermissionRoute module="sales"><PricingListPage /></PermissionRoute>} />

        {/* ===== 財務管理 (budget) ===== */}
        <Route path="/budget/revenues" element={<PermissionRoute module="budget"><RevenueListPage /></PermissionRoute>} />
        <Route path="/budget/purchases" element={<PermissionRoute module="budget"><PurchaseListPage /></PermissionRoute>} />
        <Route path="/budget/sga" element={<PermissionRoute module="budget"><SgaListPage /></PermissionRoute>} />
        <Route path="/budget/xpoint-import" element={<PermissionRoute module="budget"><XpointImportPage /></PermissionRoute>} />
        <Route path="/budget/vendors" element={<PermissionRoute module="budget"><VendorListPage /></PermissionRoute>} />
        <Route path="/budget/partners" element={<PermissionRoute module="budget"><PartnerListPage /></PermissionRoute>} />
        <Route path="/budget/reports/vendors" element={<PermissionRoute module="budget"><VendorReportPage /></PermissionRoute>} />
        <Route path="/budget/detail" element={<PermissionRoute module="budget"><BudgetDetailPage /></PermissionRoute>} />
        <Route path="/budget/dashboard" element={<PermissionRoute module="budget"><BudgetDashboardPage /></PermissionRoute>} />

        {/* ===== スタジオ予約 (studio) ===== */}
        <Route path="/studio/calendar" element={<PermissionRoute module="studio"><StudioCalendarPage /></PermissionRoute>} />
        <Route path="/studio/partners" element={<PermissionRoute module="partner_schedule"><PartnerSchedulePage /></PermissionRoute>} />
        <Route path="/studio/my-calendar" element={<PermissionRoute module="partner_schedule"><MyCalendarPage /></PermissionRoute>} />
        <Route path="/studio/all" element={<PermissionRoute anyOf={["studio", "partner_schedule"]}><UnifiedCalendarPage /></PermissionRoute>} />

        {/* 機材管理 (/equipment/*) は client-equipment/ が Nginx 経由で配信 */}

        {/* ===== システム管理 (admin) ===== */}
        <Route path="/admin/users" element={<PermissionRoute module="admin"><UserListPage /></PermissionRoute>} />
        <Route path="/admin/data-viewer" element={<PermissionRoute module="admin"><DataViewerPage /></PermissionRoute>} />
        <Route path="/admin/db-backups" element={<PermissionRoute module="admin"><DbBackupsPage /></PermissionRoute>} />
        <Route path="/admin/kessan-import" element={<PermissionRoute module="admin"><KessanImportPage /></PermissionRoute>} />
        <Route path="/admin/settings" element={<PermissionRoute module="admin"><SettingsPage /></PermissionRoute>} />

        {/* ブロックアプリ インデックスリダイレクト（BLOCK_APPS.basePath対応） */}
        <Route path="/sales" element={<Navigate to="/sales/projects" replace />} />
        <Route path="/budget" element={<Navigate to="/budget/dashboard" replace />} />
        <Route path="/studio" element={<Navigate to="/studio/calendar" replace />} />

        {/* 旧URLリダイレクト */}
        <Route path="/projects" element={<Navigate to="/sales/projects" replace />} />
        <Route path="/projects/*" element={<Navigate to="/sales/projects" replace />} />
        <Route path="/revenues" element={<Navigate to="/budget/revenues" replace />} />
        <Route path="/purchases" element={<Navigate to="/budget/purchases" replace />} />
        <Route path="/sga" element={<Navigate to="/budget/sga" replace />} />
        <Route path="/calendar" element={<Navigate to="/studio/calendar" replace />} />
        <Route path="/masters/customers" element={<Navigate to="/sales/customers" replace />} />
        <Route path="/masters/pricing" element={<Navigate to="/sales/pricing" replace />} />
        <Route path="/masters/vendors" element={<Navigate to="/budget/vendors" replace />} />
        <Route path="/masters/partners" element={<Navigate to="/budget/partners" replace />} />
        <Route path="/reports/vendors" element={<Navigate to="/budget/reports/vendors" replace />} />
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
