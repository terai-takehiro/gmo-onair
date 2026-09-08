/**
 * 隔週キープ（業績報告）の「定例報告パック」と「資料の構成」の型。
 *
 * ── なぜ shared に置くか ──────────────────────────────────────
 * サーバーが作り（`server/src/contexts/dailyops/services/keep-pack.service.ts`）、
 * 日常業務の画面・PowerPoint 出力・Slack 定例投稿・MCP（`get_keep_report_pack`）が
 * **同じ形を読む**ため。片方だけ直すと資料と画面の数字が食い違う。
 *
 * 設計の正は docs/design/v4/keep-report.md。ここは型だけ（server 側の写しは `keep-pack.types.ts`・
 * `shared/tests/keepReportCalc.test.ts` が鍵の名前を突き合わせる）。
 *
 * ── 数字の約束 ────────────────────────────────────────────────
 * - 金額は **円** の整数で持つ。千円・万円に丸めるのは表示側（`manYen` と同じ考え）
 * - 比率は 0〜100 の数値（%）。null は「目標が無い」
 * - 判定・比率・差は**サーバーが計算**する。画面や pptx で計算しない
 *   （8/13 の資料で、手計算の写し間違いがそのまま会議に出た）
 */

/**
 * 計上会社（2026年10月の事業再編・docs/reorg-2026-10-plan.md §4.1〜§4.4）。
 * 売上・費用をどの会社の帳簿に載せるかの区分で、案件・帳簿の行の `entity_code` 列の値。
 *
 * `server/src/contexts/platform/services/legal-entity.service.ts` の `LegalEntityCode` と
 * **同じ3文字**（`legal_entities.code`・案件番号の prefix `SCS-0001` と同じ文字列）。
 *   SCS … GMOサムライコンテンツスタジオ（グループ外のお客様の案件）
 *   GSS … GMOサムライスタジオ（旧 GMOグローバルスタジオ。グループ内のお客様の案件）
 *   GMO … GMOインターネットグループ本体（旧 GLS-B のプロジェクト。コストセンター）
 * 決め方「グループ外→SCS／グループ内→GSS／プロジェクト→GMO」は server の
 * `sales/services/entity-resolution.service.ts` が持つ（shared には写しを置かない）。
 * `org_transition.state = 'off'` のあいだはこの規則は効かず、既存の行はすべて GSS。
 */
export type BusinessEntity = 'SCS' | 'GSS' | 'GMO';
export const BUSINESS_ENTITY_LABELS: Record<BusinessEntity, string> = {
  SCS: 'GMOサムライコンテンツスタジオ',
  GSS: 'GMOサムライスタジオ',
  GMO: 'GMOインターネットグループ',
};
/** 絞り込みの値。`all` は計上会社の合計（統合）。 */
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
  /** 見通しに含めた「まだ確定していない」売上（`status='estimate'` の売上・案件ごとの合計）。資料の注記の材料 */
  unconfirmed: Array<{ project_id: string; project_name: string; amount: number }>;
  /**
   * その月に本番があるのに売上（確定・見積）が 1 件も無い案件。金額は 最新の見積 → 想定金額 → 0。
   * **表の数字には入っていない**（売上の行が無いので確度加味の対象にならない）。人が登録し忘れに気づくための注意
   */
  unregistered: Array<{ project_id: string; project_name: string; amount: number }>;
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
  /** 案件の計上会社（`projects.entity_code`。切替前はすべて GSS） */
  entity_code: BusinessEntity;
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
  /** 折り込む前の実際の分類数。`by_category` は表示用に MAX_CATEGORIES 件まで畳んであるため、
   * その `.length` を「分類数」として出すと畳んだ日から実数より少なく出る（Codex 指摘） */
  category_count: number;
  by_category: Array<{ category: string; groups: number; people: number }>;
  next_session: { date: string; applied_groups: number } | null;
}

/**
 * 計上会社ごとの表と、統合した全体の表。鍵は `entity_code` そのもの。
 * GSS ＝ グループ内のお客様の案件、SCS ＝ グループ外。`GMO`（グループ本体のコストセンター）は数字があるときだけ。
 */
export interface PlByEntity {
  all: MonthlyPlTable;
  SCS: MonthlyPlTable;
  GSS: MonthlyPlTable;
  GMO?: MonthlyPlTable;
}

