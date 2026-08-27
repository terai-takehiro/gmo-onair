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

/**
 * `GET /dashboard/today-sales`（docs/core-redesign-plan.md Phase 2 ①「今日の営業」）。
 *
 * 3つの集合はどれも **GLS-A（案件）だけ**・日付は `YYYY-MM-DD` の文字列
 * （サーバーが `::text` で返す — pg が DATE を JS Date にして UTC で1日ずれるため）。
 * `next_moves` は**今日期限を含む**（受信箱の「期限超過」とは切り方が違う。
 * 超過してから知るのではなく、今日やるべきものを朝のうちに見せるのがこのカード）。
 */
export interface TodaySales {
  /** 期限が来た次の一手（超過＋今日期限・古い順・最大50件） */
  next_moves: {
    project_id: string;
    project_name: string | null;
    customer_name: string | null;
    action: string | null;
    /** 一覧向けの短い言い換え（AI生成・migration 190）。無ければサーバーが `action` を入れて返す */
    action_short: string | null;
    due_date: string | null;
    activity_log_id: string;
  }[];
  /** スヌーズが明けたばかりの案件（明けて7日で自動退場） */
  snooze_awake: {
    project_id: string;
    project_name: string | null;
    customer_name: string | null;
    snooze_until: string | null;
  }[];
  /** 新しく停滞に入った案件（project-health の 'stalled'・放置日数の少ない順） */
  newly_stalled: {
    project_id: string;
    project_name: string | null;
    customer_name: string | null;
    stage: ProjectStage;
    stalled_days: number;
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
