/** トップページ (v4) が読むデータの形 */

/** `GET /dashboard/weekly-schedule` の1日ぶん */
export interface ScheduleDay {
  date: string;
  dayLabel: string;
  events: ScheduleEvent[];
}

export interface ScheduleEvent {
  id?: string;
  /** `event`=本番 / `recording`=収録 / `broadcast`=配信 / `booking`=スタジオ / `hold`=仮押さえ */
  type: string;
  name?: string;
  project_name?: string;
  gls_number?: string;
  episode_code?: string;
  booking_type?: string;
  /**
   * ISO 文字列。**予約にしか入っていません** — 案件の本番日・収録日は
   * 日付しか持たないので、画面はそれを「終日」として扱います
   */
  start_time?: string | null;
  end_time?: string | null;
}

/** `GET /dashboard/app-badges`。**権限のあるアプリのキーだけ**が入る */
export interface AppBadges {
  budget?: number;
  studio?: number;
  equipment?: number;
}

/** `GET /dailyops/tasks/summary` */
export interface MyTaskSummary {
  pending_intakes: number;
  unanswered_delegations: number;
  overdue: number;
  due_today: number;
  no_due_date: number;
}

/** `GET /dailyops/tasks/mine` の1件 */
export interface MyTaskRow {
  id: string;
  title: string;
  due_at: string | null;
  priority_score: number;
  requester_id: string | null;
  requester_name: string | null;
  delegation_status: string | null;
  is_overdue: boolean;
  project_name: string | null;
  gls_number: string | null;
}
