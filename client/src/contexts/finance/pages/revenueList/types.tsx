// 売上一覧の型・定数・並べ替えアイコン — v2.9.295 で RevenueListPage.tsx から切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';

export type SortKey = "billing_key" | "gls_number" | "project_name" | "customer_name" | "tax_category" | "amount" | "recognition_date";
export type SortDir = "asc" | "desc";

// 列キー → サーバー側ソートキー (list-query.ts の REVENUE_SORT と一致)
export const REVENUE_SORT_TO_SERVER: Record<string, string> = {
  billing_key: "billing_key",
  gls_number: "gls",
  project_name: "project",
  customer_name: "customer",
  tax_category: "tax",
  amount: "amount",
  recognition_date: "recognition",
};

export function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-0.5 opacity-40" />;
  return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 ml-0.5" /> : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
}

export interface RevenueRow {
  id: string;
  billing_key: string | null;
  project_id: string;
  project_name: string | null;
  gls_number: string | null;
  customer_name: string | null;
  event_end: string | null;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  is_advance_payment: boolean;
  invoice_issued?: boolean;
  group_id: string | null;
  status: string;
  items?: RevenueItem[];
  /** 月次ユニット等エピソード紐づき時のコード (例 GLS-B005-2607)。表示は GLS 番号より優先 */
  episode_code?: string | null;
}

export interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
  customer_id: string;
  customer_name?: string;
  project_type?: string;
  customer_type?: string;
  expected_amount?: number;
  event_end?: string;
}

export interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
}

export interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  pricing_item_id?: string;
  period_start?: string | null;
  period_end?: string | null;
  item_notes?: string | null;
  category?: string | null;
}
