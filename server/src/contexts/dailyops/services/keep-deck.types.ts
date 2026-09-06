/**
 * 隔週キープの「定例報告パック」と「資料の構成」の型 — **server 側の写し**。
 *
 * ⚠️ **server は `shared/` を import できません**（`server/tsconfig.json` の `rootDir: "./src"`）。
 * 正は `shared/src/keepReport/types.ts`（画面・pptx・MCP が同じ形を読むための1か所）で、
 * ここはその写しです。**片方だけ直すと、資料と画面の数字の形が食い違います。**
 * 形が同じであることは `shared/tests/keepReportDeckParity.test.ts` が、同じ材料（`__fixtures__/keep-pack.sample.json`）を
 * 両方の関数に通して同じ答えになることで固定しています（型そのものの照合ではない）。
 *
 * このファイルは型と表示名の表だけ（DB も HTTP も触らない）。
 */
export type BusinessEntity = 'gss' | 'gscs' | 'gig';
export type BusinessEntity = 'gss' | 'gscs' | 'gig';
export const BUSINESS_ENTITY_LABELS: Record<BusinessEntity, string> = {
  gss: 'GMOサムライスタジオ',
  gscs: 'GMOサムライコンテンツスタジオ',
  gig: 'GMOインターネットグループ人格',
};
/** 絞り込みの値。`all` は主体の合計。 */
export type EntityScope = BusinessEntity | 'all';

/** お客様の区分。`projects.customer_type` の写し（当時の値）。 */
export type CustomerSegment = 'internal' | 'external';

/** 資料の確度の文字。ONAiR のステージから引く（neta/d_hold→E・D, c_proposal→C, b_verbal→B, a_won 以降→A）。 */
export type ConfidenceLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export type Judge = '○' | '✕' | '-';

/** 目標と実績の1行。差・比率・判定は計算済み。 */
export interface BudgetLine {
  key: 'revenue' | 'cogs_variable' | 'gross_profit' | 'sga' | 'cogs_fixed' | 'operating_profit';
  label: string;
  /** 月次予算（円）。未登録なら null */
  budget: number | null;
  /** 着地または見通し（円） */
  actual: number;
  /** actual − budget。目標が無ければ null */
  diff: number | null;
  /** 対目標比（%）。売上・利益は actual÷budget、目標が赤字の行は 100 − (不足額÷|目標|)×100。目標が無ければ null */
  ratio: number | null;
  judge: Judge;
  /** 'higher_better' = 売上・利益系、'lower_better' = 費用系 */
  kind: 'higher_better' | 'lower_better';
}

/** ①数値報告の1表（当月 着地／翌月 着地見込）。 */
export interface MonthlyPlTable {
  year_month: string;              // 'YYYY-MM'
  mode: 'landing' | 'forecast';    // 着地 / 着地見込
  lines: BudgetLine[];
  /** 見通しに含めた「まだ確定していない」売上（案件名と金額）。資料の注記の材料 */
  unconfirmed: Array<{ project_id: string; project_name: string; amount: number }>;
  /** 経理の補正値（monthly_actual_overrides）を使ったか */
  has_override: boolean;
  override_note: string | null;
}

/** 9. 進捗状況のグラフの1か月ぶん。 */
export interface MonthlyTrendPoint {
  year_month: string;
  revenue_internal: number;   // グループ内イベントの確定売上（円）
  revenue_external: number;   // 外部顧客イベントの確定売上（円）
  project_count_internal: number;
  project_count_external: number;
  /** 稼働率の材料。内覧を含め何かしらの利用があった日を数え、メンテナンスと仮押さえは数えない（設定で変えられる） */
  business_days: number;
  active_days: number;
  utilization: number | null; // active_days ÷ business_days ×100
}

/** ヨミ表の1行。案件一覧と同じ並び（確度→実施日）。 */
export interface PipelineRow {
  project_id: string;
  code: string;                 // GLS 番号 or OPP 番号
  name: string;
  customer_name: string;
  customer_segment: CustomerSegment;
  entity: BusinessEntity;
  /** サムライパートナーズ／GMOサムライコンテンツスタジオが相手の案件（資料では別表） */
  samurai_related: boolean;
  stage: string;                // ONAiR のステージ
  confidence: ConfidenceLetter;
  probability: number;          // 受注確度（%）
  event_start: string | null;
  event_end: string | null;
  estimate_amount: number | null;     // 最新の見積（円）
  estimate_gross_profit: number | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_owner: string | null;
  last_activity_at: string | null;
  /** 前回の会議日以降に作られた／動いた印（資料の「新規」「更新」） */
  since_last: 'new' | 'updated' | null;
}

/** 案件ページ（提案中・実施報告 共通）の材料。 */
export interface ProjectPageData {
  project_id: string;
  ordinal: number | null;       // ① ②… 資料に載せる順
  band: { customer_short: string; event_name: string; date_label: string };
  confidence: ConfidenceLetter;
  confidence_label: string;     // 正式申込待／提案済／問い合わせ…
  photos: Array<{ box_file_id: string; caption: string | null }>;
  summary_lines: string[];      // 概要の箇条書き（案件の目的欄。人が直せる）
  schedule: Array<{ time: string; content: string; venue: string }>;
  key_dates: Array<{ label: 'チェック' | 'リハ' | '本番'; text: string }>;
  intake_channel: string | null;
  revenue: number | null;
  gross_profit: number | null;
  gross_margin: number | null;
  /** 実施報告のときだけ: ふりかえりの総括（1行）と箇条書き */
  headline: string | null;
  highlights: string[];
  report_status: 'draft' | 'confirmed' | null;
}

