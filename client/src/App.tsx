import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
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
import MembersPage from "@/contexts/platform/pages/members/MembersPage";
import DataViewerPage from "@/contexts/platform/pages/DataViewerPage";
import DbBackupsPage from "@/contexts/platform/pages/DbBackupsPage";

// Sales (営業管理)
import DashboardPage from "@/contexts/platform/pages/DashboardPage";
import ProjectListPage from "@/contexts/sales/pages/ProjectListPage";
import InboxPage from "@/contexts/sales/pages/InboxPage";
import InquiryQuickPage from "@/contexts/sales/pages/InquiryQuickPage";
import MeetingRecordPage from "@/contexts/sales/pages/MeetingRecordPage";
import GlsImportProjectsPage from "@/contexts/sales/pages/GlsImportProjectsPage";
import ProjectFormPage from "@/contexts/sales/pages/ProjectFormPage";
import NewProjectDialog from "@/contexts/sales/pages/projectNew/NewProjectDialog";
import ProjectDetailPage from "@/contexts/sales/pages/ProjectDetailPage";
import CustomerListPage from "@/contexts/sales/pages/CustomerListPage";
import CustomerDetailPage from "@/contexts/sales/pages/CustomerDetailPage";
import CompanyListPage from "@/contexts/sales/pages/CompanyListPage";
import PricingListPage from "@/contexts/sales/pages/PricingListPage";
import BillingListPage from "@/contexts/sales/pages/BillingListPage";
import ActivityLogPage from "@/contexts/sales/pages/ActivityLogPage";
import AiActivityPage from "@/contexts/sales/pages/AiActivityPage";
import KeepReportPage from "@/contexts/sales/pages/KeepReportPage";
import SalesReviewPage from "@/contexts/sales/pages/SalesReviewPage";
import ConfirmedProjectsPage from "@/contexts/sales/pages/ConfirmedProjectsPage";
import ProjectGroupListPage from "@/contexts/sales/pages/ProjectGroupListPage";

// Tasks (タスク管理)
import TaskDashboardPage from "@/contexts/tasks/pages/TaskDashboardPage";

// GPM (プロジェクト管理 — v4 で新規)
import GpmDashboardPage from "@/contexts/gpm/pages/GpmDashboardPage";
import GpmProjectListPage from "@/contexts/gpm/pages/GpmProjectListPage";
import GpmProjectFormPage from "@/contexts/gpm/pages/GpmProjectFormPage";
import GpmProjectDetailPage from "@/contexts/gpm/pages/GpmProjectDetailPage";
import GpmTaskListPage from "@/contexts/gpm/pages/GpmTaskListPage";
import GpmTemplateListPage from "@/contexts/gpm/pages/GpmTemplateListPage";

// Production (スタジオ予約)
import RoomAvailabilityPage from '@/contexts/production/pages/RoomAvailabilityPage';
import HoldListPage from '@/contexts/production/pages/HoldListPage';
import CalendarSettingsPage from '@/contexts/production/pages/CalendarSettingsPage';
import StudioCalendarPage from "@/contexts/production/pages/StudioCalendarPage";
import PartnerSchedulePage from "@/contexts/production/pages/PartnerSchedulePage";
import MyCalendarPage from "@/contexts/production/pages/MyCalendarPage";
import UnifiedCalendarPage from "@/contexts/production/pages/UnifiedCalendarPage";
import SignagePage from "@/contexts/production/pages/SignagePage";
import VendorReportPage from "@/contexts/production/pages/VendorReportPage";

// Finance (財務管理)
import RevenueListPage from "@/contexts/finance/pages/RevenueListPage";
import ClosingPage from "@/contexts/finance/pages/ClosingPage";
import DocumentsPage from "@/contexts/finance/pages/DocumentsPage";
import PurchaseListPage from "@/contexts/finance/pages/PurchaseListPage";
import SgaListPage from "@/contexts/finance/pages/SgaListPage";
import ImportPage from "@/contexts/finance/pages/ImportPage";
import CounterpartyPage from "@/contexts/finance/pages/CounterpartyPage";
import BudgetDetailPage from "@/contexts/finance/pages/BudgetDetailPage";
import BudgetDashboardPage from "@/contexts/finance/pages/BudgetDashboardPage";

