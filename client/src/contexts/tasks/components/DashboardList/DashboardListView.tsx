import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Square, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardProject, DashboardTask, TaskColumn } from "@/types";

interface Props {
  projects: DashboardProject[];
  columns: TaskColumn[];
  tasks: DashboardTask[];
}

export default function DashboardListView({ projects, columns, tasks }: Props) {
  const navigate = useNavigate();
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [showCompleted, setShowCompleted] = useState(false);

  const filteredProjects = useMemo(
    () =>
      filterProjectId === "all"
        ? projects
        : projects.filter((p) => p.id === filterProjectId),
    [projects, filterProjectId]
  );

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filterProjectId !== "all") list = list.filter((t) => t.project_id === filterProjectId);
    if (!showCompleted) list = list.filter((t) => !t.is_completed);
    return list;
  }, [tasks, filterProjectId, showCompleted]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, DashboardTask[]>();
    for (const p of filteredProjects) map.set(p.id, []);
    for (const t of filteredTasks) {
      if (map.has(t.project_id)) map.get(t.project_id)!.push(t);
    }
    return map;
  }, [filteredProjects, filteredTasks]);

  const columnName = (colId: string | null) => {
    if (!colId) return "未分類";
    return columns.find((c) => c.id === colId)?.name ?? "未分類";
  };

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">アクティブな案件がありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
        >
          <option value="all">すべての案件</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.gls_number ? `${p.gls_number} ` : ""}{p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="rounded"
          />
          完了済みを表示
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{filteredTasks.length}件</span>
      </div>

      {/* Table by project */}
      <div className="flex flex-col gap-4">
        {filteredProjects.map((project) => {
          const ptasks = tasksByProject.get(project.id) ?? [];
          return (
            <div key={project.id} className="border rounded-lg overflow-hidden">
              {/* Sticky project row */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/40 sticky top-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm truncate">
                    {project.gls_number ? `${project.gls_number} ` : ""}
                    {project.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {ptasks.length}件
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/sales/projects/${project.id}/tasks`)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 ml-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  開く
                </button>
              </div>

              {ptasks.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">タスクなし</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium text-left w-8"></th>
                        <th className="px-3 py-2 font-medium text-left">タスク名</th>
                        <th className="px-3 py-2 font-medium text-left hidden sm:table-cell">カラム</th>
                        <th className="px-3 py-2 font-medium text-left hidden md:table-cell">担当</th>
                        <th className="px-3 py-2 font-medium text-left hidden md:table-cell">期日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ptasks.map((task) => (
                        <tr
                          key={task.id}
                          className={cn(
                            "border-b last:border-0 hover:bg-muted/30 transition-colors",
                            task.is_completed && "opacity-50"
                          )}
                        >
                          <td className="px-4 py-2">
                            {task.is_completed ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={cn(task.is_completed && "line-through")}>
                                {task.title}
                              </span>
                              {task.is_ai_created && (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 text-[10px] font-medium text-violet-700 shrink-0"
                                  title={task.ai_requested_by ? `AI が作りました (指示: ${task.ai_requested_by})` : "AI が作りました"}
                                >
                                  <Sparkles className="h-2.5 w-2.5" />
                                  AI作成
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground text-xs">
                            {columnName(task.column_id)}
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell text-muted-foreground text-xs">
                            {task.assigned_to_name ?? "—"}
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell text-muted-foreground text-xs whitespace-nowrap">
                            {task.due_date ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
