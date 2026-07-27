// ビジネス案件ビューの型と表示用の定数 — v2.9.293 で BusinessProjectView.tsx から切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import type { Project } from '@/types';

export interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  period_start?: string | null;
  period_end?: string | null;
  item_notes?: string | null;
  category?: string | null;
}

export interface Revenue {
  id: string;
  billing_key: string;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  subtitle: string | null;
  customer_name: string;
  items?: RevenueItem[];
  group_name?: string | null;
  allocated_amount?: number | null;
  group_id?: string | null;
}

export interface Purchase {
  id: string;
  amount: number;
  description: string | null;
  vendor_id: string;
  vendor_name: string;
  recognition_date: string | null;
  settlement_method: string | null;
  settlement_number: string | null;
  tax_category: string;
  invoice_qualified: number;
  group_name?: string | null;
  group_id?: string | null;
  allocated_amount?: number | null;
}

export interface Props {
  project: Project;
  projectId: string;
  isEstimateMode?: boolean;
}

export const taxLabels: Record<string, string> = {
  tax10: "10%課税",
  tax8: "8%課税(軽減)",
  exempt: "非課税",
};
