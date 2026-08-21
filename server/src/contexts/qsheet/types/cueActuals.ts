// サーバー側の複製。
//
// server/tsconfig.json の rootDir 制約により、server/src からは
// shared/ を import できない。canonical な定義は shared/src/qsheet/cueActuals.ts。
// 実装行 (コメントを除く) が 1 行でもずれると scripts/check-collab-parity.mjs が
// CI を止める (PAIRS に登録済み)。

/** 進行 (OnAir) が1キューぶん記録するときに送るもの。 */
export interface CueActualInput {
  run_id: string;
  run_started_at: string;   // ISO8601
  section_id: string;       // 必須。CM/VTR/ロール一括は row_id=null で section_id のみ
  row_id: string | null;
  pass_no: number;          // 1 始まり
  cue_index: number | null;
  planned_sec: number | null;
  actual_sec: number;
}

/** GET /qsheet/runs/:documentId が返す1行 (キュー単位)。 */
export interface CueActualRow extends CueActualInput {
  id: string;
  document_id: string;
  recorded_at: string;
  recorded_by: string | null;
}

/** GET /qsheet/runs/:documentId が返す run 単位の要約。 */
export interface RunSummary {
  run_id: string;
  run_started_at: string;
  cue_count: number;
  total_actual_sec: number;
  total_planned_sec: number | null;
}
