import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/platform/AuthContext";
import { RedirectOnce } from "@gmo-onair/shared/src/client/RedirectOnce";
import AppShell from "@/components/layout/AppShell";
import PermissionRoute from "@/components/layout/PermissionRoute";
import {
  RedirectTo,
  RedirectPreserveState,
  RedirectConfirmed,
  RedirectTaskView,
  ProjectsRoute,
  TasksRoute,
  ScheduleRoute,
  FinanceRoute,
  FinanceImportRoute,
} from "@/components/layout/routeAdapters";
import { Loader2 } from "lucide-react";

// Platform
import LoginPage from "@/contexts/platform/pages/LoginPage";
import AuthCallbackPage from "@/contexts/platform/pages/AuthCallbackPage";
import AcceptInvitationPage from "@/contexts/platform/pages/AcceptInvitationPage";
import TodayPage from "@/contexts/platform/pages/TodayPage";
import SearchResultsPage from "@/contexts/platform/pages/SearchResultsPage";
import SandboxPage from "@/contexts/sales/pages/SandboxPage";
import UserListPage from "@/contexts/platform/pages/UserListPage";
import UserPermissionPage from "@/contexts/platform/pages/UserPermissionPage";
import DataViewerPage from "@/contexts/platform/pages/DataViewerPage";
import DbBackupsPage from "@/contexts/platform/pages/DbBackupsPage";

// Sales (営業管理)
import DashboardPage from "@/contexts/platform/pages/DashboardPage";
import GlsImportProjectsPage from "@/contexts/sales/pages/GlsImportProjectsPage";
import ProjectFormPage from "@/contexts/sales/pages/ProjectFormPage";
import ProjectIntakePage from "@/contexts/sales/pages/ProjectIntakePage";
import KeepDeckPage from "@/contexts/sales/pages/KeepDeckPage";
import CustomerListPage from "@/contexts/sales/pages/CustomerListPage";
import CustomerDetailPage from "@/contexts/sales/pages/CustomerDetailPage";
import CompanyListPage from "@/contexts/sales/pages/CompanyListPage";
import PricingListPage from "@/contexts/sales/pages/PricingListPage";
import ActivityLogPage from "@/contexts/sales/pages/ActivityLogPage";
import AiActivityPage from "@/contexts/sales/pages/AiActivityPage";
import ReviewPage from "@/contexts/sales/pages/ReviewPage";
import ToolsPage from "@/contexts/shared/pages/ToolsPage";
import EstimatePage from "@/contexts/sales/pages/EstimatePage";
import ProjectGroupListPage from "@/contexts/sales/pages/ProjectGroupListPage";

// Tasks (タスク管理)

// Production (スタジオ予約)
import EpisodeListPage from "@/contexts/production/pages/EpisodeListPage";
import CallSheetPage from "@/contexts/production/pages/CallSheetPage";
import ManualPage from "@/contexts/production/pages/ManualPage";
import SignagePage from "@/contexts/production/pages/SignagePage";
import VendorReportPage from "@/contexts/production/pages/VendorReportPage";

// Finance (財務管理)
import VendorListPage from "@/contexts/finance/pages/VendorListPage";
import PartnerListPage from "@/contexts/finance/pages/PartnerListPage";
import BudgetDetailPage from "@/contexts/finance/pages/BudgetDetailPage";
import BillingWorkPage from "@/contexts/finance/pages/BillingWorkPage";
import JointEventsPage, { JointEventDetailPage } from "@/contexts/finance/pages/JointEventsPage";

