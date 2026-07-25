/**
 * routeAdapters — 新ルート (§3.1) をクエリで振り分けるアダプタ + 旧URLのリダイレクト (§3.3)
 *
 * 刷新後の正は `/projects` `/tasks` `/schedule` `/finance` の4本で、
 * 表示の切り替えはクエリ (`?view=` `?tab=` `?layers=` `?scope=`) で行う。
 *
 * ここは「新URLを受けて既存の画面を出す」層。画面そのものを作り直すのは
 * Phase 4 (案件) / 5 (タスク) / 7 (予定) / 8 (お金) の担当で、
 * その時にアダプタの中身を差し替えれば URL は変わらない。
 *
 * 旧URLは削除せずリダイレクトで残す (§3.3「必須・削除しない」)。
 * ブックマーク・過去のメール・Slack のリンクを壊さないため。
 */
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { FileSearch, FlaskConical, CopyCheck, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";

import ProjectListPage from "@/contexts/sales/pages/ProjectListPage";
import PipelinePage from "@/contexts/sales/pages/PipelinePage";
import ConfirmedProjectsPage from "@/contexts/sales/pages/ConfirmedProjectsPage";
import TaskDashboardPage from "@/contexts/tasks/pages/TaskDashboardPage";
import ProjectTasksPage from "@/contexts/tasks/pages/ProjectTasksPage";
import StudioCalendarPage from "@/contexts/production/pages/StudioCalendarPage";
import PartnerSchedulePage from "@/contexts/production/pages/PartnerSchedulePage";
import MyCalendarPage from "@/contexts/production/pages/MyCalendarPage";
import UnifiedCalendarPage from "@/contexts/production/pages/UnifiedCalendarPage";
import BudgetDashboardPage from "@/contexts/finance/pages/BudgetDashboardPage";
import RevenueListPage from "@/contexts/finance/pages/RevenueListPage";
import PurchaseListPage from "@/contexts/finance/pages/PurchaseListPage";
import SgaListPage from "@/contexts/finance/pages/SgaListPage";
import XpointImportPage from "@/contexts/finance/pages/XpointImportPage";
import KessanImportPage from "@/contexts/platform/pages/KessanImportPage";
import DedupScreeningPage from "@/contexts/platform/pages/DedupScreeningPage";

// ─────────────────────────────────────────────
// 旧URL → 新URL
// ─────────────────────────────────────────────

/**
 * パスのパラメータを新URLに差し込んでリダイレクトする。
 * 例: <RedirectTo to="/tasks?scope=project&project=:projectId" />
 */
export function RedirectTo({ to }: { to: string }) {
  const params = useParams();
  const resolved = to.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, key: string) => {
    const v = params[key];
    return v ? encodeURIComponent(v) : "";
  });
  return <Navigate to={resolved} replace />;
}

/** 確定案件: /sales/projects/confirmed/studio → /projects?filter=confirmed_studio */
export function RedirectConfirmed() {
  const { category } = useParams<{ category: string }>();
  const filter = category === "business" ? "confirmed_business" : "confirmed_studio";
  return <Navigate to={`/projects?filter=${filter}`} replace />;
}

/** タスク: /sales/tasks/kanban → /tasks?scope=all&view=board */
const VIEW_TO_QUERY: Record<string, string> = { kanban: "board", list: "list", gantt: "gantt" };
export function RedirectTaskView() {
  const { view } = useParams<{ view: string }>();
  const v = VIEW_TO_QUERY[view ?? ""] ?? "board";
  return <Navigate to={`/tasks?scope=all&view=${v}`} replace />;
}

// ─────────────────────────────────────────────
// 新ルートのアダプタ
// ─────────────────────────────────────────────

/** /projects — ?view=board でボード、?filter=confirmed_* で確定案件 */
export function ProjectsRoute() {
  const [sp] = useSearchParams();
  const filter = sp.get("filter");
  if (filter === "confirmed_studio") return <ConfirmedProjectsPage category="studio" />;
  if (filter === "confirmed_business") return <ConfirmedProjectsPage category="business" />;
  if (sp.get("view") === "board") return <PipelinePage />;
  return <ProjectListPage />;
}

