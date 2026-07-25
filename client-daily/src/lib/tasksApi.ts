// タスク・依頼 API の react-query フック集。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D2 / D3 / D8)
//
// サーバー側は /dailyops/tasks/* (server/src/contexts/dailyops/routes/tasks.routes.ts)。
// 投入口 (案件管理アプリのトップ) と同じ service を通るので、
// どちらから登録しても同じ結果・同じ副作用になる。

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';

export type DelegationStatus = 'requested' | 'accepted' | 'declined' | 'consulting' | 'done';
export type IntakeStatus = 'pending' | 'committed' | 'discarded';
export type IntakeKind = 'freeform' | 'minutes' | 'mail' | 'chat' | 'other';

export interface MyTask {
  id: string;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  importance: number;
  urgency: number;
  /** 重要度 × 緊急度 (期限が無ければ緊急度は 1 扱い)。1〜9 */
  priority_score: number;
  /** 9 マスのどのマスか。'3x1' = 重要 高 × 緊急 低 */
  priority_cell: string;
  is_completed: boolean;
  assigned_to: string | null;
  assigned_to_name: string | null;
  requester_id: string | null;
  requester_name: string | null;
  delegation_status: DelegationStatus | null;
  requested_at: string | null;
  accepted_at: string | null;
  source: string | null;
  source_ref: string | null;
  visibility: 'team' | 'private';
  is_overdue: boolean;
  created_at: string;
}

export interface TeamLoad {
  user_id: string;
  user_name: string;
  open_count: number;
  overdue_count: number;
  top_priority_count: number;
  unanswered_count: number;
  private_count: number;
  no_due_count: number;
}

export interface TaskIntake {
  id: string;
  raw_text: string;
  kind: IntakeKind;
  status: IntakeStatus;
  drafts: unknown[] | null;
  ai_output_id: string | null;
  committed_at: string | null;
  discarded_at: string | null;
  note: string | null;
  created_at: string;
  created_by: string;
  created_by_name?: string | null;
  /** この投入から生まれたタスクの件数 */
  task_count: number;
}

export interface Assignee {
  id: string;
  name: string;
  email?: string | null;
}

// ── 9 マス (要件 D2) ────────────────────────────────
// スコアは 6 種類しかないので同点が出る。しかも**同点のマスは打ち手が真逆**
// (スコア 3 は「重要高×緊急低 = 予定を取って守る」と「重要低×緊急高 = 任せる」の 2 マス)。
// だからスコア順リストと 9 マスボードの両方を出す。

export const CELL_ACTION: Record<string, string> = {
  '3x3': '今すぐやる',
  '3x2': '今日中に着手',
  '3x1': '予定を取って守る',
  '2x3': '早めに片づける',
  '2x2': '順番にやる',
  '2x1': '空いた時間で',
  '1x3': '任せる・即片づけ',
  '1x2': 'まとめて処理',
  '1x1': 'やらない候補',
};

export const LEVEL_LABELS: Record<number, string> = { 3: '高', 2: '中', 1: '低' };

export const DELEGATION_LABELS: Record<DelegationStatus, string> = {
  requested: '未返答',
  accepted: '承諾',
  declined: '辞退',
  consulting: '相談',
  done: '完了',
};

// ── 取得 ────────────────────────────────────────────

export interface MyTasksResult {
  tasks: MyTask[];
  /** sales 権限が無い人には案件リンクを出さない (押して 403 にしないため。要件 D0) */
  canOpenProject: boolean;
}

export function useMyTasks(params: { include_completed?: boolean } = {}) {
  return useQuery({
    queryKey: ['my-tasks', params.include_completed ? 'all' : 'open'],
    queryFn: async (): Promise<MyTasksResult> => {
      const r = await api.get('/dailyops/tasks/mine', {
        params: params.include_completed ? { include_completed: 1 } : {},
      });
      return { tasks: r.data.data as MyTask[], canOpenProject: !!r.data.meta?.can_open_project };
    },
    refetchOnMount: 'always',
  });
}

export function useMyDelegations(direction: 'received' | 'sent', includeDone = false) {
  return useQuery({
    queryKey: ['my-delegations', direction, includeDone ? 'all' : 'open'],
    queryFn: async () => {
      const r = await api.get('/dailyops/tasks/delegations', {
        params: { direction, ...(includeDone ? { include_done: 1 } : {}) },
      });
      return r.data.data as MyTask[];
    },
    refetchOnMount: 'always',
  });
}

