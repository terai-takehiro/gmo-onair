import type { ProjectStage } from '@/types';

/**
 * 案件一覧の1行 (`GET /projects` が返すもののうち、この画面が使う分だけ)。
 *
 * **`Record<string, unknown>` で受けるのをやめました。** 旧実装は行を
 * `Record<string, unknown>` で受けて使うたびに `as string` していたため、
 * サーバーが列名を変えても型で気づけず、画面が黙って空欄になります。
 */
export interface ProjectListRow {
  id: string;
  name: string;
  code: string | null;
  gls_number: string | null;
  stage: ProjectStage;
  customer_name: string | null;
  event_start: string | null;
  event_end: string | null;
  expected_amount: number | string | null;
  total_revenue: number | string | null;
  is_ai_created?: boolean | null;
  ai_reviewed_at?: string | null;
  /** 未完了のうち期限がいちばん近いタスク (サーバーが1件だけ返す) */
  next_task_title: string | null;
  next_task_due: string | null;
  next_task_assignee: string | null;
  /** 案件・タスク・活動記録のうちいちばん新しい時刻 */
  last_activity_at: string | null;
}

export interface ProjectListResponse {
  data: ProjectListRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  /** ステージ別の件数 (ステージ以外の絞り込みだけを掛けたもの) */
  stage_counts: Record<string, number>;
}
