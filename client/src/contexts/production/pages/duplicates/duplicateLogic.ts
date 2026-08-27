/**
 * ⑤ 重複疑い — 一覧が読む形（画面を持たない部分）
 *
 * `HoldListPage` の `holdLogic.ts` と同じ分け方。
 */

export const DUPLICATE_KEY = ['studio-duplicates'];

export interface DuplicateRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status?: string;
  possible_duplicate_reason: string | null;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  of_id: string | null;
  of_title: string | null;
  of_start_time: string | null;
  of_end_time: string | null;
}
