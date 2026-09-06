/** ⑥ 受領書類（財務）が読むデータの形 */
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
  /**
   * 出どころ（`email` / `manual`）。
   *
   * ⚠️ **AI の印に使わないこと**（migration 247 で直した）。`source` は
   * どこから来たかであって「誰が入れたか」ではなく、手で足したメールの行にも
   * `email` が入ります。AI かどうかは `is_ai`（サーバーが `ai_outputs` から求める）。
   */
  source: string;
  /**
   * AI（メール取込）が作った行か。サーバーが `ai_outputs`
   * （`kind='finance_doc_intake'`）に記録があるかで返す。
   * 入ってきた情報側は migration 171 でこの形になっており、**書類側だけ
   * 取り残されていた**ので揃えた
   */
  is_ai: boolean;
  /** 登録した人の名前（`created_by` は利用者 id なのでそのままでは読めない） */
  created_by_name: string | null;
  /** 台帳へ渡した先。**片側だけだと突き合わせられない**（migration 142） */
  linked_kind: 'purchase' | 'sga' | null;
  linked_id: string | null;
  /**
   * AI が組み立てた「読める形」の中身（migration 160）。
   * **`content` を置き換えるものではない** — 古い行は `content` の自由文しか持っていないので、
   * どちらも出す（`RichContent` の `fallback` がその役）。
   */
  details: RichBlock[] | null;
  /**
   * メール本文の全文。切り詰めていない。
   *
   * ⚠️ **束の一覧には入っていません**（`has_body_text` だけ来ます）。
   * この画面は15秒ごとに取り直すので、原文まで運ぶと1日中それを繰り返します。
   * 「メールの原文を見る」を開いたときに `GET /dailyops/finance-docs/:id` で取ります。
   */
  body_text: string | null;
  /** 原文があるか（束の一覧はこれだけ返す） */
  has_body_text?: boolean;
  created_at: string;
  updated_at: string;

  // ── migration 281: ひとつづり / 当て先 / 添付 ──────────────
  group_id: string | null;
  group_title: string | null;
  group_key: string | null;
  /**
   * 当て先の案件。**AI は「仮」で置くだけで、決めるのは人**（ご指示）。
   * `project_source` が `ai` のあいだは確かめていない印として扱う。
   */
  project_id: string | null;
  project_source: 'ai' | 'human' | null;
  project_confidence: 'high' | 'medium' | 'low' | null;
  /** なぜその案件を当てたか。**そのまま画面に出す**（人が確かめる材料） */
  project_reason: string | null;
  project_gls_number: string | null;
  project_name: string | null;
  expense_kind: 'purchase' | 'sga' | null;
  expense_kind_source: 'ai' | 'human' | null;
  vendor_name: string | null;
  /** 販管費のとき: 支払サイト（締日から何日後か） */
  payment_terms_days: number | null;
  /** 販管費のとき: 何月処理か（YYYY-MM） */
  processing_month: string | null;
  doc_no: string | null;
  /** 見積の改定回数（1 始まり） */
  revision: number | null;
  attachments?: DocAttachment[];
}

/**
 * メールの添付（BOX の「受領書類（メール）」フォルダ）。
 *
 * ⚠️ **入らなかったものも返ってくる**（`failure_reason` が入る）。
 * 出さないと、**入ったつもりで原本がどこにも無い**状態に誰も気づけない。
 */
export interface DocAttachment {
  id: string;
  doc_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  box_file_id: string | null;
  box_url: string | null;
  stored_at: string | null;
  failure_reason: string | null;
  /**
   * 入らなかった理由の**言葉**（サーバーが付ける）。
   *
   * ⚠️ **画面で理由コードから文言を作らないこと。** サーバー側にも同じ表が要り、
   * 2か所に散ると片方だけ直ります。とくに `NO_GMAIL_SCOPE` は
   * **人が Google 連携をやり直さないと直らない**ので、
   * 「入っていません」だけだと何をすればよいか分かりません。
   */
  failure_label?: string | null;
  created_at: string;
}

/** 束のいまの段（`shared/src/utils/financeDocChain.ts` と同じ語） */
export type ChainStage = 'quote_only' | 'ordered' | 'invoiced' | 'empty';

/**
 * ひとつづり（1つの取引）。**画面はこれを1行として出す。**
 *
 * 1通ずつ並べると「この請求書はどの見積の続きか」が読めず、
 * 経理が毎回メールを探し直すことになる（migration 281 の狙い）。
 */
export interface FinanceDocGroup {
  id: string;
  title: string;
  vendor_name: string | null;
  group_key: string | null;
  expense_kind: 'purchase' | 'sga' | null;
  project_id: string | null;
  project_gls_number: string | null;
  project_name: string | null;
  payment_terms_days: number | null;
  processing_month: string | null;
  created_at: string;
  updated_at: string;
  docs: FinanceDoc[];
  stage: ChainStage;
  /** 払う金額（請求書があればその合計・無ければ生きている見積） */
  amount: number | null;
  /** 台帳へ渡せる段か（見積書だけの束は渡せない） */
  can_handoff: boolean;
  /** 中の書類が全部 登録済/却下 なら片づき */
  settled: boolean;
}

export const STAGE_LABEL: Record<ChainStage, string> = {
  empty: '書類なし', quote_only: '見積書のみ', ordered: '発注済み', invoiced: '請求書あり',
};

/** 段の色。**意味で決める** — 「請求書あり」＝払う期日があるので急ぐ */
export const STAGE_TONE: Record<ChainStage, string> = {
  empty: 'border-transparent bg-muted text-muted-foreground',
  quote_only: 'border-transparent bg-muted text-secondary-foreground',
  ordered: 'border-transparent bg-info-surface text-info',
  invoiced: 'border-transparent bg-warning-surface text-warning',
};

/** 当て先の確からしさ。**AI が当てたものは「確かめてください」と言い切る** */
export const CONFIDENCE_NOTE: Record<'high' | 'medium' | 'low', string> = {
  high: 'GLS 番号が一致しました',
  medium: '名前が1件だけ当たりました（確かめてください）',
  low: '決めきれませんでした',
};

export const TYPE_LABEL: Record<DocType, string> = {
  quote: '見積書', invoice: '請求書', order: '注文書',
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  new: '受信', reviewing: '確認中', approved: '承認', rejected: '却下', processed: '登録済',
};

/** 状態の色。**意味で決める**（画面ごとに変えない） */
export const STATUS_TONE: Record<DocStatus, string> = {
  new: 'border-transparent bg-destructive-surface text-destructive',
  reviewing: 'border-transparent bg-warning-surface text-warning',
  approved: 'border-transparent bg-info-surface text-info',
  rejected: 'border-transparent bg-muted text-muted-foreground',
  processed: 'border-transparent bg-success-surface text-success',
};
