import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardProject, DashboardTask, TaskColumn } from "@/types";

interface Props {
  projects: DashboardProject[];
  columns: TaskColumn[];
  tasks: DashboardTask[];
}

const TASK_LIMIT = 5;

function columnColor(color: string | null) {
  return color ?? "#94a3b8";
}

export default function DashboardKanbanView({ projects, columns, tasks }: Props) {
  const navigate = useNavigate();

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">アクティブな案件がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {projects.map((project) => {
        const projColumns = columns.filter((c) => c.project_id === project.id);
        const projTasks = tasks.filter((t) => t.project_id === project.id);
        const unassigned = projTasks.filter((t) => !t.column_id);

        const allColumns = [
          ...projColumns,
          ...(unassigned.length > 0
            ? [{ id: "__none__", name: "未分類", color: null, project_id: project.id, sort_order: 9999, created_at: "", updated_at: "" }]
            : []),
        ];

        const totalIncomplete = projTasks.filter((t) => !t.is_completed).length;
        const totalComplete = projTasks.filter((t) => t.is_completed).length;

        return (
          <div key={project.id} className="border rounded-lg overflow-hidden">
            {/* Project header */}
            <button
              onClick={() => navigate(`/sales/projects/${project.id}/tasks`)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm truncate">
                  {project.gls_number ? `${project.gls_number} ` : ""}
                  {project.name}
                </span>
                {totalIncomplete > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                    {totalIncomplete}件
                  </span>
                )}
                {totalComplete > 0 && (
                  <span className="shrink-0 rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">
                    完了{totalComplete}件
                  </span>
                )}
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-2" />
            </button>

            {/* Columns */}
            {allColumns.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                タスクなし
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-3 p-3" style={{ minWidth: allColumns.length * 180 }}>
                  {allColumns.map((col) => {
                    const colTasks =
                      col.id === "__none__"
                        ? projTasks.filter((t) => !t.column_id)
                        : projTasks.filter((t) => t.column_id === col.id);
                    const visible = colTasks.slice(0, TASK_LIMIT);
                    const overflow = colTasks.length - TASK_LIMIT;

                    return (
                      <div
                        key={col.id}
                        className="flex-shrink-0 w-44 flex flex-col gap-1.5"
                      >
                        {/* Column header */}
                        <div className="flex items-center gap-1.5 px-1">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: columnColor(col.color) }}
                          />
                          <span className="text-xs font-medium text-muted-foreground truncate">
                            {col.name}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground shrink-0">
                            {colTasks.length}
                          </span>
                        </div>

                        {/* Task cards */}
                        <div className="flex flex-col gap-1">
                          {visible.map((task) => (
                            <div
                              key={task.id}
                              className={cn(
                                "rounded border bg-card px-2 py-1.5 text-xs leading-snug",
                                task.is_completed && "opacity-50 line-through"
                              )}
                            >
                              {task.title}
                            </div>
                          ))}
                          {overflow > 0 && (
                            <button
                              onClick={() => navigate(`/sales/projects/${project.id}/tasks`)}
                              className="text-xs text-muted-foreground hover:text-primary transition-colors text-left px-2"
                            >
                              +{overflow}件
                            </button>
                          )}
                          {colTasks.length === 0 && (
                            <div className="rounded border border-dashed px-2 py-1.5 text-xs text-muted-foreground/50">
                              なし
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
