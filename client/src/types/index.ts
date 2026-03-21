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

export const OpportunityStage = {
  LEAD: 'lead',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
} as const;
export type OpportunityStage = (typeof OpportunityStage)[keyof typeof OpportunityStage];

export const OpportunityStageLabels: Record<OpportunityStage, string> = {
  lead: 'リード',
  proposal: '提案中',
  negotiation: '交渉中',
  won: '受注',
  lost: '失注',
};

export const OpportunityStageColors: Record<OpportunityStage, string> = {
  lead: '#94a3b8',
  proposal: '#3b82f6',
  negotiation: '#f59e0b',
  won: '#22c55e',
  lost: '#ef4444',
};

export const ProjectStatus = {
  TENTATIVE: 'tentative',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ProjectStatusLabels: Record<ProjectStatus, string> = {
  tentative: '仮',
  confirmed: '確定',
  completed: '完了',
  cancelled: '中止',
};

export const ProjectStatusColors: Record<ProjectStatus, string> = {
  tentative: '#f59e0b',
  confirmed: '#005bac',
  completed: '#22c55e',
  cancelled: '#ef4444',
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

export interface Opportunity extends BaseEntity {
  opp_code: string;
  title: string;
  customer_id: string;
  stage: OpportunityStage;
  probability: number;
  expected_amount: number;
  expected_date: string | null;
  project_id: string | null;
  assigned_to: string;
  notes: string | null;
  customer_name?: string;
  assigned_to_name?: string;
}

export interface Project extends BaseEntity {
  gls_number: string;
  name: string;
  customer_id: string;
  opportunity_id: string | null;
  rehearsal_start: string | null;
  rehearsal_end: string | null;
  event_start: string | null;
  event_end: string | null;
  status: ProjectStatus;
  application_form: boolean;
  logo_permission: boolean;
  notes: string | null;
  customer_name?: string;
}

export interface Revenue extends BaseEntity {
  billing_key: string | null;
  project_id: string;
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

export interface Purchase extends BaseEntity {
  project_id: string;
  vendor_id: string;
  assigned_to: string | null;
  settlement_method: SettlementMethod | null;
  settlement_number: string | null;
  external_ref_id: string | null;
  tax_category: TaxCategory;
  invoice_qualified: boolean;
  amount: number;
  description: string | null;
  recognition_date: string | null;
  inspection_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  project_name?: string;
  vendor_name?: string;
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
  monthly_revenue: number;
  monthly_gross_margin: number;
  active_projects: number;
  active_opportunities: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'rehearsal' | 'event';
  status: ProjectStatus;
  gls_number: string;
  project_id: string;
}