// 機材管理は client-equipment/ が /equipment 配下で配信 (案件管理アプリ側では扱わない)
import SearchPage from "@/contexts/platform/pages/SearchPage";
import SettingsHubPage from "@/contexts/platform/pages/SettingsHubPage";
import SitesPage from "@/contexts/platform/pages/SitesPage";
import SystemInfoPage from "@/contexts/platform/pages/SystemInfoPage";
import MoneyRulesPage from "@/contexts/platform/pages/money/MoneyRulesPage";
import HoursPage from "@/contexts/platform/pages/hours/HoursPage";
import NotifyPage from "@/contexts/platform/pages/notify/NotifyPage";

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

/**
 * 旧 `/sales/projects/:projectId/{tasks,episodes,estimates}` — v4 ⑥ で
 * 案件詳細のタブに畳んだ。**ブックマークと配布済みのリンクを生かすための転送**。
 */
/** 旧 `/admin/*` → `/settings/*`。`/admin/settings` だけは `/settings` に畳む */
function RedirectAdminToSettings() {
  const { pathname, search } = useLocation();
  const rest = pathname.replace(/^\/admin\/?/, '');
  const to = rest === '' || rest === 'settings' ? '/settings' : `/settings/${rest}`;
  return <Navigate to={to + search} replace />;
}

