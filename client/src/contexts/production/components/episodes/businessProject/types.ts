/**
 * GPM の請求タブ（`BusinessProjectView`）が使う型
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 * 2,031 行あった1ファイルを役割ごとに分けている途中です（段1）。
 * 型と定数だけなので、**実行時の振る舞いは何も変わりません**。
 */
import type { Project } from '@/types';
import { TaxCategoryLabels } from '@/types';

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

// 画面ごとに表を持つと足した区分が漏れる (実際に不課税がここだけ抜けていた)。
// 表は client/src/types/index.ts の TaxCategoryLabels 1本にする。
export const taxLabels: Record<string, string> = TaxCategoryLabels;
