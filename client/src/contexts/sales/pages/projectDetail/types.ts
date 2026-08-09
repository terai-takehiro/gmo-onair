import type { ProjectStage } from '@/types';

/** `GET /projects/:id` のうち、案件詳細が使う分だけ */
export interface ProjectDetail {
  id: string;
  code: string | null;
  gls_number: string | null;
  gls_category: 'A' | 'B' | null;
  name: string;
  stage: ProjectStage;
  project_type: string | null;
  /**
   * 案件分類の2段（migration 181）。**旧 `project_type` と併存**しており、
   * 書くのはサーバーだけです（`server/.../project-classification.ts`）。
   * GLS-B の案件と、2段が入る前に作られた案件は null。
   */
  audience?: string | null;
  project_category?: string | null;
  customer_name: string | null;
  event_start: string | null;
  event_end: string | null;
  expected_amount: number | string | null;
  total_revenue: number | string | null;
  tags: string | null;
  notes: string | null;
  box_url_internal: string | null;
  box_url_external: string | null;
  updated_at: string;
  /**
   * AI がメールから起票した案件か。**サーバーが計算して返す**
   * (`projects.routes.ts` の詳細取得が書き込みの記録と突き合わせる)。
   * 本人名義で実行された分も検出されるので、画面側で作られ方を推測しない。
   */
  is_ai_created?: boolean;
  /** 「確認した」を押した時刻。押されるまで null */
  ai_reviewed_at?: string | null;
  /** 登録の16項目のうち、migration 170 で足したぶん */
  contact_name?: string | null;
  recurrence?: 'single' | 'regular' | null;
  attendee_count?: number | null;
  goal?: string | null;
  reply_due?: string | null;
  wants?: string | null;
  /** 引き合いの入口 (migration 165) */
  intake_channel?: string | null;
  /**
   * 標準工程を入れた時刻 (migration 178)。**入っていれば二度は入れられない**
   * （押し直しで同じタスクが2組できると、どちらを消すか分からなくなる）
   */
  flow_applied_at?: string | null;
}

/** `GET /studios/bookings?project_id=` の1行 */
export interface StudioBooking {
  id: string;
  booking_date: string;
  start_time: string | null;
  end_time: string | null;
  room_name: string | null;
  location_name: string | null;
}

/** `GET /activity-logs?project_id=` の1行 */
export interface ActivityLog {
  id: string;
  activity_date: string;
  subject: string;
  next_action: string | null;
  next_action_date: string | null;
  next_action_done_at: string | null;
}
