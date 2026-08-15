/**
 * 隔週キープ資料（イベント実施報告）の型。**一覧とダイアログで共有する**。
 *
 * ⚠️ **`highlights` は無い。** migration 185 で `event_reports.highlights`
 * （よかったこと・次に活かすことの自由行）は K/P/T の表へ畳みました。
 * 型に戻すと、また消えた列を読んで**一覧ごと落ちます**（レビューでの指摘 #83）。
 */
export interface PhotoEntry { id: string; box_file_id: string; caption: string | null; sort_order: number }

export interface Summary {
  total_revenue: number; total_purchase: number; gross_profit: number; gross_margin: number;
}

/**
 * ふりかえりの1行（K/P/T）。**この画面は読むだけ** —
 * 書くのは案件のふりかえりタブ（書いた人・種類・AI の下書きの確認まで扱う）。
 */
export interface KptRow {
  id: string; kind: "keep" | "problem" | "try"; body: string;
  author_name: string | null; ai_generated: boolean; confirmed_at: string | null;
}

export const KPT_LABEL: Record<KptRow["kind"], string> = {
  keep: "続ける", problem: "困った", try: "次に試す",
};

export interface EventReport {
  id: string; project_id: string; headline: string | null; kpt: KptRow[];
  attendees_onsite: number | null; attendees_online: number | null; attendees_note: string | null;
  photos: PhotoEntry[]; report_status: "draft" | "confirmed"; reported_at: string | null;
  project_name?: string; gls_number?: string | null; event_start?: string | null; event_end?: string | null;
  summary?: Summary;
}
