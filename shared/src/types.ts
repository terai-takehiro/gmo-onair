import type { UserRole, OpportunityStage, ProjectStatus, TaxCategory, SettlementMethod } from './enums';

// 共通フィールド
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

// ユーザー
export interface User extends BaseEntity {
  name: string;
  email: string;
  role: UserRole;
}

// 顧客
export interface Customer extends BaseEntity {
  name: string;
  short_name: string | null;
  notes: string | null;
}

// 仕入先
export interface Vendor extends BaseEntity {
  name: string;
  address: string | null;
  vendor_type: string | null;
  invoice_registration_number: string | null;
  notes: string | null;
}

// パートナー
export interface Partner extends BaseEntity {
  name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  specialties: string[];
  notes: string | null;
}

// ヨミ
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
  // Joined
  customer_name?: string;
  assigned_to_name?: string;
}

// 案件
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
  // Joined
  customer_name?: string;
}

// 売上
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
  // Joined
  project_name?: string;
  customer_name?: string;
}

// 仕入
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
  // Joined
  project_name?: string;
  vendor_name?: string;
}

// APIレスポンス
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

// プロジェクトサマリー
export interface ProjectSummary {
  total_revenue: number;
  total_purchase: number;
  gross_profit: number;
  gross_margin: number;
}

// ダッシュボードKPI
export interface DashboardKpi {
  monthly_revenue: number;
  monthly_gross_margin: number;
  active_projects: number;
  active_opportunities: number;
}

// カレンダーイベント
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