function RedirectToDetailTab({ tab }: { tab: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/sales/projects/${projectId}/${tab}`} replace />;
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
        {/*
            探す（スマホの下タブ 3つ目）。**権限を掛けない** —
            `GET /search` が種類ごとに権限を見て、権限が無い種類は空で返す
            （画面で止めると、案件だけの人・経理だけの人が検索そのものを使えなくなる）
        */}
        <Route path="/search" element={<SearchPage />} />

        {/* ===== 営業管理 (sales) ===== */}
        <Route path="/sales/dashboard" element={<PermissionRoute module="sales"><DashboardPage /></PermissionRoute>} />
        <Route path="/sales/projects" element={<PermissionRoute module="sales"><ProjectListPage /></PermissionRoute>} />
        <Route path="/sales/gls-import" element={<PermissionRoute module="sales"><GlsImportProjectsPage /></PermissionRoute>} />
        {/* **つくるのは全画面1枚（v4 のモック）、直すのは今までのフォーム。**
            あちらは BOX の URL・按分・申込書・見積のシミュレーションまで扱う画面で、
            登録の16項目とは目的が違う（電話中に開く画面に使わない欄が数十個並ぶ） */}
        <Route path="/sales/projects/new" element={<PermissionRoute module="sales" minLevel="editor"><NewProjectDialog /></PermissionRoute>} />
        {/*
            v4 ⑥: 案件詳細は**読む画面**（タブ付き）になった。直すのは /edit の
            いままでのフォームそのまま。枠の入れ替えと中身の作り直しを同じ回でやると、
            どちらが原因で壊れたのか切り分けられなくなるので分けてある。
            `:tab` は `/sales/projects/:projectId/episodes` などの静的なルートより
            後に評価される（React Router は静的な区切りを優先する）
        */}
        <Route path="/sales/projects/:id" element={<PermissionRoute module="sales"><ProjectDetailPage /></PermissionRoute>} />
        <Route path="/sales/projects/:id/edit" element={<PermissionRoute module="sales"><ProjectFormPage /></PermissionRoute>} />
        <Route path="/sales/projects/:id/:tab" element={<PermissionRoute module="sales"><ProjectDetailPage /></PermissionRoute>} />
        <Route path="/sales/projects/confirmed/:category" element={<PermissionRoute module="sales"><ConfirmedProjectsPage /></PermissionRoute>} />
        <Route path="/sales/projects/:projectId/episodes" element={<RedirectToDetailTab tab="episode" />} />
        <Route path="/sales/projects/:projectId/estimates" element={<RedirectToDetailTab tab="estimate" />} />
        {/* v4 ⑥-B: 案件のタスクは案件詳細の「タスク」タブに畳んだ (ブックマークは生かす) */}
        <Route path="/sales/projects/:projectId/tasks" element={<RedirectToDetailTab tab="task" />} />
        <Route path="/sales/tasks" element={<Navigate to="/sales/tasks/kanban" replace />} />
        <Route path="/sales/tasks/:view" element={<PermissionRoute module="sales"><TaskDashboardPage /></PermissionRoute>} />
        <Route path="/sales/project-groups" element={<PermissionRoute module="sales"><ProjectGroupListPage /></PermissionRoute>} />
        <Route path="/sales/inbox" element={<PermissionRoute module="sales"><InboxPage /></PermissionRoute>} />
        {/*
            ⑦ 受付（貼って送るだけ）— スマホで外から入れる口。
            **`dailyops` か `sales` のどちらかで通す** — 受け側の
            `POST /dailyops/inquiries` がその2つを見るので、片方だけにすると
            もう片方の人が送れない
        */}
        <Route path="/sales/inbox/new" element={<PermissionRoute anyOf={["sales", "dailyops"]} minLevel="editor"><InquiryQuickPage /></PermissionRoute>} />
        {/*
            ⑤ 打合せを録音（スマホ）。録音の部品と送り先は案件詳細の
            「やり取り」と**同じもの**（`RecordDialog` / `POST /projects/:id/minutes`）。
            サーバーは `sales` の editor を要求する
        */}
        <Route path="/sales/record" element={<PermissionRoute module="sales" minLevel="editor"><MeetingRecordPage /></PermissionRoute>} />
        {/* v4: ヨミ・パイプラインは案件一覧の「ボード」表示に畳んだ (別画面だと絞り込みが引き継げず、
            一覧と別のエンドポイントを叩いていたため件数と金額が食い違っていた) */}
        <Route path="/sales/pipeline" element={<Navigate to="/sales/projects?view=board" replace />} />
        <Route path="/sales/activity-logs" element={<PermissionRoute module="sales"><ActivityLogPage /></PermissionRoute>} />
        <Route path="/sales/ai-activity" element={<PermissionRoute module="sales"><AiActivityPage /></PermissionRoute>} />
        <Route path="/sales/keep-report" element={<PermissionRoute module="sales"><KeepReportPage /></PermissionRoute>} />
        <Route path="/sales/review" element={<PermissionRoute module="sales"><SalesReviewPage /></PermissionRoute>} />
        <Route path="/sales/customers" element={<PermissionRoute module="sales"><CustomerListPage /></PermissionRoute>} />
        <Route path="/sales/customers/:id" element={<PermissionRoute module="sales"><CustomerDetailPage /></PermissionRoute>} />
        <Route path="/sales/companies" element={<PermissionRoute module="sales"><CompanyListPage /></PermissionRoute>} />
        <Route path="/sales/pricing" element={<PermissionRoute module="sales"><PricingListPage /></PermissionRoute>} />
        <Route path="/sales/billing" element={<PermissionRoute module="sales"><BillingListPage /></PermissionRoute>} />

        {/* ===== プロジェクト管理 (gpm) — v4 で新規 =====
            工程で管理する構築案件。**案件管理 (`/sales`) とは別のテーブル**で、
            売れるかどうかを追う段階（ヨミ）は持たない（着手＝発注確定）。
            理由は `docs/design/gpm-model.md`。
            **見積・請求の画面はまだ作っていない** — `estimates` にモックが持つ
            「提出先」の列が無く、足すと案件管理の見積画面に影響するため */}
        <Route path="/gpm/dashboard" element={<PermissionRoute module="gpm"><GpmDashboardPage /></PermissionRoute>} />
        <Route path="/gpm/projects" element={<PermissionRoute module="gpm"><GpmProjectListPage /></PermissionRoute>} />
        <Route path="/gpm/projects/new" element={<PermissionRoute module="gpm" minLevel="editor"><GpmProjectFormPage /></PermissionRoute>} />
        <Route path="/gpm/projects/:id" element={<PermissionRoute module="gpm"><GpmProjectDetailPage /></PermissionRoute>} />
        <Route path="/gpm/projects/:id/:tab" element={<PermissionRoute module="gpm"><GpmProjectDetailPage /></PermissionRoute>} />
        <Route path="/gpm/tasks" element={<PermissionRoute module="gpm"><GpmTaskListPage /></PermissionRoute>} />
        <Route path="/gpm/templates" element={<PermissionRoute module="gpm"><GpmTemplateListPage /></PermissionRoute>} />

        {/* ===== 財務管理 (budget) ===== */}
        {/* v4 ⑥: 受け取った書類。日常業務から財務へ移した（経理が開けなかったため）。
            **権限は budget か dailyops のどちらか** — いま見られる人は見られたまま */}
        <Route path="/budget/documents" element={<PermissionRoute anyOf={["budget", "dailyops"]}><DocumentsPage /></PermissionRoute>} />
        <Route path="/budget/billing" element={<PermissionRoute module="budget"><ClosingPage /></PermissionRoute>} />
        <Route path="/budget/revenues" element={<PermissionRoute module="budget"><RevenueListPage /></PermissionRoute>} />
        <Route path="/budget/purchases" element={<PermissionRoute module="budget"><PurchaseListPage /></PermissionRoute>} />
        <Route path="/budget/sga" element={<PermissionRoute module="budget"><SgaListPage /></PermissionRoute>} />
        {/* v4 ⑦: 精算PDF・総勘定元帳・二重計上を1画面3タブにまとめた。
            **旧 URL は毎月使う業務画面なので必ず生かす**（転送先はタブ）。
            権限は画面の中で出し分ける（総勘定元帳と二重計上は system_admin だけ） */}
        <Route path="/budget/import" element={<PermissionRoute anyOf={["budget", "admin"]}><ImportPage /></PermissionRoute>} />
        <Route path="/budget/xpoint-import" element={<Navigate to="/budget/import?src=pdf" replace />} />
        <Route path="/budget/kessan-import" element={<Navigate to="/budget/import?src=gl" replace />} />
        <Route path="/budget/dedup-screening" element={<Navigate to="/budget/import?src=dedup" replace />} />
        {/* v4 ⑧: 仕入先とパートナーを1画面のタブにまとめた。旧 URL は転送する */}
        <Route path="/budget/vendors" element={<PermissionRoute module="budget"><CounterpartyPage /></PermissionRoute>} />
        <Route path="/budget/partners" element={<Navigate to="/budget/vendors?tab=partner" replace />} />
        <Route path="/budget/reports/vendors" element={<PermissionRoute module="budget"><VendorReportPage /></PermissionRoute>} />
        <Route path="/budget/detail" element={<PermissionRoute module="budget"><BudgetDetailPage /></PermissionRoute>} />
        <Route path="/budget/dashboard" element={<PermissionRoute module="budget"><BudgetDashboardPage /></PermissionRoute>} />

        {/* ===== スタジオ予約 (studio) ===== */}
        {/*
          v4 カレンダー: モックの4画面（① 予定 / ② 部屋の空き / ③ 仮押さえ / ④ 設定）。
          **① 予定は「1本のカレンダー＋レイヤー」** なので、いままで `/studio/all` に
          いた統合カレンダーをここへ持ってきた（`/studio/all` は転送）。
          スタジオだけのカレンダーは「そのほか（作り直し前）」に残す — 予約を作る導線が
          あちらにしかないため、先に消すと作れなくなる
        */}
        <Route path="/studio/calendar" element={<PermissionRoute anyOf={["studio", "partner_schedule"]}><UnifiedCalendarPage /></PermissionRoute>} />
        <Route path="/studio/rooms" element={<PermissionRoute module="studio"><RoomAvailabilityPage /></PermissionRoute>} />
        <Route path="/studio/holds" element={<PermissionRoute module="studio"><HoldListPage /></PermissionRoute>} />
        {/*
            **`studio` か `partner_schedule` のどちらかで通す。** 3つのタブは
            別々の口を叩き、外部カレンダーだけ `/schedule/*`（`partner_schedule` の
            editor）を使う。`studio` だけで括ると **`partner_schedule` だけの人が
            自分のフィード設定に来られない**（画面の中でタブを出し分ける）
        */}
        <Route path="/studio/settings" element={<PermissionRoute anyOf={["studio", "partner_schedule"]}><CalendarSettingsPage /></PermissionRoute>} />
        <Route path="/studio/studio-calendar" element={<PermissionRoute module="studio"><StudioCalendarPage /></PermissionRoute>} />
        <Route path="/studio/partners" element={<PermissionRoute module="partner_schedule"><PartnerSchedulePage /></PermissionRoute>} />
        <Route path="/studio/my-calendar" element={<PermissionRoute module="partner_schedule"><MyCalendarPage /></PermissionRoute>} />
        <Route path="/studio/all" element={<Navigate to="/studio/calendar" replace />} />

        {/* 機材管理 (/equipment/*) は client-equipment/ が Nginx 経由で配信 */}

        {/* ===== システム管理 (admin) ===== */}
        <Route path="/settings/users" element={<PermissionRoute module="admin"><MembersPage /></PermissionRoute>} />
        {/* ⑤ お金のルール。**読むのは budget の reader**（見積を作る人は税率と期日を知る必要がある）。直せるのは manager だけで、それは画面とサーバーの両方で見ている */}
        <Route path="/settings/money" element={<PermissionRoute module="budget"><MoneyRulesPage /></PermissionRoute>} />
        {/* ⑥ 休日・営業時間。読むのは `studio` の reader（予約を入れる人は取れる時間を知る必要がある）。直せるのは system_admin だけで、拠点・部屋と揃えてある */}
        <Route path="/settings/hours" element={<PermissionRoute module="studio"><HoursPage /></PermissionRoute>} />
        {/* ⑦ 通知とテンプレート。読むのは `admin` の reader（文面をコピーして使う人が来る）。直せるのは system_admin だけ */}
        <Route path="/settings/notify" element={<PermissionRoute module="admin"><NotifyPage /></PermissionRoute>} />
        <Route path="/settings/data-viewer" element={<PermissionRoute module="admin"><DataViewerPage /></PermissionRoute>} />
        <Route path="/settings/db-backups" element={<PermissionRoute module="admin"><DbBackupsPage /></PermissionRoute>} />
        {/* 決算インポートは v4 で「取り込み」に畳んだ。旧URLは二段で転送する */}
        <Route path="/admin/kessan-import" element={<Navigate to="/budget/import?src=gl" replace />} />
        {/*
            v4: 設定は `/admin/*` → `/settings/*` に改名した。「設定」は権限・お金のルール・
            休日など**管理者専用ではない業務設定**を含むので `/admin` は誤解を招く。
            旧 URL はブックマークを生かすためにまとめて転送する
        */}
        <Route path="/admin/*" element={<RedirectAdminToSettings />} />
        {/*
            v4 設定トップは**案内板**なので権限を掛けない。掛けると
            料金表 (sales) や取引先 (budget) だけを直す人が来られなくなる。
            **カードは1枚ずつ権限で出し分ける**ので、ここで見えるのは
            その人が実際に開けるものだけ (`settings/hubCards.ts`)
        */}
        <Route path="/settings" element={<SettingsHubPage />} />
        <Route path="/settings/sites" element={<PermissionRoute module="studio"><SitesPage /></PermissionRoute>} />
        {/*
            旧 `/settings` の中身 (版・バックアップ・パスワード変更・アプリ一覧)。
            **権限を掛けない** — 旧画面は `admin` 必須だったので
            **パスワードを変えたい人が管理者しか来られなかった**。
            全データバックアップだけ画面の中で `system_admin` に絞る
        */}
        <Route path="/settings/system" element={<SystemInfoPage />} />

        {/* 入口の URL からその中の最初の画面へ (アプリ登録の path に対応) */}
        {/*
          アプリ切替の「案件管理」やトップページのタイルはここに来る。
          **ダッシュボードに送る** — 財務 (`/budget/dashboard`) と揃える。
          v4 の情報設計でもダッシュボードが入口の1番目。
          以前は案件一覧に送っており、「トップを押してもダッシュボードにならない」状態だった。
        */}
        <Route path="/sales" element={<Navigate to="/sales/dashboard" replace />} />
        <Route path="/budget" element={<Navigate to="/budget/dashboard" replace />} />
        <Route path="/gpm" element={<Navigate to="/gpm/dashboard" replace />} />
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
