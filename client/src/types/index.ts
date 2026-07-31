// ==================================================
// Types duplicated from @gmo-onair/shared for Vite compatibility
// Keep in sync with shared/src/types.ts and shared/src/enums.ts
// ==================================================

// ---------- Enums ----------

export const UserRole = {
  SYSTEM_ADMIN: 'system_admin',
  STAFF: 'staff',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserRoleLabels: Record<UserRole, string> = {
  system_admin: 'システム管理者',
  staff: 'スタッフ',
};

// 統合ステージ (ヨミ〜案件終了まで一本化)
export const ProjectStage = {
  NETA: 'neta',
  D_HOLD: 'd_hold',
  C_PROPOSAL: 'c_proposal',
  B_VERBAL: 'b_verbal',
  A_WON: 'a_won',
  S_COMPLETED: 's_completed',
  E_LOST: 'e_lost',
} as const;
export type ProjectStage = (typeof ProjectStage)[keyof typeof ProjectStage];

export const ProjectStageLabels: Record<ProjectStage, string> = {
  neta: 'ネタ',
  d_hold: 'D 仮押さえ',
  c_proposal: 'C 見積提案済',
  b_verbal: 'B 口頭決定',
  a_won: 'A 受注済',
  s_completed: 'S 案件終了',
  e_lost: 'E 失注',
};

export const ProjectStageColors: Record<ProjectStage, string> = {
  neta: '#94a3b8',
  d_hold: '#a78bfa',
  c_proposal: '#3b82f6',
  b_verbal: '#f59e0b',
  a_won: '#22c55e',
  s_completed: '#6b7280',
  e_lost: '#ef4444',
};

export const ProjectStageProbability: Record<ProjectStage, number> = {
  neta: 0, d_hold: 20, c_proposal: 40,
  b_verbal: 80, a_won: 100, s_completed: 100, e_lost: 0,
};

export const PROJECT_STAGES = Object.entries(ProjectStageLabels).map(([value, label]) => ({
  value: value as ProjectStage,
  label,
  color: ProjectStageColors[value as ProjectStage],
  probability: ProjectStageProbability[value as ProjectStage],
}));

// Backward compat aliases
export const OPPORTUNITY_STAGES = PROJECT_STAGES;

// 案件種類
export const ProjectType = {
  OFFLINE_EVENT: 'offline_event',
  HYBRID_EVENT: 'hybrid_event',
  LIVE_BROADCAST: 'live_broadcast',
  RECORDING: 'recording',
  GMO_PROJECT: 'gmo_project',
  CONSULTING: 'consulting',
  OTHER: 'other',
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

export const ProjectTypeLabels: Record<ProjectType, string> = {
  offline_event: 'オフラインイベント',
  hybrid_event: 'ハイブリットイベント',
  live_broadcast: '生放送',
  recording: '収録',
  gmo_project: 'GMO案件',
  consulting: 'コンサルティング',
  other: 'その他',
};

// A系(制作): エピソード・スタジオ予約あり / B系(その他売上): シンプル
export const PROJECT_CATEGORY_A: ProjectType[] = ['offline_event', 'hybrid_event', 'live_broadcast', 'recording'];
export const PROJECT_CATEGORY_B: ProjectType[] = ['gmo_project', 'consulting', 'other'];
export function getProjectCategory(projectType: string): 'A' | 'B' {
  return (PROJECT_CATEGORY_A as string[]).includes(projectType) ? 'A' : 'B';
}

// 料金計算タイプ
export const CalcType = {
  DAYS: 'days',
  HOURS: 'hours',
  FIXED: 'fixed',
  DAYS_QTY: 'days_qty',
  DAYS_PEOPLE: 'days_people',
  TOGGLE: 'toggle',
  QTY: 'qty',
} as const;
export type CalcType = (typeof CalcType)[keyof typeof CalcType];

export const CalcTypeLabels: Record<CalcType, string> = {
  days: '日数×単価',
  hours: '時間×単価',
  fixed: '固定',
  days_qty: '台数×日数×単価',
  days_people: '人数×日数×単価',
  toggle: '有無×単価',
  qty: '数量×単価',
};

// 税区分 (shared/src/enums.ts と同じ内容を持つ。このファイルの方針どおり写しで持つ)
//
// **非課税 (exempt) と不課税 (nontax) は別物**なので選択肢を分けている。
//  - 非課税: 消費税の対象だが法令で課税しない取引 (土地の貸付・利息・行政手数料など)
//  - 不課税: そもそも消費税の対象外 (給与・寄付・配当・国外取引など)
// どちらも税額は 0 円だが、**帳簿と申告では区別する**ため一方に寄せると後から分けられない。
export const TaxCategory = {
  TAX10: 'tax10',
  TAX8: 'tax8',
  EXEMPT: 'exempt',
  NONTAX: 'nontax',
} as const;
export type TaxCategory = (typeof TaxCategory)[keyof typeof TaxCategory];

export const TaxCategoryLabels: Record<TaxCategory, string> = {
  tax10: '10%課税',
  tax8: '8%課税(軽減)',
  exempt: '非課税',
  nontax: '不課税',
};

/** 税率。**画面はここだけを見る** (その場で三項演算子を書くと選択肢が増えたとき漏れる) */
export const TaxCategoryRates: Record<string, number> = {
  tax10: 0.1,
  tax8: 0.08,
  exempt: 0,
  nontax: 0,
};

/** 税率 (未知の値は 10% として扱う。既存データに合わせる) */
export function taxRateOf(taxCategory: string | null | undefined): number {
  return TaxCategoryRates[String(taxCategory ?? '')] ?? TaxCategoryRates.tax10;
}

/** 短い表示 (一覧の狭い列用)。「10%」「8%」「非課税」「不課税」 */
export function taxShortLabel(taxCategory: string | null | undefined): string {
  switch (String(taxCategory ?? '')) {
    case 'tax8': return '8%';
    case 'exempt': return '非課税';
    case 'nontax': return '不課税';
    default: return '10%';
  }
}

export const SettlementMethod = {
  RAKURAKU: 'rakuraku',
  XPOINT: 'xpoint',
  OTHER: 'other',
} as const;
export type SettlementMethod = (typeof SettlementMethod)[keyof typeof SettlementMethod];

export const SettlementMethodLabels: Record<SettlementMethod, string> = {
  rakuraku: '楽楽精算',
  xpoint: 'X-Point',
  other: 'その他',
};

// 番組種別
export const BroadcastType = {
  LIVE: 'live',
  RECORDING: 'recording',
} as const;
export type BroadcastType = (typeof BroadcastType)[keyof typeof BroadcastType];

export const BroadcastTypeLabels: Record<BroadcastType, string> = {
  live: '生放送',
  recording: '収録',
};

// 配信媒体
export const MediaPlatform = {
  YOUTUBE: 'youtube',
  TERRESTRIAL_TV: 'terrestrial_tv',
  NET_MEDIA: 'net_media',
  ZOOM: 'zoom',
  TEAMS: 'teams',
  OTHER: 'other',
} as const;
export type MediaPlatform = (typeof MediaPlatform)[keyof typeof MediaPlatform];

export const MediaPlatformLabels: Record<MediaPlatform, string> = {
  youtube: 'YouTube',
  terrestrial_tv: '地上波TV',
  net_media: 'ネットメディア',
  zoom: 'ZOOM',
  teams: 'Teams',
  other: 'その他',
};

// ---------- Base Entity ----------

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

// ---------- Domain Types ----------

export interface User extends BaseEntity {
  name: string;
  email: string;
  role: UserRole;
}

export interface Customer extends BaseEntity {
  name: string;
  short_name: string | null;
  notes: string | null;
}

export interface Vendor extends BaseEntity {
  name: string;
  address: string | null;
  vendor_type: string | null;
  invoice_registration_number: string | null;
  notes: string | null;
}

export interface Partner extends BaseEntity {
  name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  specialties: string[];
  notes: string | null;
}

// 統合プロジェクト (ヨミ + 案件 = 1テーブル)
export interface Project extends BaseEntity {
  code: string;
  gls_number: string | null;
  gls_category?: 'A' | 'B' | null;
  name: string;
  customer_id: string;
  stage: ProjectStage;
  project_type: ProjectType;
  project_type_other: string | null;
  expected_amount: number;
  event_start: string | null;
  event_end: string | null;
  broadcast_type: string | null;
  media_platform: string | null;
  assigned_to: string;
  tags: string;
  lost_reason: string | null;
  lost_reason_note: string | null;
  application_form: boolean;
  logo_permission: boolean;
  notes: string | null;
  // joined fields
  customer_name?: string;
  assigned_to_name?: string;
  episode_count?: number;
}

export interface PricingCategory extends BaseEntity {
  name: string;
  sort_order: number;
  items?: PricingItem[];
}

export interface PricingItem extends BaseEntity {
  category_id: string;
  name: string;
  sub_label: string | null;
  unit_price: number | null;
  group_price: number | null;
  calc_type: CalcType;
  sort_order: number;
}

export interface SimulationItem {
  id: string;
  project_id: string;
  pricing_item_id: string;
  quantity: number;
  days: number;
  unit_price: number;
  subtotal: number;
  item_name?: string;
  category_name?: string;
  calc_type?: CalcType;
}

export interface Revenue extends BaseEntity {
  billing_key: string | null;
  project_id: string;
  episode_id: string | null;
  customer_id: string;
  assigned_to: string | null;
  tax_category: TaxCategory;
  amount: number;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  project_name?: string;
  customer_name?: string;
}

export interface SgaExpense extends BaseEntity {
  billing_key: string;
  assigned_to: string | null;
  settlement_method: SettlementMethod | null;
  settlement_number: string | null;
  settlement_url: string | null;
  vendor_name: string;
  vendor_id: string | null;
  description: string | null;
  notes: string | null;
  recognition_date: string | null;
  payment_due_date: string | null;
  tax_category: TaxCategory;
  invoice_qualified: boolean;
  amount: number;
  expense_type: 'fixed' | 'spot';
  amortize_start: string | null;
  amortize_end: string | null;
  source: 'staff' | 'accounting';
}

export interface Purchase extends BaseEntity {
  billing_key: string | null;
  project_id: string;
  episode_id: string | null;
  vendor_id: string;
  assigned_to: string | null;
  settlement_method: SettlementMethod | null;
  settlement_number: string | null;
  settlement_url: string | null;
  tax_category: TaxCategory;
  invoice_qualified: boolean;
  amount: number;
  description: string | null;
  recognition_date: string | null;
  inspection_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  project_name?: string;
  gls_number?: string;
  vendor_name?: string;
  episode_code?: string;
}

// ---------- API Response Types ----------

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ---------- Composite Types ----------

export interface ProjectSummary {
  total_revenue: number;
  total_purchase: number;
  gross_profit: number;
  gross_margin: number;
}

export interface DashboardKpi {
  period_label: string;
  monthly_revenue: number;
  monthly_purchase: number;
  monthly_sga: number;
  gross_profit: number;
  monthly_gross_margin: number;
  operating_profit: number;
  operating_margin: number;
  active_projects: number;
  active_yomi: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'event' | 'recording' | 'broadcast';
  stage: ProjectStage;
  gls_number: string;
  project_id: string;
}

// ============================================================
// タスク管理 (Kanban / タスクリスト / ガントチャート)
// ============================================================

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
