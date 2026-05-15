import type { UserRole, ProjectStatus, TaxCategory, SettlementMethod, BroadcastType, MediaPlatform, InvoiceGroupStatus, CalcType } from './enums';

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

// 料金カテゴリ
export interface PricingCategory extends BaseEntity {
  name: string;
  sort_order: number;
  items?: PricingItem[];
}

// 料金項目
export interface PricingItem extends BaseEntity {
  category_id: string;
  name: string;
  sub_label: string | null;
  unit_price: number | null;
  group_price: number | null;
  calc_type: CalcType;
  sort_order: number;
}

// シミュレーション項目
export interface SimulationItem {
  id: string;
  opportunity_id: string;
  pricing_item_id: string;
  quantity: number;
  days: number;
  unit_price: number;
  subtotal: number;
  // Joined
  item_name?: string;
  category_name?: string;
  calc_type?: CalcType;
}

// 案件グループ（費用按分用）
export interface ProjectGroup extends BaseEntity {
  name: string;
  description: string | null;
  member_count?: number;
  total_purchase?: number;
}

// 仕入按分
export interface PurchaseAllocation {
  id: string;
  purchase_id: string;
  project_id: string;
  allocated_amount: number;
  project_name?: string;
  gls_number?: string;
}

// 案件
export interface Project extends BaseEntity {
  gls_number: string;
  name: string;
  customer_id: string;
  group_id: string | null;
  rehearsal_start: string | null;
  rehearsal_end: string | null;
  event_start: string | null;
  event_end: string | null;
  status: ProjectStatus;
  broadcast_type: BroadcastType;
  media_platform: MediaPlatform;
  application_form: boolean;
  logo_permission: boolean;
  notes: string | null;
  // Joined
  customer_name?: string;
  episode_count?: number;
  group_name?: string;
  group_allocated_cost?: number;
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

// 売上
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
  // Joined
  project_name?: string;
  customer_name?: string;
}

// 販管費
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

// 仕入の話数按分
export interface PurchaseEpisodeAllocation {
  id: string;
  purchase_id: string;
  episode_id: string;
  allocated_amount: number;
  episode_code?: string;
}

// 仕入
export interface Purchase extends BaseEntity {
  billing_key: string | null;
  project_id: string;
  group_id: string | null;
  episode_id: string | null;
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
  allocation_count?: number;
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
  active_yomi: number;
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
