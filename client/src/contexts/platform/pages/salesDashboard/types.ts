import type { ProjectStage } from '@/types';

/** `GET /dashboard/sales-overview` */
export interface SalesOverview {
  /** 何日動いていなければ「止まっている」とするか (サーバーが決める) */
  stuck_days: number;
  /** ステージの記録を始めた日 `YYYY-MM-DD`。まだ1件も無ければ null */
  stage_history_since: string | null;
  kpi: {
    active_projects: number;
    moved_this_week: number;
    stuck_projects: number;
    week_events: number;
    today_events: number;
    quote_waiting: number;
    quote_waiting_amount: number;
    month_revenue: number;
    month_revenue_count: number;
    /** 今月 受注になった案件（migration 164 以降のぶんだけ） */
    month_won_count: number;
    month_won_amount: number;
  };
  stuck: {
    id: string;
    name: string;
    customer_name: string | null;
    stage: ProjectStage;
    days: number;
    why: string;
  }[];
}

/** `GET /dashboard/pipeline` */
export interface PipelineStage {
  stage: ProjectStage;
  count: number | string;
  total_amount: number | string;
}

/** `GET /dashboard/weekly-schedule` */
export interface WeekDay {
  date: string;
  dayLabel: string;
  events: {
    name?: string;
    project_name?: string;
    gls_number?: string;
    episode_code?: string;
    booking_type?: string;
    type: string;
  }[];
}
