/** 営業レビュー (v4) — サーバーの返り値の形。ロジックは触っていないので旧実装のまま */
import type { ProjectStage } from '@/types';

export interface StageCount {
  stage: ProjectStage;
  count: number;
  total_amount: number;
}

export interface Conversion {
  from: ProjectStage;
  to: ProjectStage;
  rate: number;
}

export interface MonthlyTrendRow {
  month: string; // '01'〜'12'
  won_count?: number;
  lost_count?: number;
  won_amount?: number;
  total_amount?: number;
  count?: number;
}

export interface FunnelData {
  stage_counts: StageCount[];
  total_count: number;
  won_count: number;
  lost_count: number;
  win_rate: number;
  loss_rate: number;
  avg_dwell_days: number;
  conversions: Conversion[];
  monthly_trend: MonthlyTrendRow[];
}

export interface LostReason {
  reason: string;
  count: number;
  total_amount: number;
}

export interface LostLesson {
  id: string;
  name: string;
  gls_number?: string | null;
  code?: string | null;
  customer_name?: string | null;
  customer_short_name?: string | null;
  lost_reason?: string | null;
  lessons_learned: string;
  expected_amount: number;
  lost_at: string | null;
}

export interface LostAnalysis {
  reasons: LostReason[];
  total_lost: number;
  total_lost_amount: number;
  avg_lost_amount: number;
  monthly_trend: MonthlyTrendRow[];
  lessons: LostLesson[];
}

export interface PerformanceRow {
  user_id: string;
  user_name: string;
  target_amount: number;
  won_amount: number;
  won_count: number;
  total_count: number;
  lost_count: number;
  avg_deal_size: number;
  achievement_rate: number;
  win_rate: number;
}

export interface StaffUser {
  id: string;
  name: string;
  role: string;
}
