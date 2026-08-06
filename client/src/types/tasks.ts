/**
 * タスク管理の型 (Kanban / タスクリスト / ガントチャート)
 *
 * **`types/index.ts` から切り出しました。** あの1ファイルが 529 行あり、
 * 1ファイル400行の上限 (root CLAUDE.md / v4-plan の B-4) を超えていたためです。
 * `types/index.ts` が丸ごと再エクスポートするので、
 * **`@/types` からの import は1つも書き換わっていません。**
 */
export const TaskType = {
  FREE: 'free',
  CHECKLIST: 'checklist',
  PRODUCTION_STEP: 'production_step',
  SALES: 'sales',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const TaskTypeLabels: Record<TaskType, string> = {
  free: 'フリータスク',
  checklist: 'チェックリスト',
  production_step: '制作ステップ',
  sales: '営業タスク',
};

export const ProductionStep = {
  SCRIPT: 'script',
  MATERIALS: 'materials',
  RECORDING: 'recording',
} as const;
export type ProductionStep = (typeof ProductionStep)[keyof typeof ProductionStep];

export const ProductionStepLabels: Record<ProductionStep, string> = {
  script: '台本作成',
  materials: '素材準備',
  recording: '収録',
};

export interface TaskColumn {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 未完了のタスクの止まり方 (migration 137)。完了は `is_completed` が持つ */
export type TaskWorkState = 'todo' | 'doing' | 'waiting';

export interface ProjectTask {
  id: string;
  project_id: string;
  episode_id: string | null;
  column_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  production_step: ProductionStep | null;
  start_date: string | null;
  due_date: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  is_completed: boolean;
  completed_at: string | null;
  /**
   * 完了していないときの止まり方 (v4 ④)。
   * **完了かどうかは `is_completed` が正** — この列は完了していないときだけ意味を持つ。
   * 画面に出す状態は `taskState()` (`contexts/tasks/pages/taskList/state.ts`) で組み立てる
   */
  work_state?: TaskWorkState;
  progress?: number;
  is_milestone?: boolean;
  sort_order: number;
  parent_task_id: string | null;
  column_name: string | null;
  column_color: string | null;
  children?: ProjectTask[];
  created_at: string;
  updated_at: string;
  /** v2.9.198+: AI (MCP create_task) が作成したタスクか (mcp_audit_log 照合) */
  is_ai_created?: boolean;
  ai_requested_by?: string | null;
}

export interface TaskColumnTemplate {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  columns: TaskColumnTemplateColumn[];
}

export interface TaskColumnTemplateColumn {
  id: string;
  template_id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

// ---------- Task Dashboard (cross-project) ----------

export interface DashboardProject {
  id: string;
  gls_number: string | null;
  gls_category: 'A' | 'B' | null;
  name: string;
  stage: string;
}

export interface DashboardTask extends ProjectTask {
  project_gls_number: string | null;
  project_name: string;
  project_stage: string;
}

export interface TaskDashboardData {
  projects: DashboardProject[];
  columns: TaskColumn[];
  tasks: DashboardTask[];
}
