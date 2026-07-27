import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { AlertTriangle, Users } from "lucide-react";
import ProjectQuickLinks from "@/contexts/shared/components/ProjectQuickLinks";
import ViewToggle, { type TaskView } from "../components/ViewToggle";
import EpisodeScopeToggle from "../components/EpisodeScopeToggle";
import KanbanView from "../components/KanbanView/KanbanView";
import TaskListView from "../components/TaskListView/TaskListView";
import GanttView from "../components/GanttView/GanttView";
import { useProjectTasks } from "../hooks/useProjectTasks";
import { getProjectCategory, type Project } from "@/types";
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';

interface ProjectMember {
  id: string;
  member_name: string;
  role: string | null;
  is_external: boolean;
}

/** 進捗 / 期限超過 / 担当メンバー のヘルスストリップ (プロジェクト管理の要約) */
function HealthStrip({ projectId, episodeId }: { projectId: string; episodeId: string | null }) {
  const { data: tasks = [] } = useProjectTasks(projectId, episodeId);
  const { data: members = [] } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/members`)).data.data as ProjectMember[],
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.is_completed).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => t.due_date && !t.is_completed && t.due_date < today).length;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5">
      {/* 進捗 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">進捗</span>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums">{progress}%</span>
        <span className="text-xs text-muted-foreground">({done}/{total})</span>
      </div>
      {/* 期限超過 */}
      <div className="flex items-center gap-1.5">
        <AlertTriangle className={`h-4 w-4 ${overdue > 0 ? "text-destructive" : "text-muted-foreground"}`} />
        <span className={`text-sm ${overdue > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
          期限超過 {overdue}
        </span>
      </div>
      {/* 担当メンバー */}
      <div className="flex items-center gap-1.5">
        <Users className="h-4 w-4 text-muted-foreground" />
        {members.length === 0 ? (
          <span className="text-sm text-muted-foreground">担当未設定</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {members.slice(0, 6).map((m) => (
              <span
                key={m.id}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
                title={m.role ? `${m.member_name}（${m.role}）` : m.member_name}
              >
                {m.member_name}
                {m.is_external && <span className="ml-1 text-[10px] text-amber-600">外</span>}
              </span>
            ))}
            {members.length > 6 && <span className="text-xs text-muted-foreground">+{members.length - 6}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** projectId は旧パス (/sales/projects/:projectId/tasks) と新クエリ (?project=) の両方から来る */
/**
 * view / onViewChange を渡すと表示形式の切り替えは呼び出し側 (/tasks の見出し) が持つ。
 * 同じ切り替えを2箇所に出さないため、渡されたときは内側の ViewToggle を出さない。
 */
export default function ProjectTasksPage({
  projectId: projectIdProp,
  view: viewProp,
  onViewChange,
}: { projectId?: string; view?: TaskView; onViewChange?: (v: TaskView) => void } = {}) {
  const params = useParams<{ projectId: string }>();
  const projectId = projectIdProp ?? params.projectId;
  const controlled = viewProp !== undefined;
  const [localView, setLocalView] = useState<TaskView>("kanban");
  const view = viewProp ?? localView;
  const setView = (v: TaskView) => (onViewChange ? onViewChange(v) : setLocalView(v));
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const didInitView = useRef(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () =>
      (await api.get<{ data: Project }>(`/projects/${projectId}`)).data.data,
    enabled: !!projectId,
  });

  // GLS-B (ビジネス案件) は既定でガントを開く (プロジェクト管理を前面に)
  const isBusiness = !!project && (
    project.gls_category === "B" ||
    (!project.gls_category && getProjectCategory(project.project_type) === "B")
  );
  useEffect(() => {
    if (project && !didInitView.current) {
      didInitView.current = true;
      if (isBusiness && !controlled) setLocalView("gantt");
    }
  }, [project, isBusiness, controlled]);

  if (isLoading) {
    return (
      <Delayed><SkeletonRows rows={5} /></Delayed>
    );
  }

  if (!project || !projectId) {
    return (
      <EmptyState
        title="この案件は見つかりませんでした"
        description="削除された可能性があります。案件一覧から選び直してください。"
      />
    );
  }

  const isGlsA = getProjectCategory(project.project_type) === "A" && project.gls_category !== "B";

  return (
    <div className="flex flex-col h-full">
      {/* ページヘッダー */}
      <div className="border-b border-border bg-background px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold truncate max-w-[60vw]">
              {project.gls_number ?? project.code} — {project.name}
            </h2>
            <ProjectQuickLinks projectId={projectId} projectName={project.name} currentPage="tasks" />
          </div>
          {!controlled && <ViewToggle current={view} onChange={setView} />}
        </div>

        {/* ヘルスストリップ (進捗 / 期限超過 / 担当メンバー) */}
        <HealthStrip projectId={projectId} episodeId={episodeId} />

        {/* GLS-A: 回のスコープトグル */}
        {isGlsA && (
          <div className="overflow-x-auto">
            <EpisodeScopeToggle projectId={projectId} selectedEpisodeId={episodeId} onChange={setEpisodeId} />
          </div>
        )}
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-hidden p-4">
        {view === "gantt" && (
          <>
            <div className="hidden sm:flex flex-col h-full">
              <GanttView projectId={projectId} episodeId={episodeId} />
            </div>
            <div className="sm:hidden flex flex-col items-center justify-center py-12 gap-3 text-center">
              <p className="text-muted-foreground text-sm">ガントチャートはPC画面でご利用ください</p>
              <button type="button" onClick={() => setView("list")} className="text-primary text-sm underline underline-offset-2">
                リストビューに切替
              </button>
            </div>
          </>
        )}

        {view === "kanban" && (
          <div className="h-full overflow-hidden flex flex-col">
            <div className="h-full">
              <KanbanView projectId={projectId} episodeId={episodeId} />
            </div>
          </div>
        )}

        {view === "list" && <TaskListView projectId={projectId} episodeId={episodeId} />}
      </div>
    </div>
  );
}
