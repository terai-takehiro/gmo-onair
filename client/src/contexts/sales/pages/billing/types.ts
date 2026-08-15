/** `GET /billing/estimates` の1行 */
export interface BillingEstimate {
  id: string;
  project_id: string;
  group_id: string;
  version: number;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  subtotal: number | string;
  discount: number | string;
  sent_at: string | null;
  valid_until: string | null;
  project_name: string;
  gls_number: string | null;
  customer_name: string | null;
  created_by_name: string | null;
  /** 値引きの承認。`pending` の間は送れない（お金のルール ⑤） */
  approval_state?: 'none' | 'pending' | 'approved' | null;
  /** いま見ている人が承認できるか。**サーバーが決める**（押して 403 にしない） */
  can_approve?: boolean;
  /** 承認者に決められているか（編集権限は見ない）。できない理由を名指しするために使う */
  is_approver?: boolean;
}

/** `GET /billing/invoices` の1行 */
export interface BillingInvoice {
  id: string;
  project_id: string;
  episode_id: string | null;
  subtitle: string | null;
  amount: number | string;
  billing_date: string | null;
  payment_due_date: string | null;
  invoice_issued: boolean | number | null;
  /**
   * 請求書番号（出したときに採る・migration 163）。**サーバーは前から返しています**が、
   * 型に無かったので画面から読めませんでした（レビューでの指摘 #61 で必要になった）。
   */
  invoice_no: string | null;
  /** 検収日。**フラグではなく日付**。入っていれば検収済み */
  inspection_date: string | null;
  /** 入金日。同上 */
  paid_date: string | null;
  project_name: string;
  gls_number: string | null;
  customer_name: string | null;
  episode_code: string | null;
  /**
   * **按分（グループ請求）だとこれが入る。** 金額はグループ全体のもので、
   * `project_name` は代表の1件でしかない — 印を出さないと満額の請求に見える
   */
  group_id?: string | null;
  group_name?: string | null;
  assigned_to_name: string | null;
}

export const ESTIMATE_STATUS_LABEL: Record<string, string> = {
  draft: '作成中',
  sent: '提出済',
  accepted: '受注',
  rejected: '失注',
};

/** 生のパレットは使わない。状態の色トークンから選ぶ */
export const ESTIMATE_STATUS_TONE: Record<string, string> = {
  draft: 'border-transparent bg-muted text-muted-foreground',
  sent: 'border-transparent bg-primary-surface text-primary',
  accepted: 'border-transparent bg-success-surface text-success',
  rejected: 'border-transparent bg-muted text-muted-foreground',
};
