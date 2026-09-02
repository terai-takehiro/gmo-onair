import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
// 統合カレンダー「タスクの期限」レイヤーの鍵（`invalidateTasks` のコメント参照）。
// `lib/bookingQueries.ts` が `holds/holdLogic.ts` の HOLD_KEY を読むのと同じ形
import { TASK_DEADLINE_KEY } from "@/contexts/production/pages/calendar/taskLayer";
import type {
  TaskColumn,
  ProjectTask,
  TaskColumnTemplate,
  TaskDashboardData,
} from "@/types";

// ------------------------------------------------------------------ keys
const colKey = (pid: string) => ["task-columns", pid] as const;
const taskKey = (pid: string, episodeId?: string | null) =>
  episodeId !== undefined
    ? ["project-tasks", pid, episodeId]
    : (["project-tasks", pid] as const);
const tplKey = () => ["task-templates"] as const;

// ------------------------------------------------------------------ columns
export function useTaskColumns(projectId: string) {
  return useQuery({
    queryKey: colKey(projectId),
    queryFn: async () => {
      const res = await api.get<{ data: TaskColumn[] }>(
        `/projects/${projectId}/task-columns`
      );
      return res.data.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateColumn(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string | null }) =>
      api
        .post<{ data: TaskColumn }>(`/projects/${projectId}/task-columns`, data)
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: colKey(projectId) }),
  });
}

export function useUpdateColumn(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      color?: string | null;
    }) =>
      api
        .put<{ data: TaskColumn }>(
          `/projects/${projectId}/task-columns/${id}`,
          data
        )
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: colKey(projectId) }),
  });
}

export function useDeleteColumn(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/projects/${projectId}/task-columns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: colKey(projectId) });
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
  });
}

export function useReorderColumns(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Array<{ id: string; sort_order: number }>) =>
      api.patch(`/projects/${projectId}/task-columns/reorder`, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: colKey(projectId) }),
  });
}

export function useColumnsFromTemplate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api
        .post<{ data: TaskColumn[] }>(
          `/projects/${projectId}/task-columns/from-template`,
          { template_id: templateId }
        )
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: colKey(projectId) }),
  });
}

/**
 * レギュラー番組の回（エピソード）に標準工程を当てる（regular-series.md §10-8）。
 * `useColumnsFromTemplate` は列を案件に足すだけだが、こちらは列ごとに1件、
 * この回のタスクを作る（サーバー: `taskColumnsService.applyToEpisode`）。
 * 列は案件の既存かんばん列と名前で共有する（増えない）。
 */
export function useApplyTaskTemplateToEpisode(projectId: string, episodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api
        .post<{ data: Array<{ id: string; column_id: string; title: string }> }>(
          `/task-templates/${templateId}/apply-to-episode`,
          { project_id: projectId, episode_id: episodeId }
        )
        .then((r) => r.data.data),
    onSuccess: () => {
      // 4つとも落とす（ApplyFlowDialog.tsx と同じ理由 — かんばん・リスト/ガント・
      // 全案件タスク一覧・回一覧のどれかを忘れると「入れたのに出てこない」になる）
      qc.invalidateQueries({ queryKey: colKey(projectId) });
      qc.invalidateQueries({ queryKey: taskKey(projectId) });
      qc.invalidateQueries({ queryKey: ["task-dashboard"] });
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
    },
  });
}

// ------------------------------------------------------------------ tasks
export function useProjectTasks(
  projectId: string,
  episodeId?: string | null
) {
  return useQuery({
    queryKey: taskKey(projectId, episodeId),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (episodeId !== undefined) {
        params.episode_id = episodeId ?? "";
      }
      const res = await api.get<{ data: ProjectTask[] }>(
        `/projects/${projectId}/tasks`,
        { params }
      );
      return res.data.data;
    },
    enabled: !!projectId,
  });
}

