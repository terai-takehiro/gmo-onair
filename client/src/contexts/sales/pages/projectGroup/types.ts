/**
 * 按分グループ（`/sales/project-groups`）の型 (v4)
 *
 * **旧実装からそのまま移した**（サーバーの応答は変えていない）。
 */
export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  total_purchase: number;
  total_revenue: number;
}

export interface GroupMember {
  id: string;
  gls_number: string;
  name: string;
  stage: string;
  customer_name: string;
}

export interface Allocation {
  project_id: string;
  allocated_amount: number;
  project_name?: string;
  gls_number?: string;
}

export interface GroupPurchase {
  id: string;
  amount: number;
  description: string;
  vendor_id: string;
  vendor_name: string;
  tax_category: string;
  settlement_method: string;
  settlement_number: string | null;
  recognition_date: string;
  allocations: Allocation[];
}

export interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface GroupRevenue {
  id: string;
  billing_key: string;
  amount: number;
  subtitle: string | null;
  tax_category: string;
  customer_id: string;
  customer_name: string;
  recognition_date: string | null;
  billing_date: string | null;
  notes: string | null;
  status: string;
  items: RevenueItem[];
  allocations: Allocation[];
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  total_purchase: number;
  total_revenue: number;
  members: GroupMember[];
  purchases: GroupPurchase[];
  revenues: GroupRevenue[];
}

export interface GlsProject {
  id: string;
  gls_number: string;
  name: string;
  customer_name: string;
}

export const EMPTY_REVENUE_ITEM: RevenueItem = { description: '', quantity: 1, unit_price: 0, amount: 0 };
