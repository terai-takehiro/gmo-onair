/** ⑥ 受け取った書類（財務）が読むデータの形 */
import type { RichBlock } from '@gmo-onair/shared/src/client-v4/richContent';

export type DocType = 'quote' | 'invoice' | 'order';
export type DocStatus = 'new' | 'reviewing' | 'approved' | 'rejected' | 'processed';

export interface FinanceDoc {
  id: string;
  doc_type: DocType;
  sender: string | null;
  subject: string | null;
  content: string | null;
  /** **税込**（`record_finance_doc` の説明が「金額 (税込・円)」） */
  amount: number | string | null;
  closing_month: string | null;
  payment_due: string | null;
  status: DocStatus;
  received_at: string | null;
  processed_by: string | null;
  processed_at: string | null;
  gls_number: string | null;
  notes: string | null;
  /** `email`（AI が取り込んだ）／`manual`（人が入れた） */
  source: string;
  /** 台帳へ渡した先。**片側だけだと突き合わせられない**（migration 142） */
  linked_kind: 'purchase' | 'sga' | null;
  linked_id: string | null;
  /**
   * AI が組み立てた「読める形」の中身（migration 160）。
   * **`content` を置き換えるものではない** — 古い行は `content` の自由文しか持っていないので、
   * どちらも出す（`RichContent` の `fallback` がその役）。
   */
  details: RichBlock[] | null;
  /** メール本文の全文。切り詰めていない */
  body_text: string | null;
  created_at: string;
  updated_at: string;
}

export const TYPE_LABEL: Record<DocType, string> = {
  quote: '見積書', invoice: '請求書', order: '注文書',
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  new: '受信', reviewing: '確認中', approved: '承認', rejected: '却下', processed: '処理完了',
};

/** 状態の色。**意味で決める**（画面ごとに変えない） */
export const STATUS_TONE: Record<DocStatus, string> = {
  new: 'border-transparent bg-destructive-surface text-destructive',
  reviewing: 'border-transparent bg-warning-surface text-warning',
  approved: 'border-transparent bg-info-surface text-info',
  rejected: 'border-transparent bg-muted text-muted-foreground',
  processed: 'border-transparent bg-success-surface text-success',
};
