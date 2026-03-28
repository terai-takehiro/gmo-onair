// ==================================================
// Types duplicated from @gmo-onair/shared for Vite compatibility
// Keep in sync with shared/src/types.ts and shared/src/enums.ts
// ==================================================

// ---------- Enums ----------

export const UserRole = {
  SYSTEM_ADMIN: 'system_admin',
  STAFF: 'staff',
  VIEWER: 'viewer',
  EXTERNAL_CLIENT: 'external_client',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserRoleLabels: Record<UserRole, string> = {
  system_admin: 'システム管理者',
  staff: '担当者',
  viewer: '閲覧者',
  external_client: '外部顧客',
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
export const OpportunityStage = ProjectStage;
export type OpportunityStage = ProjectStage;
export const OpportunityStageLabels = ProjectStageLabels;
export const OpportunityStageColors = ProjectStageColors;
export const OpportunityStageProbability = ProjectStageProbability;
export const OPPORTUNITY_STAGES = PROJECT_STAGES;

// 案件種類
export const ProjectType = {
  OFFLINE_EVENT: 'offline_event',
  HYBRID_EVENT: 'hybrid_event',
  LIVE_BROADCAST: 'live_broadcast',
  RECORDING: 'recording',
  GMO_PROJECT: 'gmo_project',
  OTHER: 'other',
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

export const ProjectTypeLabels: Record<ProjectType, string> = {
  offline_event: 'オフラインイベント',
  hybrid_event: 'ハイブリットイベント',
  live_broadcast: '生放送',
  recording: '収録',
  gmo_project: 'GMO案件',
  other: 'その他',
};

// 料金計算タイプ
export const CalcType = {
  DAYS: 'days',
  HOURS: 'hours',
  FIXED: 'fixed',
  DAYS_QTY: 'days_qty',
  DAYS_PEOPLE: 'days_people',
  TOGGLE: 'toggle',
} as const;
export type CalcType = (typeof CalcType)[keyof typeof CalcType];

export const CalcTypeLabels: Record<CalcType, string> = {
  days: '日数×単価',
  hours: '時間×単価',
  fixed: '固定',
  days_qty: '台数×日数×単価',
  days_people: '人数×日数×単価',
  toggle: '有無×単価',
};

export const TaxCategory = {
  TAX10: 'tax10',
  TAX8: 'tax8',
  EXEMPT: 'exempt',
} as const;
export type TaxCategory = (typeof TaxCategory)[keyof typeof TaxCategory];

export const TaxCategoryLabels: Record<TaxCategory, string> = {
  tax10: '10%課税',
  tax8: '8%課税(軽減)',
  exempt: '非課税',
};

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

// 請求グループステータス
export const InvoiceGroupStatus = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
} as const;
export type InvoiceGroupStatus = (typeof InvoiceGroupStatus)[keyof typeof InvoiceGroupStatus];

export const InvoiceGroupStatusLabels: Record<InvoiceGroupStatus, string> = {
  draft: '下書き',
  sent: '送付済',
  paid: '入金済',
};

export const InvoiceGroupStatusColors: Record<InvoiceGroupStatus, string> = {
  draft: '#94a3b8',
  sent: '#f59e0b',
  paid: '#22c55e',
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
  unit_price: number;
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

// 話数(エピソード)
export interface Episode extends BaseEntity {
  project_id: string;
  episode_number: number;
  episode_code: string;
  recording_date: string | null;
  broadcast_date: string | null;
  delivery_date: string | null;
  notes: string | null;
  // 集計フィールド
  actual_revenue?: number;
  actual_cost?: number;
  revenue_count?: number;
  purchase_count?: number;
}

// 発注バッチ
export interface EpisodeOrder extends BaseEntity {
  project_id: string;
  order_date: string;
  episode_count: number;
  start_episode: number;
  end_episode: number;
  notes: string | null;
}

// 請求グループ
export interface InvoiceGroup extends BaseEntity {
  project_id: string;
  title: string;
  invoice_date: string | null;
  status: InvoiceGroupStatus;
  notes: string | null;
  episodes?: Episode[];
  total_amount?: number;
  episode_count?: number;
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
