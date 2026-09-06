/**
 * 定例報告パック（KeepReportPack）の型 — **サーバー側の写し**
 *
 * ⚠️ 正は `shared/src/keepReport/types.ts`。サーバーは `shared/` を import できない
 * （`server/tsconfig.json` の `rootDir: "./src"`）ので、**同じ形をここにも持つ**
 * （制作資料 AI の `qsheet/ai/types.ts` と同じ考え）。
 *
 * **鍵の名前が食い違うと、画面・pptx が読む所にサーバーが書かない**ことになる。
 * 同じであることは `shared/tests/keepReportCalc.test.ts`（「型の写し」の節）が
 * 両方のファイルを読んで interface ごとの鍵を突き合わせて固定している —
 * **入れ子の `{ ... }` は1行で書くこと**（その検査が行頭の鍵だけを見るため）。
 *
 * 数字の約束（shared 側と同じ）: 金額は円の整数、比率は %（小数1桁）、null は「目標が無い」。
 */
import type { BusinessEntity, EntityScope } from '../../sales/services/project-entity';

export type { BusinessEntity, EntityScope };

/** お客様の区分。`projects.customer_type` の写し（当時の値） */
export type CustomerSegment = 'internal' | 'external';
export type SegmentScope = CustomerSegment | 'all';

export type ConfidenceLetter = 'A' | 'B' | 'C' | 'D' | 'E';
export type Judge = '○' | '✕' | '-';

export interface BudgetLine {
  key: 'revenue' | 'cogs_variable' | 'gross_profit' | 'sga' | 'cogs_fixed' | 'operating_profit';
  label: string;
  budget: number | null;
  actual: number;
  diff: number | null;
  ratio: number | null;
  judge: Judge;
  kind: 'higher_better' | 'lower_better';
}

export interface MonthlyPlTable {
  year_month: string;
  mode: 'landing' | 'forecast';
  lines: BudgetLine[];
  unconfirmed: Array<{ project_id: string; project_name: string; amount: number }>;
  has_override: boolean;
  override_note: string | null;
}

export interface MonthlyTrendPoint {
  year_month: string;
  revenue_internal: number;
  revenue_external: number;
  project_count_internal: number;
  project_count_external: number;
  business_days: number;
  active_days: number;
  utilization: number | null;
}

export interface PipelineRow {
  project_id: string;
  code: string;
  name: string;
  customer_name: string;
  customer_segment: CustomerSegment;
  entity: BusinessEntity;
  samurai_related: boolean;
  stage: string;
  confidence: ConfidenceLetter;
  probability: number;
  event_start: string | null;
  event_end: string | null;
  estimate_amount: number | null;
  estimate_gross_profit: number | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_owner: string | null;
  last_activity_at: string | null;
  since_last: 'new' | 'updated' | null;
}

export interface ProjectPageData {
  project_id: string;
  ordinal: number | null;
  band: { customer_short: string; event_name: string; date_label: string };
  confidence: ConfidenceLetter;
  confidence_label: string;
  photos: Array<{ box_file_id: string; caption: string | null }>;
  summary_lines: string[];
  schedule: Array<{ time: string; content: string; venue: string }>;
  key_dates: Array<{ label: 'チェック' | 'リハ' | '本番'; text: string }>;
  intake_channel: string | null;
  revenue: number | null;
  gross_profit: number | null;
  gross_margin: number | null;
  headline: string | null;
  highlights: string[];
  report_status: 'draft' | 'confirmed' | null;
}

export interface UtilizationCalendar {
  year_month: string;
  utilization: number | null;
  days: Record<string, Array<{ kind: string; label: string }>>;
  counted_kinds: string[];
}

export interface InviewSummary {
  session_date: string;
  groups: number;
  people: number;
  satisfaction: number | null;
  promoted_projects: number;
  by_category: Array<{ category: string; groups: number; people: number }>;
  next_session: { date: string; applied_groups: number } | null;
}

export interface PlByEntity {
  all: MonthlyPlTable;
  gss: MonthlyPlTable;
  gscs: MonthlyPlTable;
  gig?: MonthlyPlTable;
}

export interface KeepReportPack {
  version: 1;
  meeting_date: string;
  previous_meeting_date: string | null;
  generated_at: string;
  frozen_at: string | null;
  scope: { entity: EntityScope; customer_segment: CustomerSegment | 'all' };
  landing: PlByEntity;
  forecast: PlByEntity;
  trend: MonthlyTrendPoint[];
  pipeline: { external: PipelineRow[]; samurai: PipelineRow[]; weighted_revenue: number; total_revenue: number };
  project_pages: ProjectPageData[];
  event_reports: ProjectPageData[];
  calendars: UtilizationCalendar[];
  inview: InviewSummary | null;
  minutes: { decisions: string[]; topics: Array<{ area: string; text: string }>; next_meeting_date: string | null } | null;
}

/** ONAiR に無い数字の手入力（keep_report_inputs）。会議日 × key */
export type KeepInputKey = 'inview_satisfaction' | 'attendance' | 'web_kpi' | 'note';
export const KEEP_INPUT_KEYS: readonly KeepInputKey[] = ['inview_satisfaction', 'attendance', 'web_kpi', 'note'];

export interface KeepInput {
  meeting_date: string;
  key: KeepInputKey;
  value: Record<string, unknown>;
  updated_at?: string | null;
  updated_by?: string | null;
}
