/**
 * TasksPage — タスク (§4.8 / デザイン 9a / 9b)
 *
 * **スコープ (自分 / 案件 / 全体) × 表示 (リスト / ボード / ガント)** を1画面で切り替える。
 * レールの「タスク」は1行だけ。旧 `/sales/tasks/{kanban,list,gantt}` と
 * `/daily/tasks` はここにリダイレクトする (同じ期限が2画面に別実装で出ていた状態を終わらせる)。
 *
 * 自分スコープは 9b の構成:
 *   左 = あなたへの依頼 → 自分のタスク
 *   右 = AIに投げる / 出した依頼の返事待ち / 9マス
 */
import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { User, FolderKanban, Users, List, LayoutGrid, GanttChart, Plus, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from "@/contexts/platform/AuthContext";
import { TaskIntakeBox } from "@/contexts/tasks/components/TaskIntakeBox";
import { MyTasksTab, DelegationsTab, IntakeLogTab, TeamTab } from "./MyTasksPanels";
import TaskDashboardPage from "./TaskDashboardPage";
import ProjectTasksPage from "./ProjectTasksPage";

type Scope = "me" | "project" | "all";
type View = "list" | "board" | "gantt";

const SCOPES: { id: Scope; label: string; Icon: React.ElementType; hint: string }[] = [
  { id: "me", label: "自分", Icon: User, hint: "自分のタスクと、受けた依頼・出した依頼" },
  { id: "project", label: "案件", Icon: FolderKanban, hint: "1つの案件のタスク" },
  { id: "all", label: "全体", Icon: Users, hint: "案件をまたいだタスクと、チームの負荷 (件数だけ)" },
];

const VIEWS: { id: View; label: string; Icon: React.ElementType }[] = [
  { id: "list", label: "リスト", Icon: List },
  { id: "board", label: "ボード", Icon: LayoutGrid },
  { id: "gantt", label: "ガント", Icon: GanttChart },
];

/** 自分スコープのボードは 9 マス (重要度 × 緊急度) なので、そう名乗る */
const ME_VIEW_LABEL: Record<string, string> = { list: "スコア順", board: "9 マス" };

interface Summary {
  overdue?: number;
  due_today?: number;
  unanswered_delegations?: number;
  pending_intakes?: number;
  no_due?: number;
}

export default function TasksPage() {
  const [sp, setSp] = useSearchParams();
  const { hasPermission } = useAuth();

  const scope = (["me", "project", "all"].includes(sp.get("scope") ?? "") ? sp.get("scope") : "me") as Scope;
  const view = (["list", "board", "gantt"].includes(sp.get("view") ?? "") ? sp.get("view") : "list") as View;
  const projectId = sp.get("project");

  const canDailyops = hasPermission("dailyops");
  const canSales = hasPermission("sales");

  // ⌘K の「チームの負荷」は `#team-load` 付きで飛んでくる。react-router は
  // ハッシュまで面倒を見ないので、対象が出るまで数回だけ探して寄せる
  // (チームの負荷は一覧の下なので、寄せないと「行き先が同じ」に見える)
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let tries = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.clearInterval(id);
      } else if (++tries > 20) window.clearInterval(id);
    }, 150);
    return () => window.clearInterval(id);
  }, [hash]);

  const { data: summary } = useQuery<Summary>({
    queryKey: ["dailyops", "tasks", "summary"],
    queryFn: async () => (await api.get("/dailyops/tasks/summary")).data.data,
    enabled: canDailyops,
    staleTime: 30_000,
  });

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  // 表示形式が意味を持つのは 自分 (リスト/ボード) と 案件・全体 (3種)
  const availableViews = scope === "me" ? VIEWS.filter((v) => v.id !== "gantt") : VIEWS;

  return (
    <PageTransition>
      <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-5 sm:py-7">
        {/* ヘッダー — 数字で書く (§2.5 ルール4) */}
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">タスク</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-secondary-foreground">
              {summary ? (
                <>
                  期限超過 <span className="font-bold tabular-nums text-destructive">{summary.overdue ?? 0}件</span>
                  <span aria-hidden="true">・</span>
                  今日が期限 <span className="font-bold tabular-nums text-warning-strong">{summary.due_today ?? 0}件</span>
                  <span aria-hidden="true">・</span>
                  未返答の依頼 <span className="font-bold tabular-nums text-foreground">{summary.unanswered_delegations ?? 0}件</span>
                </>
              ) : (
                <>{SCOPES.find((s) => s.id === scope)?.hint}</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* スコープ */}
            <div className="inline-flex rounded-control border border-border p-0.5">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => set({ scope: s.id })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[13px] transition-colors",
                    scope === s.id ? "bg-primary font-bold text-primary-foreground" : "text-secondary-foreground hover:bg-secondary"
                  )}
                  aria-pressed={scope === s.id}
                  title={s.hint}
                >
                  <s.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {s.label}
                </button>
              ))}
            </div>
            {/* 表示形式 */}
            <div className="inline-flex rounded-control border border-border p-0.5">
              {availableViews.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => set({ view: v.id })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[13px] transition-colors",
                    view === v.id ? "bg-secondary font-bold text-foreground" : "text-secondary-foreground hover:bg-secondary"
                  )}
                  aria-pressed={view === v.id}
                >
                  <v.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {scope === "me" ? ME_VIEW_LABEL[v.id] ?? v.label : v.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ───── 自分 (9b) ───── */}
        {scope === "me" && (
          !canDailyops ? (
            <NoPermissionPanel modules={["dailyops"]} level="reader" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-4">
                {/* あなたへの依頼 + 自分のタスク (受けた依頼は MyTasksTab の中で扱う) */}
                <DelegationsTab />
                <MyTasksTab view={view === "board" ? "board" : "list"} onViewChange={(v) => set({ view: v })} />
              </div>
              <div className="min-w-0 space-y-4">
                <TaskIntakeBox />
                <IntakeLogPanel />
              </div>
            </div>
          )
        )}

        {/* ───── 案件 ───── */}
        {scope === "project" && (
          !canSales ? (
            <NoPermissionPanel modules={["sales"]} level="reader" />
          ) : projectId ? (
            <>
              <button
                type="button"
                onClick={() => set({ project: null })}
                className="text-[13px] text-primary underline underline-offset-2"
              >
                別の案件にする
              </button>
              <ProjectTasksPage
                projectId={projectId}
                view={view === "board" ? "kanban" : view}
                onViewChange={(v) => set({ view: v === "kanban" ? "board" : v })}
              />
            </>
          ) : (
            <ProjectPicker onPick={(id) => set({ project: id })} onOpenAll={() => set({ scope: "all" })} />
          )
        )}

        {/* ───── 全体 ───── */}
        {scope === "all" && (
          !canSales ? (
            <NoPermissionPanel modules={["sales"]} level="reader" />
          ) : (
            <div className="space-y-4">
              <TaskDashboardPage view={view === "board" ? "kanban" : view} embedded />
              {/*
                案件に紐づかないタスク (投入欄から生まれた個人のもの) は**ここには出さない**と決めた。
                案件のボードに「案件なし」の列を作ると、案件の進行を見る場所に個人の ToDo が混ざり、
                ボードが「案件がどこまで進んだか」を表さなくなる。
                ただし黙って出さないと「自分のタスクが無い = 壊れている」に見えるので画面に書く。
              */}
              <p className="text-[12px] text-muted-foreground">
                ここに出るのは<span className="font-bold">案件に紐づくタスク</span>だけです。
                投入欄から生まれた個人のタスクは案件に紐づかないので出ません（
                <button
                  type="button"
                  onClick={() => set({ scope: "me", project: null })}
                  className="font-bold text-primary underline"
                >
                  自分
                </button>
                で見てください）。
              </p>
              {canDailyops && (
                <section id="team-load" className="scroll-mt-20 rounded-lg border border-border bg-card p-4" aria-label="チームの負荷">
                  <h2 className="text-[15px] font-bold text-foreground">チームの負荷</h2>
                  <p className="mb-3 mt-0.5 text-[13px] text-secondary-foreground">
                    誰が溢れているかを見て、配り直すかどうかを決めます。
                  </p>
                  <TeamTab />
                </section>
              )}
            </div>
          )
        )}
      </div>
    </PageTransition>
  );
}

