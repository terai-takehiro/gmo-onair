// スケジュール表の「横串」(列をまたぐ項目 = Excel のセル結合) — 表示位置の決め方。
//
// migration 280 の `qsheet_schedule_items.span_cols` を、画面・書き出しが同じ規則で読むための小さな層。
//   1     … 自分の列だけ（今までどおり）
//   N>=2  … 表示順で自分の列から右へ N 列ぶん
//   0     … 全列（列を足しても減らしても表全体。数ではなく意味で持つ）
//
// ⚠️ サーバー側（Excel 書き出し）は `server/src/` の外を import できないため、
// 同じ規則を `schedule-workbook.ts` に短く書き写してある（`ITEM_KIND_DEFS` と同じ事情）。
// 規則を変えるときは必ず両方直すこと。

/** span_cols = 0 は「全列」 */
export const SPAN_ALL = 0;

export interface SpanPlacement {
  /** 覆い始める列の位置（表示順の 0 起点） */
  startIndex: number;
  /** 覆う列数（1 以上・表の列数を超えない） */
  count: number;
}

/** その項目が横串（自分の列だけではない）かどうか */
export function isSpanItem(spanCols: number | null | undefined): boolean {
  const v = spanCols ?? 1;
  return v === SPAN_ALL || v > 1;
}

/**
 * 表示順で `columnIndex` 番目の列に置かれた項目が、実際に覆う範囲。
 * 右に列が足りないときは、ある所までに詰める（はみ出して描かない）。
 * 列が 0 本、または列が見つからない（columnIndex < 0）ときは null。
 */
export function spanPlacement(spanCols: number | null | undefined, columnIndex: number, columnCount: number): SpanPlacement | null {
  if (columnCount <= 0) return null;
  const v = spanCols ?? 1;
  if (v === SPAN_ALL) return { startIndex: 0, count: columnCount };
  if (columnIndex < 0 || columnIndex >= columnCount) return null;
  const want = Math.max(1, Math.floor(v));
  return { startIndex: columnIndex, count: Math.min(want, columnCount - columnIndex) };
}

/** 「全列」「3列」のような表示用の短い文言 */
export function spanLabel(spanCols: number | null | undefined): string {
  const v = spanCols ?? 1;
  if (v === SPAN_ALL) return "全列";
  if (v <= 1) return "この列だけ";
  return `${v}列`;
}
