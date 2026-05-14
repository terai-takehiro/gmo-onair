import { useParams, useNavigate } from "react-router-dom";
import { KanbanSquare, ListTodo, GanttChart, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskDashboard } from "@/contexts/tasks/hooks/useProjectTasks";
import DashboardKanbanView from "@/contexts/tasks/components/DashboardKanban/DashboardKanbanView";
import DashboardListView from "@/contexts/tasks/components/DashboardList/DashboardListView";
import DashboardGanttView from "@/contexts/tasks/components/DashboardGantt/DashboardGanttView";
import { Loader2 } from "lucide-react";

type ViewType = "kanban" | "list" | "gantt";

const VIEWS: { id: ViewType; label: string; Icon: React.ElementType }[] = [
  { id: "kanban", label: "カンバン", Icon: KanbanSquare },
  { id: "list", label: "タスクリスト", Icon: ListTodo },
  { id: "gantt", label: "ガント", Icon: GanttChart },
];

export default function TaskDashboardPage() {
  const { view } = useParams<{ view: string }>();
  const navigate = useNavigate();
  const activeView: ViewType =
    view === "kanban" || view === "list" || view === "gantt" ? view : "kanban";

  const { data, isLoading, isError, refetch, isFetching } = useTaskDashboard();

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

        {data && (
          <span className="text-xs text-muted-foreground">
            {data.projects.length}案件 · {data.tasks.length}タスク
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
        ) : data ? (
          <>
            {activeView === "kanban" && (
              <DashboardKanbanView
                projects={data.projects}
                columns={data.columns}
                tasks={data.tasks}
              />
            )}
            {activeView === "list" && (
              <DashboardListView
                projects={data.projects}
                columns={data.columns}
                tasks={data.tasks}
              />
            )}
            {activeView === "gantt" && (
              <DashboardGanttView
                projects={data.projects}
                columns={data.columns}
                tasks={data.tasks}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
