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
