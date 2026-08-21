// 本番の実尺 (qsheet_cue_actuals) の型。
//
// ⚠️ サーバーは shared/ を import できない (server/tsconfig.json の rootDir 制約)。
// そのため server/src/contexts/qsheet/types/cueActuals.ts に**意図的に複製**している。
// 型定義の本体 (コメントを除く実装行) が 1 行でもずれたら
// scripts/check-collab-parity.mjs の PAIRS で検出して CI を止める。
//
// 設計: docs/design/v4/qsheet-v4-coding/impl/01-cue-actuals-impl.md §5-2

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
