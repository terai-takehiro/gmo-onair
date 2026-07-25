import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { KanbanSquare, ListTodo, GanttChart, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskDashboard } from "@/contexts/tasks/hooks/useProjectTasks";
import DashboardKanbanView from "@/contexts/tasks/components/DashboardKanban/DashboardKanbanView";
import DashboardListView from "@/contexts/tasks/components/DashboardList/DashboardListView";
import DashboardGanttView from "@/contexts/tasks/components/DashboardGantt/DashboardGanttView";
import { Loader2 } from "lucide-react";

type ViewType = "kanban" | "list" | "gantt";
type CatFilter = "all" | "B" | "A";

const VIEWS: { id: ViewType; label: string; Icon: React.ElementType }[] = [
  { id: "kanban", label: "カンバン", Icon: KanbanSquare },
  { id: "list", label: "タスクリスト", Icon: ListTodo },
  { id: "gantt", label: "ガント", Icon: GanttChart },
];

const CAT_FILTERS: { id: CatFilter; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "B", label: "ビジネス" },
  { id: "A", label: "スタジオ" },
];

/** view は旧パス (/sales/tasks/:view) と新クエリ (/tasks?view=) の両方から来る */
export default function TaskDashboardPage({ view: viewProp }: { view?: string } = {}) {
  const params = useParams<{ view: string }>();
  const view = viewProp ?? params.view;
  const navigate = useNavigate();
  const activeView: ViewType =
    view === "kanban" || view === "list" || view === "gantt" ? view : "kanban";

  const { data, isLoading, isError, refetch, isFetching } = useTaskDashboard();
  const [cat, setCat] = useState<CatFilter>("all");

  // GLS 区分でプロジェクト + タスクを絞り込む (columns は project_id 経由で自然に絞られる)
  const filtered = useMemo(() => {
    if (!data) return data;
    if (cat === "all") return data;
    const projects = data.projects.filter((p) => p.gls_category === cat);
    const ids = new Set(projects.map((p) => p.id));
    return {
      projects,
      columns: data.columns.filter((c) => ids.has(c.project_id)),
      tasks: data.tasks.filter((t) => ids.has(t.project_id)),
    };
  }, [data, cat]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
          {VIEWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => navigate(`/sales/tasks/${id}`)}
              className={cn(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                activeView === id
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* GLS 区分フィルタ (ビジネス / スタジオ) */}
        <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
          {CAT_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setCat(id)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                cat === id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered && (
          <span className="text-xs text-muted-foreground">
            {filtered.projects.length}案件 · {filtered.tasks.length}タスク
          </span>
        )}

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          更新
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <p className="text-sm">データの取得に失敗しました</p>
            <button
              onClick={() => refetch()}
              className="text-xs text-primary hover:underline"
            >
              再試行
            </button>
          </div>
        ) : filtered ? (
          <>
            {activeView === "kanban" && (
              <DashboardKanbanView
                projects={filtered.projects}
                columns={filtered.columns}
                tasks={filtered.tasks}
              />
            )}
            {activeView === "list" && (
              <DashboardListView
                projects={filtered.projects}
                columns={filtered.columns}
                tasks={filtered.tasks}
              />
            )}
            {activeView === "gantt" && (
              <DashboardGanttView
                projects={filtered.projects}
                columns={filtered.columns}
                tasks={filtered.tasks}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
