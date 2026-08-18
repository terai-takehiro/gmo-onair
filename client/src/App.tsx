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
import InquiryQuickPage from "@/contexts/sales/pages/InquiryQuickPage";
import MeetingRecordPage from "@/contexts/sales/pages/MeetingRecordPage";
import GlsImportProjectsPage from "@/contexts/sales/pages/GlsImportProjectsPage";
import ProjectFormPage from "@/contexts/sales/pages/ProjectFormPage";
import NewProjectDialog from "@/contexts/sales/pages/projectNew/NewProjectDialog";
import ProjectLedgerPage from "@/contexts/sales/pages/ProjectLedgerPage";
import ProjectDetailPage from "@/contexts/sales/pages/ProjectDetailPage";
import CustomerDetailPage from "@/contexts/sales/pages/CustomerDetailPage";
import CompanyListPage from "@/contexts/sales/pages/CompanyListPage";
import PricingListPage from "@/contexts/sales/pages/PricingListPage";
import FlowTemplatePage from "@/contexts/sales/pages/flow/FlowTemplatePage";
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

/**
 * 旧 URL からの転送で**クエリ文字列を落とさない**。
 *
 * `<Navigate to="/sales/projects/new" replace />` はパスだけを見るので、
 * `/sales/inbox?inquiry=123` から来た人は**引き合いの id を失ったまま**
 * 案件作成に着きます。案件作成は `?inquiry=` を読んで「元の情報に案件になったと
 * 書き戻す」ので、落ちると**未仕分けに残って翌日また送られ、同じ引き合いから
 * 案件が2件できます**（`projectNew/useCreateProject.ts` が警戒している壊れ方）。
 *
 * 行き先が自分でクエリを持っているとき（`?src=pdf` など）は**行き先を勝つ**
 * ようにして混ぜます — 転送先を決めているのはこちらなので、
 * 元 URL の同名の値で上書きされると転送の意味が消えます。
 */
function RedirectKeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  const [path, ownQuery] = to.split('?');
  const params = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(ownQuery || '')) params.set(k, v);
  const q = params.toString();
  return <Navigate to={q ? `${path}?${q}` : path} replace />;
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
        {/* **つくると直すは同じ項目・同じ見た目。** 入力欄はどちらも
            `projectNew/RequiredFields` と `projectNew/MoreFields` を使う。
            直す画面（`/edit`）だけが持つのは、BOX の URL・申込書・番組情報・
            スタジオの日程・担当メンバーと、GLS の操作 */}
        <Route path="/sales/projects/new" element={<PermissionRoute module="sales" minLevel="editor"><NewProjectDialog /></PermissionRoute>} />
        {/*
            案件台帳。**案件一覧（`/sales/projects`）とは役割が別**で、
            列を出し入れして網羅して見る・選んでまとめて直すための画面
            （機材台帳と同じ役割）。読むのは `sales` があれば誰でも —
            まとめて直すところだけ画面の中で manager に絞る
            （サーバーの `PATCH /projects/bulk` も manager で止めている）。
            ⚠️ **`/sales/projects/:id` より前に置く**。React Router は静的な区切りを
            優先するので順番でも動くが、`pcOnlyScreens` の表は**先に一致したものが勝つ**ので
            そちらと並びを揃えておく
        */}
        <Route path="/sales/projects/ledger" element={<PermissionRoute module="sales"><ProjectLedgerPage /></PermissionRoute>} />
        {/*
            v4 ⑥: 案件詳細は**読む画面**（タブ付き）で、直すのは `/edit`。
            1つの画面で読むと直すを兼ねると、開いた瞬間に入力欄が縦に並んで
            「いまどうなっているか」が読めなくなる。
            `:tab` は `/sales/projects/:projectId/episodes` などの静的なルートより
            後に評価される（React Router は静的な区切りを優先する）
        */}
        <Route path="/sales/projects/:id" element={<PermissionRoute module="sales"><ProjectDetailPage /></PermissionRoute>} />
        <Route path="/sales/projects/:id/edit" element={<PermissionRoute module="sales"><ProjectFormPage /></PermissionRoute>} />
        <Route path="/sales/projects/:id/:tab" element={<PermissionRoute module="sales"><ProjectDetailPage /></PermissionRoute>} />
        {/*
            **ビジネス（GLS-B）はプロジェクト管理へ移した** (migration 179)。
            旧 URL はブックマークされているので転送する。
            `/studio` より先に置くこと（React Router は静的な区切りを優先するが、
            同じ深さの動的区間より前に書いておくほうが読み違えない）
        */}
        <Route path="/sales/projects/confirmed/business" element={<RedirectKeepQuery to="/gpm/projects" />} />
        <Route path="/sales/projects/confirmed/:category" element={<PermissionRoute module="sales"><ConfirmedProjectsPage /></PermissionRoute>} />
        {/*
            ⚠️ **転送先は `task` です。** 2026-08 に「エピソード（回）」タブごと
            外し（正のモックのタブバーに無かった）、**回の表と「回を足す」は
            タスクタブへ移しました**（`tasks/components/EpisodesPanel.tsx`）。
            ここが `episode` を指したままだと `ProjectTabKey` に無い値なので
            **黙って概要タブに落ち**、回を見に来た人が探す場所を失います。
        */}
        <Route path="/sales/projects/:projectId/episodes" element={<RedirectToDetailTab tab="task" />} />
        <Route path="/sales/projects/:projectId/estimates" element={<RedirectToDetailTab tab="estimate" />} />
        {/* v4 ⑥-B: 案件のタスクは案件詳細の「タスク」タブに畳んだ (ブックマークは生かす) */}
        <Route path="/sales/projects/:projectId/tasks" element={<RedirectToDetailTab tab="task" />} />
        <Route path="/sales/tasks" element={<RedirectKeepQuery to="/sales/tasks/kanban" />} />
        <Route path="/sales/tasks/:view" element={<PermissionRoute module="sales"><TaskDashboardPage /></PermissionRoute>} />
        <Route path="/sales/project-groups" element={<PermissionRoute module="sales"><ProjectGroupListPage /></PermissionRoute>} />
        {/*
            ② 受付は**案件作成に畳みました**（指示書 第1章）。届いたものを読んで、
            足りないところを埋めて、案件にするかどうかを決める仕事は案件作成と
            同じだったので、1画面にしています。
            **URL は生かします** — ブックマーク・ホームの「お待たせ中」・
            通知から来る道があり、消すと 404 に着きます
        */}
        <Route path="/sales/inbox" element={<RedirectKeepQuery to="/sales/projects/new" />} />
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
        <Route path="/sales/pipeline" element={<RedirectKeepQuery to="/sales/projects?view=board" />} />
        <Route path="/sales/activity-logs" element={<PermissionRoute module="sales"><ActivityLogPage /></PermissionRoute>} />
        <Route path="/sales/ai-activity" element={<PermissionRoute module="sales"><AiActivityPage /></PermissionRoute>} />
        <Route path="/sales/keep-report" element={<PermissionRoute module="sales"><KeepReportPage /></PermissionRoute>} />
        <Route path="/sales/review" element={<PermissionRoute module="sales"><SalesReviewPage /></PermissionRoute>} />
        {/* 顧客の一覧は取引先マスターの「顧客」絞り込みへ一本化した（Phase 2）。360°ビューは残す */}
        <Route path="/sales/customers" element={<RedirectKeepQuery to="/sales/companies?role=customer" />} />
        <Route path="/sales/customers/:id" element={<PermissionRoute module="sales"><CustomerDetailPage /></PermissionRoute>} />
        <Route path="/sales/companies" element={<PermissionRoute module="sales"><CompanyListPage /></PermissionRoute>} />
        <Route path="/sales/pricing" element={<PermissionRoute module="sales"><PricingListPage /></PermissionRoute>} />
        <Route path="/sales/flow-templates" element={<PermissionRoute module="sales"><FlowTemplatePage /></PermissionRoute>} />
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
        <Route path="/budget/xpoint-import" element={<RedirectKeepQuery to="/budget/import?src=pdf" />} />
        <Route path="/budget/kessan-import" element={<RedirectKeepQuery to="/budget/import?src=gl" />} />
        <Route path="/budget/dedup-screening" element={<RedirectKeepQuery to="/budget/import?src=dedup" />} />
        {/* v4 ⑧: 仕入先とパートナーを1画面のタブにまとめた。旧 URL は転送する */}
        <Route path="/budget/vendors" element={<PermissionRoute module="budget"><CounterpartyPage /></PermissionRoute>} />
        <Route path="/budget/partners" element={<RedirectKeepQuery to="/budget/vendors?tab=partner" />} />
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
        <Route path="/studio/all" element={<RedirectKeepQuery to="/studio/calendar" />} />

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
        <Route path="/admin/kessan-import" element={<RedirectKeepQuery to="/budget/import?src=gl" />} />
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
        <Route path="/projects" element={<RedirectKeepQuery to="/sales/projects" />} />
        <Route path="/projects/*" element={<Navigate to="/sales/projects" replace />} />
        <Route path="/revenues" element={<RedirectKeepQuery to="/budget/revenues" />} />
        <Route path="/purchases" element={<RedirectKeepQuery to="/budget/purchases" />} />
        <Route path="/sga" element={<RedirectKeepQuery to="/budget/sga" />} />
        <Route path="/calendar" element={<RedirectKeepQuery to="/studio/calendar" />} />
        <Route path="/masters/customers" element={<RedirectKeepQuery to="/sales/customers" />} />
        <Route path="/masters/pricing" element={<RedirectKeepQuery to="/sales/pricing" />} />
        <Route path="/masters/vendors" element={<RedirectKeepQuery to="/budget/vendors" />} />
        <Route path="/masters/partners" element={<RedirectKeepQuery to="/budget/partners" />} />
        <Route path="/reports/vendors" element={<RedirectKeepQuery to="/budget/reports/vendors" />} />
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
