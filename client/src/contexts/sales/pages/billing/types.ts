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
  /** 検収日。**フラグではなく日付**。入っていれば検収済み */
  inspection_date: string | null;
  /** 入金日。同上 */
  paid_date: string | null;
  project_name: string;
  gls_number: string | null;
  customer_name: string | null;
  episode_code: string | null;
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
