/**
 * お客様の詳細（顧客360）— 型 (v4)
 *
 * `GET /customers/:id/overview` が返す形をここ1か所に書く。各部品はこれを見る。
 * サーバー側は `server/.../customers.routes.ts` の `router.get('/:id/overview', …)`。
 */
export interface CustomerRecord {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_ai_created?: boolean;
  ai_requested_by?: string | null;
}

export interface CustomerSummary {
  confirmed_revenue: number;
  project_total: number;
  project_active: number;
  last_contact_date: string | null;
  open_actions: number;
}

/** 案件リストの1行（`ORDER BY 進行中優先, 実施日降順`） */
export interface CustomerProject {
  id: string;
  gls_number: string | null;
  code: string | null;
  name: string;
  stage: string;
  event_start: string | null;
  expected_amount: number | null;
  total_revenue: number;
  total_purchase: number;
  is_active: boolean;
}

/**
 * 統合タイムラインの1行（顧客直付け or 案件経由）。
 *
 * `activityLog/types.ts` の `ActivityLogRow` と重なる項目が多いが、**このサーバー
 * クエリは別の SELECT**（`duration_minutes`・`project_code`・`customer_id`・
 * `customer_name` を返さない）なので、フル `ActivityLogRow` とは別の型にする。
 * `activityLog/` の部品を呼ぶところは `Pick` で必要な項目だけを要求している。
 */
export interface CustomerActivity {
  id: string;
  activity_type: string;
  activity_date: string;
  subject: string;
  description: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_done_at: string | null;
  source_channel: string | null;
  message_id: string | null;
  project_id: string | null;
  project_name: string | null;
  project_gls: string | null;
  user_name: string | null;
  is_ai_created: boolean;
  ai_requested_by: string | null;
}

export interface CustomerOverview {
  customer: CustomerRecord;
  summary: CustomerSummary;
  projects: CustomerProject[];
  timeline: CustomerActivity[];
  sales_by_year: Array<{ year: string; total: number }>;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** 最終接点からの経過日数。壊れた日付・null は「分からない」として `null` を返す */
export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

export { todayStr };