export function useTaskIntakes(params: { all?: boolean; status?: IntakeStatus } = {}) {
  return useQuery({
    queryKey: ['task-intakes', params.all ? 'all' : 'mine', params.status ?? 'any'],
    queryFn: async () => {
      const r = await api.get('/dailyops/tasks/intakes', {
        params: { ...(params.all ? { all: 1 } : {}), ...(params.status ? { status: params.status } : {}) },
      });
      return r.data.data as TaskIntake[];
    },
    refetchOnMount: 'always',
  });
}

export function useTaskIntake(id: string | null) {
  return useQuery({
    queryKey: ['task-intake', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await api.get(`/dailyops/tasks/intakes/${id}`);
      return r.data.data as TaskIntake & { generated_tasks: MyTask[] };
    },
  });
}

export interface MyTaskSummary {
  pending_intakes: number;
  unanswered_delegations: number;
  overdue: number;
  due_today: number;
  no_due_date: number;
}

export function useMyTaskSummary() {
  return useQuery({
    queryKey: ['my-task-summary'],
    queryFn: async () => (await api.get('/dailyops/tasks/summary')).data.data as MyTaskSummary,
    refetchOnMount: 'always',
  });
}

export function useTeamLoad() {
  return useQuery({
    queryKey: ['task-team-load'],
    queryFn: async () => (await api.get('/dailyops/tasks/team')).data.data as TeamLoad[],
    refetchOnMount: 'always',
  });
}

export function useAssignees() {
  return useQuery({
    queryKey: ['dailyops-assignees'],
    queryFn: async () => (await api.get('/users/by-module/dailyops')).data.data as Assignee[],
    staleTime: 5 * 60_000,
  });
}

// ── 更新 ────────────────────────────────────────────

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['my-tasks'] });
    qc.invalidateQueries({ queryKey: ['my-delegations'] });
    qc.invalidateQueries({ queryKey: ['task-team-load'] });
    qc.invalidateQueries({ queryKey: ['task-intakes'] });
  };
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  due_at?: string | null;
  importance?: number;
  urgency?: number;
  visibility?: 'team' | 'private';
  is_completed?: boolean;
}

export function useUpdateTask() {
  const inv = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      api.patch(`/dailyops/tasks/${id}`, patch).then((r) => r.data.data as MyTask),
    onSuccess: inv,
  });
}

export function useRespondDelegation() {
  const inv = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, decision, note }: {
      id: string; decision: 'accepted' | 'declined' | 'consulting'; note?: string;
    }) => api.post(`/dailyops/tasks/${id}/respond`, { decision, note }).then((r) => r.data.data as MyTask),
    onSuccess: inv,
  });
}

/** 差し戻された依頼の決着 (自分でやる / 振り直す / 取り下げる)。依頼者のみ */
export function useResolveDelegation() {
  const inv = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, action, assigned_to, due_at }: {
      id: string; action: 'take_over' | 'reassign' | 'withdraw';
      assigned_to?: string; due_at?: string;
    }) => api.post(`/dailyops/tasks/${id}/resolve`, { action, assigned_to, due_at })
           .then((r) => r.data.data as MyTask | null),
    onSuccess: inv,
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assigned_to: string;
  due_at?: string | null;
  importance?: number;
  urgency?: number;
  visibility?: 'team' | 'private';
}

export function useCreateTask() {
  const inv = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      api.post('/dailyops/tasks', input).then((r) => r.data.data as MyTask),
    onSuccess: inv,
  });
}

// ── 表示ヘルパー ─────────────────────────────────────

/** 期限を「7/31 17:00」形式で。**分まで出す** (イズム: 何月何日何時何分まで) */
export function formatDue(v: string | null): string {
  if (!v) return '期限なし';
  const d = new Date(v.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return v;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `<input type="datetime-local">` に渡す 'YYYY-MM-DDTHH:mm' */
export function toLocalInput(v: string | null): string {
  if (!v) return '';
  const d = new Date(v.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local の値をサーバーの 'YYYY-MM-DD HH:mm' に */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return v.replace('T', ' ').slice(0, 16);
}

/** 依頼を出してから何日反応が無いか。3 日以上なら催促の判断材料にする (要件 D3) */
export function daysSinceRequested(v: string | null): number | null {
  if (!v) return null;
  const d = new Date(v.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** スコアの帯色。9 が最優先、1 がやらない候補 */
export function scoreTone(score: number): string {
  if (score >= 9) return 'bg-rose-100 text-rose-800 border-rose-300';
  if (score >= 6) return 'bg-amber-100 text-amber-800 border-amber-300';
  if (score >= 4) return 'bg-sky-100 text-sky-800 border-sky-300';
  if (score >= 2) return 'bg-slate-100 text-slate-700 border-slate-300';
  return 'bg-slate-50 text-slate-500 border-slate-200';
}
