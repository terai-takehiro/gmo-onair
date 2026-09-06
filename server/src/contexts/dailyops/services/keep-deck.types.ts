/**
 * 資料の構成（KeepDeck / SlidePage / SlidePart / KeepDeckEdit）の型 — **server 側の写し**。
 *
 * ⚠️ **server は `shared/` を import できません**（`server/tsconfig.json` の `rootDir: "./src"`）。
 * 正は `shared/src/keepReport/types.ts` の「資料（デッキ）の構成」の節で、ここはその写しです。
 * パックの型（KeepReportPack など）は段1の写し `keep-pack.types.ts` を **再輸出**する（写しを3つにしない）。
 * 主体の表示名は `sales/services/project-entity.ts`（Agent A の server 側の実体）から。
 *
 * 形が同じであることは `shared/tests/keepReportDeckParity.test.ts` が、同じ材料（`__fixtures__/keep-pack.sample.json`）を
 * shared と server の関数に通して同じ答えになることで固定しています。
 */
export type {
  BusinessEntity, EntityScope, CustomerSegment, ConfidenceLetter, Judge, BudgetLine, MonthlyPlTable, MonthlyTrendPoint,
  PipelineRow, ProjectPageData, UtilizationCalendar, InviewSummary, PlByEntity, KeepReportPack,
} from './keep-pack.types';
export { BUSINESS_ENTITY_LABELS } from '../../sales/services/project-entity';

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
