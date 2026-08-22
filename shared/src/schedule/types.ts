// スケジュール表 — クライアント用の型（02-schedule.md §8-1）
//
// ⚠️ サーバーは複製しない。サーバーは Express の req.body を自前で検証するので、
// 型を共有しても検査が増えない（04-schedule-impl.md §3-7）。
import type { ItemKind, ColGroup } from "./kinds";

export type ScheduleStatus = "draft" | "fixed" | "archived";

export interface Schedule {
  id: string;
  title: string;
  doc_no: string | null;
  service_date: string; // "YYYY-MM-DD"
  location_id: string | null;
  location_name?: string | null;
  project_id: string | null;
  project_name?: string | null;
  gls_number?: string | null;
  episode_id: string | null;
  view_start_min: number;
  view_end_min: number;
  slot_min: number;
  status: ScheduleStatus;
  notes: string | null;
  created_by: string | null;
  creator_name?: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  share_count?: number;
}

export interface ScheduleColumn {
  id: string;
  schedule_id: string;
  col_group: ColGroup;
  label: string;
  room_id: string | null;
  room_name?: string | null;
  color: string | null;
  width_px: number;
  sort_order: number;
  source_template_id: string | null;
  source_template_col_id: string | null;
  updated_at: string;
}

export interface ScheduleItem {
  id: string;
  schedule_id: string;
  column_id: string;
  title: string;
  kind: ItemKind;
  start_min: number;
  end_min: number;
  assignee: string | null;
  note: string | null;
  qsheet_document_id: string | null;
  /** id はあるが JOIN が外れた＝台本が消されている */
  link_broken: boolean;
  source_template_id: string | null;
  source_template_item_id: string | null;
  updated_at: string;
}

export interface ScheduleDetail extends Schedule {
  columns: ScheduleColumn[];
  items: ScheduleItem[];
}

export interface ConflictError {
  code: "CONFLICT";
  message: string;
  current_updated_at: string;
  updated_by_name: string | null;
}

// ============================================================
// ひな形
// ============================================================
export type TemplateAnchor = "day" | "onair";

export interface ScheduleTemplateColumn {
  id: string;
  template_id: string;
  col_group: ColGroup;
  label: string;
  room_id: string | null;
  color: string | null;
  width_px: number;
  sort_order: number;
}

export interface ScheduleTemplateItem {
  id: string;
  template_id: string;
  column_id: string;
  title: string;
  kind: ItemKind;
  anchor: TemplateAnchor;
  offset_min: number;
  duration_min: number;
  is_required: boolean;
  sort_order: number;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  location_id: string | null;
  is_system: boolean;
  sort_order: number;
  columns: ScheduleTemplateColumn[];
  items: ScheduleTemplateItem[];
}

export interface ApplyPreviewColumn {
  col: ScheduleTemplateColumn;
  already_present: boolean;
}

export interface ApplyPreviewItem {
  item: ScheduleTemplateItem;
  /** 分オフセット。解決できなければ null（落とさず赤字で見せる） */
  start_min: number | null;
  end_min: number | null;
  already_applied: boolean;
  checked_by_default: boolean;
}

export interface ApplyPreview {
  columns: ApplyPreviewColumn[];
  items: ApplyPreviewItem[];
  /** true なら onair_start_min が必須（適用ボタンの前に画面で止める） */
  requires_onair_start: boolean;
}

// ============================================================
// ブレイクダウン（数だけ。判定式は持たない）
// ============================================================
export interface ItemBreakdown {
  item_id: string;
  column_id: string;
  title: string;
  qsheet_document_id: string | null;
  link_broken: boolean;
  section_count: number;
  row_count: number;
  rows_with_duration: number;
  rows_with_scenario: number;
  frame_min: number;
  doc_total_sec: number | null;
  gap_min: number | null;
}

// ============================================================
// 進行表（逆引き）— 返す型を必要最小限に狭める（06 §6-2）
// ⚠️ ScheduleItem を継承しない。assignee / note / kind / source_template_* は持たない
// ============================================================
export interface ScheduleItemRef {
  scheduleId: string;
  itemId: string;
  serviceDate: string;
  columnLabel: string;
  startMin: number;
  endMin: number;
  title: string;
}