/** /tasks — ?scope=me|project|all &view=board|list|gantt */
const QUERY_TO_VIEW: Record<string, string> = { board: "kanban", list: "list", gantt: "gantt" };
export function TasksRoute() {
  const [sp] = useSearchParams();
  const scope = sp.get("scope") ?? "all";

  if (scope === "project") {
    const projectId = sp.get("project");
    if (projectId) return <ProjectTasksPage projectId={projectId} />;
    return <Navigate to="/tasks?scope=all" replace />;
  }

  // 自分のタスクと依頼は日常業務アプリが持っている (Phase 5 でここに吸収する)
  if (scope === "me") return <ForwardToApp path="/daily/tasks" label="自分のタスクと依頼" />;

  return <TaskDashboardPage view={QUERY_TO_VIEW[sp.get("view") ?? ""] ?? "kanban"} />;
}

/** /schedule — ?layers=studio|partner|me。複数・未指定は統合カレンダー */
export function ScheduleRoute() {
  const [sp] = useSearchParams();
  const layers = (sp.get("layers") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (layers.length === 1) {
    if (layers[0] === "studio") return <StudioCalendarPage />;
    if (layers[0] === "partner") return <PartnerSchedulePage />;
    if (layers[0] === "me") return <MyCalendarPage />;
  }
  return <UnifiedCalendarPage />;
}

/** /finance — ?tab=revenue|purchase|sga。未指定はダッシュボード */
export function FinanceRoute() {
  const [sp] = useSearchParams();
  switch (sp.get("tab")) {
    case "revenue":
      return <RevenueListPage />;
    case "purchase":
      return <PurchaseListPage />;
    case "sga":
      return <SgaListPage />;
    default:
      return <BudgetDashboardPage />;
  }
}

/** /finance/import — ?tool=xpoint|kessan|dedup。未指定は選ぶ画面 */
export function FinanceImportRoute() {
  const [sp] = useSearchParams();
  switch (sp.get("tool")) {
    case "xpoint":
      return <XpointImportPage />;
    case "kessan":
      return <KessanImportPage />;
    case "dedup":
      return <DedupScreeningPage />;
    default:
      return <ImportPicker />;
  }
}

const IMPORT_TOOLS = [
  {
    tool: "xpoint",
    label: "精算PDFを取り込む",
    description: "X-Point / 楽楽精算の申請PDFから、仕入・販管費の下書きを作ります。",
    Icon: FileSearch,
    adminOnly: false,
  },
  {
    tool: "kessan",
    label: "決算インポート",
    description: "仕訳帳CSVから売上・仕入・販管費を取り込みます。",
    Icon: FlaskConical,
    adminOnly: true,
  },
  {
    tool: "dedup",
    label: "同じ支払いが2回入っていないか調べる",
    description: "手入力と決算取込が重なった行を見つけて、片方を消します。",
    Icon: CopyCheck,
    adminOnly: true,
  },
];

/** 取り込みの入口。「取り込む → 確認する → 登録する」の1本道は Phase 8 で作る */
function ImportPicker() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";
  const tools = IMPORT_TOOLS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">取り込む</h1>
        <p className="mt-1 text-[13px] text-secondary-foreground">
          取り込んだ内容は確認してから登録します。いきなり登録されることはありません。
        </p>
      </header>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tools.map((t) => (
          <li key={t.tool}>
            <Link
              to={`/finance/import?tool=${t.tool}`}
              className="flex h-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary"
            >
              <t.Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-foreground">{t.label}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary-foreground">
                  {t.description}
                </span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 別バンドルのアプリへ送る (フルリロード)。押し戻されないよう replace で飛ばす */
function ForwardToApp({ path, label }: { path: string; label: string }) {
  if (typeof window !== "undefined") window.location.replace(path);
  return (
    <div className="p-6 text-[13px] text-secondary-foreground">
      {label}を開いています…
    </div>
  );
}
