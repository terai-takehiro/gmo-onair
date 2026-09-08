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
import type { LegalEntityCode } from '../../platform/services/legal-entity.service';

// ── 計上会社（2026年10月の事業再編・docs/reorg-2026-10-plan.md §4.2）────────
//
// 隔週キープの「主体別の収支」は main の**計上会社 `entity_code`**（SCS／GSS／GMO）そのもの。
// 語彙: SCS = GMOサムライコンテンツスタジオ（グループ外のお客様）／GSS = GMOサムライスタジオ
// （グループ内のお客様・旧 GMOグローバルスタジオ）／GMO = GMOインターネットグループ本体（コストセンター）。
// 案件・行にどの会社を付けるかは `sales/services/entity-resolution.service.ts`（§4.4）だけが決める。
// ⚠️ このファイルは**型と純粋な定数・判定だけ**（DB も HTTP も触らない）。
// `shared/tests/keepReport*.test.ts` が直接 import して shared 側の写しと突き合わせる。

/** 計上会社の code。`legal_entities.code`（`LegalEntityCode`）と同じ文字列 */
export type BusinessEntity = LegalEntityCode;
/** 絞り込みの値。`all` は3社の合計（統合） */
export type EntityScope = BusinessEntity | 'all';

/** 計上会社の並び（`legal_entities.sort_order`・`keep-report.service.ts` の ENTITY_CODES と同じ） */
export const BUSINESS_ENTITIES: readonly BusinessEntity[] = ['SCS', 'GSS', 'GMO'];

/** 資料・Slack に出す短い表示名（`legal_entities.name` から「株式会社」を除いたもの） */
export const BUSINESS_ENTITY_LABELS: Record<BusinessEntity, string> = {
  SCS: 'GMOサムライコンテンツスタジオ',
  GSS: 'GMOサムライスタジオ',
  GMO: 'GMOインターネットグループ',
};

export function isBusinessEntity(x: unknown): x is BusinessEntity {
  return x === 'SCS' || x === 'GSS' || x === 'GMO';
}

export function isEntityScope(x: unknown): x is EntityScope {
  return x === 'all' || isBusinessEntity(x);
}

/** 絞り込みの値の表示名。`all` は「全体（統合）」（shared の `entity.ts` と同じ文字） */
export function entityLabel(scope: EntityScope): string {
  return scope === 'all' ? '全体（統合）' : BUSINESS_ENTITY_LABELS[scope];
}

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
  /** 本番があるのに売上が未登録の案件。表の数字には入っていない（shared の同名の型と同じ） */
  unregistered: Array<{ project_id: string; project_name: string; amount: number }>;
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
  entity_code: BusinessEntity;
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
  /** 折り込む前の実際の分類数。`by_category` は表示用に MAX_CATEGORIES 件まで畳んであるため、
   * その `.length` を「分類数」として出すと畳んだ日から実数より少なく出る（Codex 指摘） */
  category_count: number;
  by_category: Array<{ category: string; groups: number; people: number }>;
  next_session: { date: string; applied_groups: number } | null;
}

/** 計上会社ごとの表と、統合した全体の表。`GMO`（コストセンター）は数字があるときだけ。 */
export interface PlByEntity {
  all: MonthlyPlTable;
  SCS: MonthlyPlTable;
  GSS: MonthlyPlTable;
  GMO?: MonthlyPlTable;
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