// 機材管理は client-equipment/ が /equipment 配下で配信 (案件管理アプリ側では扱わない)
import SettingsPage from "@/contexts/platform/pages/SettingsPage";
import SettingsHubPage from "@/contexts/platform/pages/SettingsHubPage";
import NotificationPrefsPage from "@/contexts/platform/pages/NotificationPrefsPage";
import SlackDigestPage from "@/contexts/platform/pages/SlackDigestPage";

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
        {/*
          ===== 共通レールの行き先 (刷新後の正となるパス) =====
          §3.1 の4本 (/projects /tasks /schedule /finance) は表示をクエリで切り替える。
          いまは routeAdapters が既存の画面を出し分けている。画面そのものの作り直しは
            /projects → Phase 4 (一覧+ボード)
            /tasks    → Phase 5 (3スコープ×3表示)
            /customers→ Phase 6 (顧客360)
            /schedule → Phase 7 (1カレンダー)
            /finance  → Phase 8 (損益の流れ+3列レビュー)
            /settings → Phase 12 (役割テンプレート)
          が担当。URL は変わらないのでリンクを貼り直す必要はない。
        */}
        <Route path="/today" element={<TodayPage />} />
        {/* 検索結果の画面 (36章)。⌘K の「すべて見る」から来る。
            **権限で見えない種類はサーバーが返さない**ので、ここは権限で囲まない
            (囲むと「案件だけ見られる人」が検索そのものを開けなくなる) */}
        <Route path="/search" element={<SearchResultsPage />} />
        {/* お試し (25章)。練習は実績に混ざらない */}
        <Route path="/sales/sandbox" element={<PermissionRoute module="sales"><SandboxPage /></PermissionRoute>} />
        <Route path="/projects" element={<PermissionRoute module="sales"><ProjectsRoute /></PermissionRoute>} />
        <Route path="/tasks" element={<PermissionRoute anyOf={["sales", "dailyops"]}><TasksRoute /></PermissionRoute>} />
        <Route path="/customers" element={<PermissionRoute module="sales"><CustomerListPage /></PermissionRoute>} />
        <Route path="/customers/:id" element={<PermissionRoute module="sales"><CustomerDetailPage /></PermissionRoute>} />
        <Route path="/schedule" element={<PermissionRoute anyOf={["studio", "partner_schedule"]}><ScheduleRoute /></PermissionRoute>} />
        <Route path="/finance" element={<PermissionRoute module="budget"><FinanceRoute /></PermissionRoute>} />
        <Route path="/finance/import" element={<PermissionRoute module="budget"><FinanceImportRoute /></PermissionRoute>} />
        {/* 請求のしごと (31章 31a): 請求書を出す / 入金の確認 / 検収書を出す */}
        <Route path="/finance/billing" element={<PermissionRoute module="budget"><BillingWorkPage /></PermissionRoute>} />
        {/* 合同案件 (32章): 1回のイベントを複数社で開き、参加社数ぶんの請求書を出す */}
        <Route path="/finance/joint" element={<PermissionRoute module="budget"><JointEventsPage /></PermissionRoute>} />
        <Route path="/finance/joint/:id" element={<PermissionRoute module="budget"><JointEventDetailPage /></PermissionRoute>} />

        {/* 設定。入口 + 個別画面 (旧 /admin/* の新しい住所) */}
        <Route path="/settings" element={<SettingsHubPage />} />
        <Route path="/settings/notifications" element={<NotificationPrefsPage />} />
        {/* 朝の1通 (Slack) の配信設定。全社チャンネルに出るので管理者のみ */}
        <Route path="/settings/slack-digest" element={<PermissionRoute module="admin"><SlackDigestPage /></PermissionRoute>} />
        <Route path="/settings/users" element={<PermissionRoute module="admin"><UserListPage /></PermissionRoute>} />
        {/* この人にできること (§4.17 / 20b) — 役割テンプレート + 見えるレールのプレビュー */}
        <Route path="/settings/users/:id" element={<PermissionRoute module="admin"><UserPermissionPage /></PermissionRoute>} />
        <Route path="/settings/data-viewer" element={<PermissionRoute module="admin"><DataViewerPage /></PermissionRoute>} />
        <Route path="/settings/db-backups" element={<PermissionRoute module="admin"><DbBackupsPage /></PermissionRoute>} />
        <Route path="/settings/system" element={<PermissionRoute module="admin"><SettingsPage /></PermissionRoute>} />
        <Route path="/settings/billing-parties" element={<PermissionRoute module="sales"><CompanyListPage /></PermissionRoute>} />

        {/* ===== 営業管理 (sales) — 新URLに無いものはこのまま。⌘K から到達する ===== */}
        <Route path="/sales/dashboard" element={<PermissionRoute module="sales"><DashboardPage /></PermissionRoute>} />
        <Route path="/sales/gls-import" element={<PermissionRoute module="sales"><GlsImportProjectsPage /></PermissionRoute>} />
        {/* 起票は3項目だけ (14章 27b)。22項目のフォームは編集のときだけ使う */}
        <Route path="/sales/projects/new" element={<PermissionRoute module="sales"><ProjectIntakePage /></PermissionRoute>} />
        <Route path="/sales/projects/:id" element={<PermissionRoute module="sales"><ProjectFormPage /></PermissionRoute>} />
        <Route path="/sales/projects/:projectId/episodes" element={<PermissionRoute module="sales"><EpisodeListPage /></PermissionRoute>} />
        <Route path="/sales/projects/:projectId/estimates" element={<PermissionRoute module="sales"><EstimatePage /></PermissionRoute>} />
        <Route path="/sales/project-groups" element={<PermissionRoute module="sales"><ProjectGroupListPage /></PermissionRoute>} />
        <Route path="/sales/activity-logs" element={<PermissionRoute module="sales"><ActivityLogPage /></PermissionRoute>} />
        <Route path="/sales/ai-activity" element={<PermissionRoute module="sales"><AiActivityPage /></PermissionRoute>} />
        {/* ふりかえり (§4.18 / 21a) — レールには出さず ⌘K と お金 の画面から。旧2ルートはここへ寄せる */}
        <Route path="/review" element={<PermissionRoute module="sales"><ReviewPage /></PermissionRoute>} />
        {/* 現場の道具 (§4.14 / 12a) — レールとホームには出さない。案件か ⌘K から */}
        <Route path="/tools" element={<PermissionRoute module="sales"><ToolsPage /></PermissionRoute>} />
        <Route path="/sales/keep-report" element={<RedirectPreserveState to="/review?tab=keep" />} />
        {/* 隔週キープをつくる (29章): 型は Ver.2.5 のまま、AIが16ページ埋めて人は2ページ書く */}
        <Route path="/sales/keep" element={<PermissionRoute module="sales"><KeepDeckPage /></PermissionRoute>} />
        {/* 香盤表 (21章 28a): 当日の動きを1枚に。案件の日程・予約・Qシート・機材から自動で組む */}
        <Route path="/sales/projects/:id/call-sheet" element={<PermissionRoute module="sales"><CallSheetPage /></PermissionRoute>} />
        {/* 運営マニュアル (22章 29a-c): 部品12種を束ねて1冊に。会場図はAIが下書き */}
        <Route path="/sales/projects/:id/manual" element={<PermissionRoute module="sales"><ManualPage /></PermissionRoute>} />
        <Route path="/sales/review" element={<RedirectPreserveState to="/review?tab=sales" />} />
        <Route path="/sales/pricing" element={<PermissionRoute module="sales"><PricingListPage /></PermissionRoute>} />

        {/* ===== 財務管理 (budget) — 新URLに無いもの ===== */}
        <Route path="/budget/vendors" element={<PermissionRoute module="budget"><VendorListPage /></PermissionRoute>} />
        <Route path="/budget/partners" element={<PermissionRoute module="budget"><PartnerListPage /></PermissionRoute>} />
        <Route path="/budget/reports/vendors" element={<PermissionRoute module="budget"><VendorReportPage /></PermissionRoute>} />
        <Route path="/budget/detail" element={<PermissionRoute module="budget"><BudgetDetailPage /></PermissionRoute>} />

        {/* 機材管理 (/equipment/*) は client-equipment/ が Nginx 経由で配信 */}

        {/*
          ===== 旧URL → 新URL (§3.3「必須・削除しない」) =====
          ブックマーク・過去のメール・Slack のリンクを壊さないため、消さずに残す。
        */}
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/sales/inbox" element={<Navigate to="/today" replace />} />

        <Route path="/sales/projects" element={<Navigate to="/projects" replace />} />
        <Route path="/sales/pipeline" element={<Navigate to="/projects?view=board" replace />} />
        <Route path="/sales/projects/confirmed/:category" element={<RedirectConfirmed />} />

        <Route path="/sales/tasks" element={<Navigate to="/tasks?scope=all&view=board" replace />} />
        <Route path="/sales/tasks/:view" element={<RedirectTaskView />} />
        <Route path="/sales/projects/:projectId/tasks" element={<RedirectTo to="/tasks?scope=project&project=:projectId" />} />

        <Route path="/sales/customers" element={<Navigate to="/customers" replace />} />
        <Route path="/sales/customers/:id" element={<RedirectTo to="/customers/:id" />} />
        <Route path="/sales/companies" element={<Navigate to="/settings/billing-parties" replace />} />

        <Route path="/studio/all" element={<RedirectPreserveState to="/schedule" />} />
        <Route path="/studio/calendar" element={<RedirectPreserveState to="/schedule?layers=studio" />} />
        <Route path="/studio/partners" element={<RedirectPreserveState to="/schedule?layers=partner" />} />
        <Route path="/studio/my-calendar" element={<RedirectPreserveState to="/schedule?layers=me" />} />

        <Route path="/budget/dashboard" element={<Navigate to="/finance" replace />} />
        <Route path="/budget/revenues" element={<Navigate to="/finance?tab=revenue" replace />} />
        <Route path="/budget/purchases" element={<Navigate to="/finance?tab=purchase" replace />} />
        <Route path="/budget/sga" element={<Navigate to="/finance?tab=sga" replace />} />
        <Route path="/budget/xpoint-import" element={<Navigate to="/finance/import?tool=xpoint" replace />} />
        <Route path="/budget/kessan-import" element={<Navigate to="/finance/import?tool=kessan" replace />} />
        <Route path="/budget/dedup-screening" element={<Navigate to="/finance/import?tool=dedup" replace />} />

        <Route path="/admin/users" element={<Navigate to="/settings/users" replace />} />
        <Route path="/admin/data-viewer" element={<Navigate to="/settings/data-viewer" replace />} />
        <Route path="/admin/db-backups" element={<Navigate to="/settings/db-backups" replace />} />
        <Route path="/admin/settings" element={<Navigate to="/settings/system" replace />} />
        <Route path="/admin/kessan-import" element={<Navigate to="/finance/import?tool=kessan" replace />} />

        {/* ブロックアプリ インデックス (BLOCK_APPS.basePath 対応) */}
        <Route path="/sales" element={<Navigate to="/projects" replace />} />
        <Route path="/budget" element={<Navigate to="/finance" replace />} />
        <Route path="/studio" element={<Navigate to="/schedule" replace />} />

        {/* さらに古いURL */}
        <Route path="/projects/*" element={<Navigate to="/projects" replace />} />
        <Route path="/revenues" element={<Navigate to="/finance?tab=revenue" replace />} />
        <Route path="/purchases" element={<Navigate to="/finance?tab=purchase" replace />} />
        <Route path="/sga" element={<Navigate to="/finance?tab=sga" replace />} />
        <Route path="/calendar" element={<Navigate to="/schedule?layers=studio" replace />} />
        <Route path="/masters/customers" element={<Navigate to="/customers" replace />} />
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