export interface UtilizationCalendar {
  year_month: string;
  utilization: number | null;
  /** 日 → 予定（種類と短い名前）。種類はカレンダーの予定種別そのまま */
  days: Record<string, Array<{ kind: string; label: string }>>;
  counted_kinds: string[];      // 稼働率に数えた種類（設定）
}

export interface InviewSummary {
  session_date: string;
  groups: number;
  people: number;
  /** ONAiR に無い数字。手入力（keep_report_inputs） */
  satisfaction: number | null;
  promoted_projects: number;    // 来場者から起票した案件の数
  by_category: Array<{ category: string; groups: number; people: number }>;
  next_session: { date: string; applied_groups: number } | null;
}

/** 主体ごとの表と、統合した全体の表。`gig` は数字があるときだけ。 */
export interface PlByEntity {
  all: MonthlyPlTable;
  gss: MonthlyPlTable;
  gscs: MonthlyPlTable;
  gig?: MonthlyPlTable;
}

/** 会議1回ぶんの「定例報告パック」。週報を確定した時点で凍結する。 */
export interface KeepReportPack {
  version: 1;
  meeting_date: string;                // 'YYYY-MM-DD'
  previous_meeting_date: string | null;
  generated_at: string;                // ISO
  frozen_at: string | null;            // 凍結した時刻。null なら「いまの数字」
  scope: { entity: EntityScope; customer_segment: CustomerSegment | 'all' };
  landing: PlByEntity;                 // 当月 着地（主体別 ＋ 全体）
  forecast: PlByEntity;                // 翌月 着地見込（主体別 ＋ 全体）
  trend: MonthlyTrendPoint[];          // 2024-01〜
  pipeline: { external: PipelineRow[]; samurai: PipelineRow[]; weighted_revenue: number; total_revenue: number };
  project_pages: ProjectPageData[];    // ヨミ表で「資料」に印を付けた案件
  event_reports: ProjectPageData[];    // 前回の会議日以降に本番を終えた案件
  calendars: UtilizationCalendar[];    // 当月・翌月
  inview: InviewSummary | null;
  /** 前回議事録サマリの材料（meeting_minutes） */
  minutes: { decisions: string[]; topics: Array<{ area: string; text: string }>; next_meeting_date: string | null } | null;
}

// ── 資料（デッキ）の構成 ────────────────────────────────────────

/** テンプレの種類。増やすときは docs/design/v4/keep-report.md の構成表も直す。 */
export type SlideTemplateKey =
  | 'cover' | 'checklist' | 'slogan' | 'summary' | 'org' | 'attendance' | 'prev_minutes' | 'todo'
  | 'schedule' | 'kpi_tree' | 'progress_charts' | 'agenda'
  | 'pl_table' | 'pipeline_table' | 'project_page' | 'utilization_calendar' | 'event_report' | 'inview'
  | 'free' | 'next_meeting' | 'appendix' | 'copied';

/** ページに置く部品。`binding` はパックのどこを読むか。 */
export interface SlidePart {
  id: string;
  type: 'table' | 'chart' | 'image' | 'text' | 'kpi' | 'calendar' | 'photos' | 'bullets';
  /** 例: 'landing' / 'forecast' / 'trend.revenue' / 'pipeline.external' / 'project_pages[0]' */
  binding: string | null;
  /** 位置と大きさ（%）。DisplayLayout と同じ考え方（1280×720 の仮想キャンバス） */
  x: number; y: number; w: number; h: number;
  /** 人が上書きした文（binding があっても優先）。写真は Box の file id の並び */
  text_override: string | null;
  /** 部品ごとの小さな設定（例: 表の対象月 'YYYY-MM'、主体、写真の id 一覧） */
  options?: Record<string, unknown>;
}

export interface SlidePage {
  id: string;
  template: SlideTemplateKey;
  title: string;
  /** 自動で組んだページか。false は人が足した／前回から写したページ */
  auto: boolean;
  parts: SlidePart[];
  /** 人が消したページは残して印を付ける（次回の既定に効かせるため） */
  removed: boolean;
  notes: string | null;
  /** 題の書式【カテゴリ｜緊急×重要｜時間】の材料。固定ページは null */
  agenda?: { category: string; priority: string; minutes: number } | null;
}

/** 人の直し1件（keep_deck_edits）。サーバーが保存時に前の版と比べて作る。 */
export interface KeepDeckEdit {
  id: string;
  deck_id: string;
  version: number;
  page_id: string | null;
  part_id: string | null;
  field: string;
  before_value: string | null;
  after_value: string | null;
  kind: 'reorder' | 'remove' | 'add' | 'override' | 'restore';
  note: string | null;
  edited_at: string;
  edited_by: string | null;
}

export interface KeepDeck {
  id: string;
  meeting_date: string;
  pack_id: string | null;              // 読んだパック（凍結版）。凍結前は null（いまの数字で組む）
  version: number;
  pages: SlidePage[];
  /** 出力した pptx の置き場（Box）。出力していなければ null */
  exported: { box_file_id: string; exported_at: string; by: string } | null;
  updated_at: string;
  updated_by: string;
}
