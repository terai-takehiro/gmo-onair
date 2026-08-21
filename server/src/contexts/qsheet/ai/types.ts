/**
 * 制作資料 v4 AI 提案 — サーバー側の型（段7 / 04-a）
 *
 * ⚠️ **サーバーは `shared/`（ルートの `@gmo-onair/shared`）を import できない**
 * （`server/tsconfig.json` の `rootDir: "./src"`）。クライアント側の型
 * （`shared/src/qsheetAi/types.ts`。段8で作る）とは意図的に別に持つ。
 * 「同じ形」を保証するのは往復テスト（`shared/tests/qsheetAiRoundTrip.test.ts`）。
 */
import type { CorrectionType, CorrectionInput } from '../../../shared/services/ai-output.service';

export type { CorrectionType, CorrectionInput };

/** `qsheet_ai_proposals.state` */
export type ProposalState = 'open' | 'applied' | 'discarded' | 'failed';

/** `qsheet_ai_proposals.settled_reason` */
export type SettledReason = 'on_air' | 'broadcast_date_passed' | 'timeout' | 'manual';

/** `qsheet_ai_proposals` の DB 行（このモジュールで読む範囲だけ） */
export interface ProposalRow {
  id: string;
  kind: string;
  schedule_id: string | null;
  document_id: string | null;
  project_id: string | null;
  proposal: unknown;
  context: Record<string, unknown>;
  ai_output_id: string | null;
  model: string | null;
  prompt_version: string | null;
  state: ProposalState;
  error_message: string | null;
  discard_reason: string | null;
  expires_at: string;
  source: 'server' | 'mcp';
  applied_at: string | null;
  applied_by: string | null;
  applied_payload: unknown;
  applied_ids: AppliedIds | null;
  settled_at: string | null;
  settled_final_at: string | null;
  settle_stage: 'early' | 'final' | null;
  settled_reason: SettledReason | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 取り込みで採番された id（AI が作った要素だけを後で見分ける鍵。§4-2） */
export interface AppliedIds {
  sections: string[];
  rows: string[];
  items: string[];
  columns: string[];
}

/** `POST /apply` の body（§10-2） */
export interface ApplyRequestBody {
  applied_payload: unknown;
  applied_ids: Partial<AppliedIds> | null | undefined;
  rejected_keys?: string[];
}

/**
 * 取り込んだ内容そのもの。**`data` と同じ表現**（尺は文字列・本文は html）で持つ。
 * `rows` / `items` の形は kind によって変わるので `unknown[]` のまま保持し、
 * 比較する側（`comparable.ts`）で正規化する。
 */
export interface AppliedPayload {
  sections?: unknown[];
  rows?: unknown[];
  items?: unknown[];
  columns?: unknown[];
  [k: string]: unknown;
}

/** `toComparableRow` が寄せる先（差分を取る前の共通表現。§4-4） */
export interface ComparableRow {
  row_id: string;
  label: string;
  /** 秒（数値）。`"1:30"` も `90` も同じ数に寄せる */
  duration: number;
  /** scenario の entries[0].name（話者） */
  name: string;
  /** scenario の entries[0].html（本文・平文） */
  html: string;
}

/** `toComparableItem`（①枠用）が寄せる先 */
export interface ComparableItem {
  key: string;
  title: string;
  kind: string;
  start_min: number;
  end_min: number;
  assignee: string;
  note: string;
}
