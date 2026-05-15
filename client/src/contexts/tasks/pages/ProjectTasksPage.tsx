import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Loader2 } from "lucide-react";
import ProjectQuickLinks from "@/contexts/shared/components/ProjectQuickLinks";
import ViewToggle, { type TaskView } from "../components/ViewToggle";
import EpisodeScopeToggle from "../components/EpisodeScopeToggle";
import KanbanView from "../components/KanbanView/KanbanView";
import TaskListView from "../components/TaskListView/TaskListView";
import GanttView from "../components/GanttView/GanttView";
import { getProjectCategory, type Project } from "@/types";

export default function ProjectTasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [view, setView] = useState<TaskView>("kanban");
  const [episodeId, setEpisodeId] = useState<string | null>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () =>
      (await api.get<{ data: Project }>(`/projects/${projectId}`)).data.data,
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project || !projectId) {
    return (
      <div className="p-6 text-center text-muted-foreground">案件が見つかりません</div>
    );
  }

  const isGlsA = getProjectCategory(project.project_type) === "A";

  return (
    <div className="flex flex-col h-full">
      {/* ページヘッダー */}
      <div className="border-b border-border bg-background px-4 py-3 space-y-3">
        {/* ナビ + タイトル */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h1 className="text-sm font-semibold truncate max-w-[60vw]">
              {project.gls_number ?? project.code} — {project.name}
            </h1>
            <ProjectQuickLinks
              projectId={projectId}
              projectName={project.name}
              currentPage="tasks"
            />
          </div>

          {/* ビュー切替 */}
          <ViewToggle current={view} onChange={setView} />
        </div>

        {/* GLS-A: エピソードスコープトグル */}
        {isGlsA && (
          <div className="overflow-x-auto">
            <EpisodeScopeToggle
              projectId={projectId}
              selectedEpisodeId={episodeId}
              onChange={setEpisodeId}
            />
          </div>
        )}
      </div>

      {/* メインコンテンツ */}
      <div
        className={`flex-1 overflow-hidden ${
          view === "kanban" ? "p-4" : "p-4"
        }`}
      >
        {/* ガントはモバイルで非表示 */}
        {view === "gantt" && (
          <>
            <div className="hidden sm:flex flex-col h-full">
              <GanttView projectId={projectId} episodeId={episodeId} />
            </div>
            <div className="sm:hidden flex flex-col items-center justify-center py-12 gap-3 text-center">
              <p className="text-muted-foreground text-sm">
                ガントチャートはPC画面でご利用ください
              </p>
              <button
                type="button"
                onClick={() => setView("list")}
                className="text-primary text-sm underline underline-offset-2"
              >
                リストビューに切替
              </button>
            </div>
          </>
        )}

        {view === "kanban" && (
          <div className="h-full overflow-hidden flex flex-col">
            {/* モバイル: 1列ずつ表示 */}
            <div className="h-full">
              <KanbanView projectId={projectId} episodeId={episodeId} />
            </div>
          </div>
        )}

        {view === "list" && (
          <TaskListView projectId={projectId} episodeId={episodeId} />
        )}
      </div>
    </div>
  );
}
