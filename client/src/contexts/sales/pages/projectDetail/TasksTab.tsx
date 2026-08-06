/**
 * 案件詳細 / タスクタブ (v4 ⑥)
 *
 * ── 中身は作り直していません ────────────────────────────────
 *
 * かんばん・リスト・ガントの3つは**既存の実装をそのまま呼んでいます**
 * (`KanbanView` / `TaskListView` / `GanttView`)。
 * ここで作り直すと「案件詳細を枠にした回」と「タスクの見た目を変えた回」が
 * 混ざって、どちらが原因で壊れたか切り分けられなくなります。
 *
 * **旧 `ProjectTasksPage` から落としたのは見出しだけ**です
 * (案件名・案件間のリンク) — 枠がそれを出しているので二重になります。
 *
 * ── 進み具合の帯だけ v4 に直しました ────────────────────────
 *
 * 旧実装は生の Tailwind パレット (`text-amber-600` など) で書かれていたので、
 * 状態の色トークンに寄せました。ここは数行なので混ぜても切り分けられます。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Users } from 'lucide-react';
import api from '@/lib/api';
import ViewToggle, { type TaskView } from '@/contexts/tasks/components/ViewToggle';
import EpisodeScopeToggle from '@/contexts/tasks/components/EpisodeScopeToggle';
import KanbanView from '@/contexts/tasks/components/KanbanView/KanbanView';
import TaskListView from '@/contexts/tasks/components/TaskListView/TaskListView';
import GanttView from '@/contexts/tasks/components/GanttView/GanttView';
import { useProjectTasks } from '@/contexts/tasks/hooks/useProjectTasks';
import { localDateStr } from '@/lib/format';
import type { ProjectDetail } from './types';

interface ProjectMember { id: string; member_name: string; role: string | null; is_external: boolean }

/** 進み具合 / 期限を過ぎたもの / 関わっている人 */
function HealthStrip({ projectId, episodeId }: { projectId: string; episodeId: string | null }) {
  const { data: tasks = [] } = useProjectTasks(projectId, episodeId);
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/members`)).data.data as ProjectMember[],
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.is_completed).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const today = localDateStr(new Date());
  const overdue = tasks.filter((t) => t.due_date && !t.is_completed && t.due_date < today).length;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sub text-muted-foreground">進み具合</span>
        <div className="h-2 w-28 overflow-hidden rounded-chip bg-muted">
          <div className="h-full rounded-chip bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-list font-number">{progress}%</span>
        <span className="text-sub-sm font-number text-muted-foreground">({done}/{total})</span>
      </div>

      <div className="flex items-center gap-1.5">
        <AlertTriangle
          className={`h-4 w-4 ${overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-hidden="true"
        />
        <span className={`text-sub ${overdue > 0 ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
          期限を過ぎたもの <span className="font-number">{overdue}</span>
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {members.length === 0 ? (
          <span className="text-sub text-muted-foreground">まだ誰も入っていません</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {members.slice(0, 6).map((m) => (
              <span
                key={m.id}
                className="text-sub-sm rounded-chip border border-border bg-muted px-2 py-0.5"
                title={m.role ? `${m.member_name}（${m.role}）` : m.member_name}
              >
                {m.member_name}
                {m.is_external && <span className="text-badge ml-1 text-warning">社外</span>}
              </span>
            ))}
            {members.length > 6 && (
              <span className="text-sub-sm font-number text-muted-foreground">+{members.length - 6}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TasksTab({ project }: { project: ProjectDetail }) {
  // 連続もの (GLS-A) だけ回ごとの絞り込みを出す
  const isSeries = project.gls_category === 'A';
  // ビジネス案件は既定でガント (工程を追うのが目的なので)
  const [view, setView] = useState<TaskView>(project.gls_category === 'B' ? 'gantt' : 'kanban');
  const [episodeId, setEpisodeId] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <HealthStrip projectId={project.id} episodeId={episodeId} />
        <div className="ml-auto"><ViewToggle current={view} onChange={setView} /></div>
      </div>

      {isSeries && (
        <div className="overflow-x-auto">
          <EpisodeScopeToggle projectId={project.id} selectedEpisodeId={episodeId} onChange={setEpisodeId} />
        </div>
      )}

      <div className="min-h-0 flex-1">
        {view === 'kanban' && <KanbanView projectId={project.id} episodeId={episodeId} />}
        {view === 'list' && <TaskListView projectId={project.id} episodeId={episodeId} />}
        {view === 'gantt' && (
          <>
            <div className="hidden h-full flex-col sm:flex">
              <GanttView projectId={project.id} episodeId={episodeId} />
            </div>
            {/* ガントはスマホでは読めない。**閉じずに逃げ道を出す** */}
            <div className="flex flex-col items-center gap-3 py-12 text-center sm:hidden">
              <p className="text-sub text-muted-foreground">工程表は横に広いので、PC で見てください。</p>
              <button
                type="button"
                onClick={() => setView('list')}
                className="min-h-tap text-sub text-primary underline underline-offset-2 lg:min-h-[36px]"
              >
                リストに切り替える
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
