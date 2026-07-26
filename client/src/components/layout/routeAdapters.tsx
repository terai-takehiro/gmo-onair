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
import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { FileSearch, FlaskConical, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/platform/AuthContext";

import ProjectsPage from "@/contexts/sales/pages/ProjectsPage";
import TasksPage from "@/contexts/tasks/pages/TasksPage";
import SchedulePage from "@/contexts/production/pages/SchedulePage";
import FinancePage from "@/contexts/finance/pages/FinancePage";
import RevenueListPage from "@/contexts/finance/pages/RevenueListPage";
import PurchaseListPage from "@/contexts/finance/pages/PurchaseListPage";
import SgaListPage from "@/contexts/finance/pages/SgaListPage";
import XpointImportPage from "@/contexts/finance/pages/XpointImportPage";
import KessanImportPage from "@/contexts/platform/pages/KessanImportPage";
import DedupScreeningPage from "@/contexts/platform/pages/DedupScreeningPage";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

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

/**
 * 旧URLからのリダイレクトで **クエリと state を落とさない** 版。
 *
 * `<Navigate to="/schedule?layers=studio">` は元URLのクエリ (`?project_id=`) と
 * `navigate(..., { state })` を捨てるため、案件から「スタジオ予約」を開いたときの
 * 絞り込みと日付のプリセットが消えていた。旧URLを踏んでも同じ挙動になるよう引き継ぐ。
 */
export function RedirectPreserveState({ to }: { to: string }) {
  const location = useLocation();
  const [base, targetQuery] = to.split("?");
  const merged = new URLSearchParams(targetQuery ?? "");
  new URLSearchParams(location.search).forEach((v, k) => {
    if (!merged.has(k)) merged.set(k, v);
  });
  const search = merged.toString();
  return <Navigate to={search ? `${base}?${search}` : base} replace state={location.state} />;
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

/**
 * /projects — リストとボードは同じ画面の切替 (§4.6)。
 * `?view=board` と `?filter=confirmed_studio|confirmed_business` は ProjectsPage が読む。
 */
export function ProjectsRoute() {
  return <ProjectsPage />;
}

/**
 * /tasks — スコープ (自分/案件/全体) × 表示 (リスト/ボード/ガント)。
 * 旧 /sales/tasks/* と /daily/tasks はここに集約した (§4.8)。
 */
export function TasksRoute() {
  return <TasksPage />;
}

/**
 * /schedule — カレンダーは1本 (§4.10)。
 * `?layers=studio,partner,me` は SchedulePage が読んでレイヤーの ON/OFF にする。
 * 旧 4 ルート (統合 / スタジオ / パートナー / マイ) はここに集約した。
 */
export function ScheduleRoute() {
  return <SchedulePage />;
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
      return <FinancePage />;
  }
}

/**
 * /finance/import — 「取り込む → 確認する → 登録する」の1本道 (§4.11)
 *
 * 旧版は 精算PDF / 決算CSV / 二重計上チェック の**3メニューを選ばせる画面**だった。
 * 3ステップの枠を1つ用意し、その中で取込元を選ぶ形に変えた (`?tool=`)。
 * 決算CSVと二重計上の整理は管理者だけに出す (日常のメニューには置かない)。
 */
export function FinanceImportRoute() {
  return <ImportFlow />;
}

const STEPS = [
  { no: 1, label: "取り込む", detail: "PDFを置く / Boxの仕訳帳を読む" },
  { no: 2, label: "確認する", detail: "読み取った内容を全項目チェック" },
  { no: 3, label: "登録する", detail: "仕入・販管費・売上に入れる" },
];

const SOURCES = [
  {
    tool: "xpoint",
    label: "精算PDF",
    hint: "X-Point / 楽楽精算 の申請PDF。この画面に置くか、Boxフォルダから読み込みます。",
    Icon: FileSearch,
    adminOnly: false,
  },
  {
    tool: "kessan",
    label: "決算CSV（freee 仕訳帳）",
    hint: "Box に置いた仕訳帳から売上・仕入・販管費を取り込みます。まず解析して内容を確認します。",
    Icon: FlaskConical,
    adminOnly: true,
  },
];

/** 1本道の枠。ステップ表示 + 取込元の選択 + 選んだツールを中に描く */
function ImportFlow() {
  const [sp, setSp] = useSearchParams();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";
  const tool = sp.get("tool") ?? "";
  const sources = SOURCES.filter((s) => !s.adminOnly || isAdmin);
  const activeStep = tool ? 2 : 1;

  const setTool = (t: string) => {
    const next = new URLSearchParams(sp);
    if (t) next.set("tool", t);
    else next.delete("tool");
    setSp(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-5 sm:py-7">
      <header>
        <PageTitle>取り込む</PageTitle>
        <p className="mt-1 text-[13px] text-secondary-foreground">
          取り込んだ内容は確認してから登録します。いきなり登録されることはありません。
        </p>
      </header>

      {/* 1本道のステップ */}
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li
            key={s.no}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
              s.no === activeStep ? "border-primary bg-primary/[0.04]" : "border-border bg-card"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                s.no === activeStep ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              )}
            >
              {s.no}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-foreground">{s.label}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary-foreground">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* 取込元 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted-foreground">取込元:</span>
        {sources.map((s) => (
          <button
            key={s.tool}
            type="button"
            onClick={() => setTool(s.tool)}
            aria-pressed={tool === s.tool}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-[13px] transition-colors",
              tool === s.tool
                ? "border-primary bg-primary/10 font-bold text-primary"
                : "border-border text-secondary-foreground hover:bg-secondary"
            )}
          >
            <s.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      {/* 取込元を選ぶ前 */}
      {!tool && (
        <ul className="grid gap-3 md:grid-cols-2">
          {sources.map((s) => (
            <li key={s.tool}>
              <button
                type="button"
                onClick={() => setTool(s.tool)}
                className="flex h-full w-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                <s.Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-foreground">{s.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary-foreground">{s.hint}</span>
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 選んだ取込元の本体 (2 確認する → 3 登録する はこの中) */}
      {tool === "xpoint" && <XpointImportPage embedded />}
      {tool === "kessan" && isAdmin && <KessanImportPage embedded />}
      {tool === "dedup" && isAdmin && <DedupScreeningPage embedded />}

      {/* 仕上げ: 二重計上の確認 (管理者のみ) */}
      {isAdmin && tool !== "dedup" && (
        <section className="rounded-lg border border-border bg-card px-4 py-3">
          <h2 className="text-[14px] font-bold text-foreground">仕上げ: 同じ支払いが2回入っていないか調べる</h2>
          <p className="mt-0.5 text-[12px] text-secondary-foreground">
            手入力した行と決算インポートした行が重なっていないかを確認し、決算側だけを消せます（手入力は必ず残します）。
          </p>
          <button
            type="button"
            onClick={() => setTool("dedup")}
            className="mt-2 inline-flex items-center gap-1 text-[13px] text-primary underline underline-offset-2"
          >
            二重計上を調べる
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </section>
      )}
    </div>
  );
}