/**
 * タスクを書き換えたあとに読み直すもの。
 *
 * **`task-dashboard` も必ず落とすこと。** 案件の中のタスクと、全案件を集めた
 * タスク一覧 (v4 ④) は**同じタスクを別の鍵で持っています**。案件側だけを
 * 落としていたので、一覧から直しても一覧が古いままでした
 * (画面上は「押しても変わらない」= 保存できなかったように見える)。
 *
 * **`episodes` も落とすこと。** `EpisodesPanel.tsx` は `GET /projects/:id/episodes` が
 * 返す `task_count`/`task_done_count` から回ごとの進捗バーを出しており、タスクタブの
 * 同じ画面に常駐している。ここを落とさないと、タスクを足す/終える/消しても
 * 「回」一覧の進捗バッジだけ古いままになる。
 *
 * **`task-deadlines`（統合カレンダーの「タスクの期限」レイヤー・週間予定の併載）も
 * 落とすこと**（根源整理 §3-5）。完了・期限変更がカレンダーに残って見えると、
 * もう無い締め切りに向けて動いてしまう。鍵の正は
 * `contexts/production/pages/calendar/taskLayer.ts` の `TASK_DEADLINE_KEY`。
 */
export const invalidateTasks = (qc: ReturnType<typeof useQueryClient>, projectId: string) => {
  qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
  qc.invalidateQueries({ queryKey: ["task-dashboard"] });
  qc.invalidateQueries({ queryKey: ["episodes", projectId] });
  qc.invalidateQueries({ queryKey: [TASK_DEADLINE_KEY] });
};

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectTask> & { title: string }) =>
      api
        .post<{ data: ProjectTask }>(`/projects/${projectId}/tasks`, data)
        .then((r) => r.data.data),
    onSuccess: () => invalidateTasks(qc, projectId),
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ProjectTask> & { id: string }) =>
      api
        .put<{ data: ProjectTask }>(`/projects/${projectId}/tasks/${id}`, data)
        .then((r) => r.data.data),
    onSuccess: () => invalidateTasks(qc, projectId),
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/projects/${projectId}/tasks/${id}`),
    onSuccess: () => invalidateTasks(qc, projectId),
  });
}

export function useToggleComplete(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .patch<{ data: ProjectTask }>(
          `/projects/${projectId}/tasks/${id}/complete`,
          {}
        )
        .then((r) => r.data.data),
    onSuccess: () => invalidateTasks(qc, projectId),
  });
}

export function useMoveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      column_id,
      sort_order,
    }: {
      id: string;
      column_id: string | null;
      sort_order: number;
    }) =>
      api.patch(`/projects/${projectId}/tasks/${id}/move`, {
        column_id,
        sort_order,
      }),
    onSuccess: () => invalidateTasks(qc, projectId),
  });
}

export function useReorderTasks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Array<{ id: string; sort_order: number }>) =>
      api.patch(`/projects/${projectId}/tasks/reorder`, items),
    onSuccess: () => invalidateTasks(qc, projectId),
  });
}

// ------------------------------------------------------------------ dependencies
export interface TaskDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
}

const depKey = (pid: string) => ["task-dependencies", pid] as const;

export function useTaskDependencies(projectId: string) {
  return useQuery({
    queryKey: depKey(projectId),
    queryFn: async () => {
      const res = await api.get<{ data: TaskDependency[] }>(
        `/projects/${projectId}/tasks/dependencies`
      );
      return res.data.data;
    },
    enabled: !!projectId,
  });
}

export function useAddDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { predecessor_id: string; successor_id: string }) =>
      api
        .post<{ data: TaskDependency }>(`/projects/${projectId}/tasks/dependencies`, data)
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: depKey(projectId) }),
  });
}

export function useRemoveDependency(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/projects/${projectId}/tasks/dependencies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: depKey(projectId) }),
  });
}

// ------------------------------------------------------------------ templates
export function useTaskTemplates() {
  return useQuery({
    queryKey: tplKey(),
    queryFn: async () => {
      const res = await api.get<{ data: TaskColumnTemplate[] }>("/task-templates");
      return res.data.data;
    },
    staleTime: 60_000 * 10,
  });
}

// ------------------------------------------------------------------ dashboard
export function useTaskDashboard() {
  return useQuery({
    queryKey: ["task-dashboard"] as const,
    queryFn: async () => {
      const res = await api.get<{ data: TaskDashboardData }>("/task-dashboard");
      return res.data.data;
    },
    staleTime: 30_000,
  });
}
