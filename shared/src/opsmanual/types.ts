// 運営マニュアル — クライアント用の型（docs/design/v4/production-manual.md §5）
//
// ⚠️ サーバーは複製しない。`shared/src/schedule/types.ts` と同じ理由
// （04-schedule-impl.md §3-7）— サーバーは Express の req.body を自前で検証するので、
// 型を共有しても検査が増えない。
//
// 段A（器だけ）の範囲: 冊子の一覧・作成・削除、ページの一覧・追加・削除・並べ替え・
// タイトル/章名の編集。紙面のブロック編集（中身の型）は段B以降で決める。

export type ManualStatus = "draft" | "fixed" | "archived";

/** 一覧の1行・冊子1件（ページを含まない形） */
export interface ManualListItem {
  id: string;
  doc_no: string | null;
  title: string;
  project_id: string | null;
  project_name?: string | null;
  gls_number?: string | null;
  program_id: string | null;
  program_name?: string | null;
  service_date: string | null;
  status: ManualStatus;
  rev: number;
  page_count: number;
  created_by: string | null;
  creator_name?: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * 紙面の中身（ManualBlock）。段Bで決める型で、段Aでは常に空配列。
 * クライアント側は「何か配列」としてだけ扱い、中身の形は決め打ちしない。
 */
export type ManualBlock = unknown;

export interface ManualPage {
  id: string;
  manual_id: string;
  sort_order: number;
  chapter: string | null;
  title: string;
  blocks: ManualBlock[];
  created_at: string;
  updated_at: string;
}

/** 冊子1件の画面（`GET /techops/manuals/:id`）が返す形 */
export interface ManualDetail extends ManualListItem {
  pages: ManualPage[];
}

/** 楽観ロック衝突。`shared/src/schedule/types.ts` の `ConflictError` と同じ形 */
export interface ConflictError {
  code: "CONFLICT";
  message: string;
  current_updated_at: string;
  updated_by_name: string | null;
}
