/** ② 請求・入金（財務）が読むデータの形 */

export interface ClosingRow {
  id: string;
  project_id: string;
  project_name: string | null;
  gls_number: string | null;
  /**
   * **按分（グループ請求）だとこれが入る。** 金額はグループ全体のもので、
   * `project_name` は代表の1件でしかない — 印を出さないと満額の請求に見える
   */
  group_id?: string | null;
  group_name?: string | null;
  customer_name: string | null;
  episode_code: string | null;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  invoice_issued: boolean;
  /** 請求書番号 `INV-<年>-<4桁>`。出す前は null（migration 163） */
  invoice_no: string | null;
  inspection_date: string | null;
  paid_date: string | null;
  /** 申込書が揃っていない。**選べない**（請求書を出すときだけ効く） */
  blocked: boolean;
}

export interface ClosingResponse {
  data: {
    month: string;
    /** まだ請求書を出していない */
    issue: ClosingRow[];
    /** 出したが入金が無い */
    collect: ClosingRow[];
    /** 検収日が無い */
    inspect: ClosingRow[];
  };
  counts: {
    issue: number;
    collect: number;
    inspect: number;
    /** 申込書が無くて出せないもの。**「出していない」とは別に数える** */
    blocked: number;
    /** 期日を過ぎた入金待ち */
    overdue: number;
  };
}

export type ClosingTab = 'issue' | 'collect' | 'inspect';
