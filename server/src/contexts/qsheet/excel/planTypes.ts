/**
 * 取込の適用操作リスト（実装設計 03-excel.md §8-1 の PlanOp）。
 *
 * ⚠️ サーバーは `qsheet_documents.data` を直接書かない（collab の persist に上書きされる・
 * id の安全網がクライアントにしかない）。ここが返すのは**完全な `data`ではなく操作リスト**。
 * 適用は client-techops 側の `applyOps(prev, ops)` が担う（§8-1 の P0 地雷対策）。
 */
export type PlanOp =
  | { op: 'update_section'; sectionId: string; set: Record<string, unknown> }
  | { op: 'add_section'; afterSectionId: string | null; section: Record<string, unknown> }
  | { op: 'trash_section'; sectionId: string }
  | { op: 'update_row'; sectionId: string; rowId: string; set: Record<string, unknown> }
  | { op: 'add_row'; sectionId: string; afterRowId: string | null; row: Record<string, unknown> }
  | { op: 'trash_row'; sectionId: string; rowId: string }
  | { op: 'set_extra'; key: 'masters' | 'ledScenes' | 'stageTemplates' | 'meta'; value: unknown };

export type ImportMode = 'merge' | 'append';

export interface PlanEntry {
  sheetRow: number;
  kind: string;
  id: string | null;
  action: 'add' | 'update' | 'skip' | 'error';
  ref: string;
  messages: string[];
}

export interface PlanSummary {
  sections: { add: number; update: number };
  rows: { add: number; update: number };
  masters: { video: number; audio: number; telop: number; persons: number };
  ledScenes: { add: number };
  errors: number;
}

export interface PlanResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ops: PlanOp[];
  summary: PlanSummary;
  entries: PlanEntry[];
  /** 適用が成功したあと `PATCH /documents/:id/meta` に渡す値（§7-1）。変更が無いキーは省く。 */
  metaPatch: Record<string, string>;
}