/** 会議1回ぶんの「定例報告パック」。週報を確定した時点で凍結する。 */
export interface KeepReportPack {
  version: 1;
  meeting_date: string;                // 'YYYY-MM-DD'
  previous_meeting_date: string | null;
  generated_at: string;                // ISO
  frozen_at: string | null;            // 凍結した時刻。null なら「いまの数字」
  /** 絞り込み。`entity` の値は計上会社の `entity_code`（SCS / GSS / GMO）か `all` */
  scope: { entity: EntityScope; customer_segment: CustomerSegment | 'all' };
  landing: PlByEntity;                 // 当月 着地（計上会社別 ＋ 全体）
  forecast: PlByEntity;                // 翌月 着地見込（計上会社別 ＋ 全体）
  trend: MonthlyTrendPoint[];          // 2024-01〜
  pipeline: { external: PipelineRow[]; samurai: PipelineRow[]; weighted_revenue: number; total_revenue: number };
  project_pages: ProjectPageData[];    // ヨミ表で「資料」に印を付けた案件
  event_reports: ProjectPageData[];    // 前回の会議日以降に本番を終えた案件
  calendars: UtilizationCalendar[];    // 当月・翌月
  inview: InviewSummary | null;
  /** 前回議事録サマリの材料（meeting_minutes） */
  minutes: { decisions: string[]; topics: Array<{ area: string; text: string }>; next_meeting_date: string | null } | null;
}

// ── 設定・手入力 ────────────────────────────────────────────────

/** 稼働率の数え方（keep_settings.key = 'utilization'）。既定はメンテナンス以外を全部数える（仮押さえも数える）。 */
export interface UtilizationSettings {
  /** 数える予定の種別（studio_bookings.booking_type）。既定: performance, rehearsal, hold, tour, internal, consultation, setup, other */
  counted_types: string[];
  /** 土曜を営業日に含めるか（既定 false。日祝は常に除く） */
  count_saturday: boolean;
}
export const DEFAULT_UTILIZATION_SETTINGS: UtilizationSettings = {
  counted_types: ['performance', 'rehearsal', 'hold', 'tour', 'internal', 'consultation', 'setup', 'other'],
  count_saturday: false,
};

/** 計上会社ごとの月次予算（円・`monthly_budgets` の `(entity_code, year_month)`）。null は未登録。 */
export interface MonthlyBudget {
  year_month: string;
  entity_code: BusinessEntity;
  revenue: number | null;
  cogs_fixed: number | null;
  cogs_variable: number | null;
  sga: number | null;
  operating_profit: number | null;
  updated_at?: string | null;
}

/** ONAiR に無い数字の手入力（keep_report_inputs）。会議日 × key。 */
export type KeepInputKey = 'inview_satisfaction' | 'attendance' | 'web_kpi' | 'note';
export interface KeepInput {
  meeting_date: string;
  key: KeepInputKey;
  value: Record<string, unknown>;
  updated_at?: string | null;
  updated_by?: string | null;
}

// ── 資料（デッキ）の構成 ────────────────────────────────────────

/** テンプレの種類。増やすときは docs/design/v4/keep-report.md の構成表も直す。 */
export type SlideTemplateKey =
  | 'cover' | 'checklist' | 'slogan' | 'summary' | 'org' | 'attendance' | 'prev_minutes' | 'todo'
  | 'schedule' | 'kpi_tree' | 'progress_charts' | 'agenda'
  | 'pl_table' | 'pipeline_table' | 'project_page' | 'utilization_calendar' | 'event_report' | 'inview'
  | 'free' | 'next_meeting' | 'appendix' | 'closing' | 'copied';

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
  /** 部品ごとの小さな設定（例: 表の対象月 'YYYY-MM'、計上会社（`entity`: all / SCS / GSS / GMO / by_entity）、写真の id 一覧、人が位置を直した印 `moved`） */
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
  /** 出力した pptx の置き場（Box）と、その pptx を作った版・読んだ凍結パック（凍結前の数字なら null）。出力していなければ null。`version` が今の版より小さければ出力後に直している */
  exported: { box_file_id: string; exported_at: string; by: string; version: number | null; pack_id: string | null } | null;
  updated_at: string;
  updated_by: string;
}