/** 投入ログは常時出すと場所を取るので折りたたむ (投げたものの行き先を追える経路は残す) */
function IntakeLogPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 text-[14px] font-bold text-foreground">投げたものの行き先</span>
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-divider p-3"><IntakeLogTab /></div>}
    </div>
  );
}

/** 案件スコープで案件が選ばれていないとき。案件名で探して選ぶ */
function ProjectPicker({ onPick, onOpenAll }: { onPick: (id: string) => void; onOpenAll: () => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["projects", "task-picker", q],
    queryFn: async () =>
      (await api.get("/projects", { params: { limit: 20, tab: "active", ...(q ? { search: q } : {}) } })).data,
    staleTime: 30_000,
  });
  const rows: { id: string; name: string; gls_number?: string | null; customer_name?: string | null }[] = data?.data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-secondary-foreground">
        どの案件のタスクを見ますか。案件をまたいで見たいときは「全体」に切り替えてください。
      </p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="案件名でさがす" className="max-w-md" />
      {rows.length === 0 ? (
        <EmptyState
          title="進行中の案件がありません"
          description="案件をつくるか、「全体」で案件をまたいだタスクを見てください。"
          action={<Button variant="outline" onClick={onOpenAll}>全体を見る</Button>}
        />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-foreground">{r.name}</span>
                  <span className="mt-0.5 block text-[12px] text-secondary-foreground">
                    {r.customer_name || "お客様 未設定"}
                    {r.gls_number ? ` ・ ${r.gls_number}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" className="gap-1.5" onClick={() => navigateToNew()}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        案件をつくる
      </Button>
    </div>
  );
}

function navigateToNew() {
  window.location.href = "/sales/projects/new";
}
