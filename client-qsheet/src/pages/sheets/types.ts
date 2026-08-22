// 進行台本の一覧（/qsheet/sheets）— 型と表示ヘルパー
// 実装設計: docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md §8 PR G
// 旧 DashboardPage.tsx から分割（1ファイルが大きくなりすぎるのを防ぐ・check-file-size）

export interface QsheetDocument {
  id: string;
  title: string;
  status: string;
  broadcast_date: string | null;
  episode_code: string | null;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  /** 番組（マニュアル・案件管理外）。migration 227 で追加 */
  program_id: string | null;
  program_name: string | null;
  creator_name: string | null;
  created_by: string | null;
  share_count?: number;
  /** `data.sections` の件数（jsonb_typeof ガード付き。壊れた行は 0）。サーバーが返す（§6-3） */
  section_count?: number;
  created_at: string;
  updated_at: string;
  data?: {
    meta?: {
      title?: string;
      location?: string;
      broadcastDate?: string;
      broadcastStartTime?: string;
      recordingDate?: string;
      rehearsalDate?: string;
      draftType?: string;
      draftNumber?: number;
    };
  };
}

export interface GlsProject {
  id: string;
  gls_number: string;
  name: string;
  customer_name: string | null;
}

export interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
  broadcast_date: string | null;
  recording_date: string | null;
}

/** `/qsheet/sheets` の絞り込み。サーバーの `scope` クエリと同じ値（documents.routes.ts） */
export type SheetScope = "all" | "mine" | "shared";

export const SHEET_SCOPE_LABEL: Record<SheetScope, string> = {
  all: "すべて",
  mine: "自分が作った",
  shared: "共有された",
};

export type DocMeta = NonNullable<NonNullable<QsheetDocument["data"]>["meta"]>;

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
    return dt.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric", weekday: "short" });
  } catch {
    return d;
  }
}

export function getDraftLabel(meta?: DocMeta): string {
  if (!meta) return "第1稿";
  if (meta.draftType === "準備稿") return "準備稿";
  if (meta.draftType === "決定稿") return "決定稿";
  return `第${meta.draftNumber || 1}稿`;
}

export function getDraftColor(meta?: DocMeta): string {
  if (!meta) return "bg-muted text-muted-foreground";
  if (meta.draftType === "決定稿")
    return "bg-success/10 text-success ring-1 ring-success/30";
  if (meta.draftType === "準備稿")
    return "bg-warning/10 text-warning ring-1 ring-warning/30";
  return "bg-primary/10 text-primary ring-1 ring-primary/30";
}
