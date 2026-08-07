/**
 * 売上ダイアログの初期値の決め方（③ 売上）
 *
 * **画面を持たない部分**なのでここに出してあります。
 * 「案件を選んだら計上月・請求日・入金予定日をこう入れる」は業務の決めごとで、
 * ダイアログの描画とは別物です。
 *
 * ── 末日が土日祝なら前営業日にする ──────────────────────────
 *
 * 請求日・支払期日をそのまま月末にすると、**土日祝に着金する前提の日付**になり、
 * 消込のときに1〜3日ずれます（v2.8.103 で入れた決め）。
 */
import { localDateStr } from '@/lib/format';
import { previousBusinessDay } from '@gmo-onair/shared/src/utils/businessDays';
import type { ProjectOption, RevenueItem, RevenueRow } from './types';

export interface RevenueDefaults {
  amount?: number;
  recognitionMonth?: string;
  billingDate?: string;
  paymentDueDate?: string;
}

/** 案件を選んだときの初期値。**直しに来たときは使わない**（開いた瞬間に日付が変わると気づけない） */
export function defaultsFromProject(project: ProjectOption): RevenueDefaults {
  const out: RevenueDefaults = {};
  if (project.expected_amount) out.amount = project.expected_amount;
  const endDate = project.event_end || undefined;
  if (!endDate) return out;
  const [ey, em] = endDate.split('-').map(Number);
  if (!ey || !em) return out;
  out.recognitionMonth = `${ey}-${String(em).padStart(2, '0')}`;
  out.billingDate = localDateStr(previousBusinessDay(new Date(ey, em, 0)));
  out.paymentDueDate = localDateStr(previousBusinessDay(new Date(ey, em + 1, 0)));
  return out;
}

export interface RevenueFormValues {
  amount: number;
  taxCategory: string;
  recognitionMonth: string | null;
  billingDate: string | null;
  paymentDueDate: string | null;
  notes: string;
  isAdvancePayment: boolean;
  invoiceIssued: boolean;
  items: RevenueItem[] | null;
}

/**
 * 既に売上がある案件を開いたときの値。
 *
 * **明細が空なら `null` を返す** — 空配列で上書きすると、
 * 明細のある売上を直したときに全部消えます（実際に起きた事故）。
 */
export function formFromRevenue(row: RevenueRow): RevenueFormValues {
  return {
    amount: row.amount || 0,
    taxCategory: row.tax_category || 'tax10',
    recognitionMonth: row.recognition_date ? row.recognition_date.slice(0, 7) : null,
    billingDate: row.billing_date ? row.billing_date.slice(0, 10) : null,
    paymentDueDate: row.payment_due_date ? row.payment_due_date.slice(0, 10) : null,
    notes: row.notes || '',
    isAdvancePayment: !!row.is_advance_payment,
    invoiceIssued: !!row.invoice_issued,
    items: Array.isArray(row.items) && row.items.length > 0
      ? row.items.map((it) => ({
        description: it.description || '',
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        amount: it.amount || 0,
        pricing_item_id: it.pricing_item_id,
        period_start: it.period_start || null,
        period_end: it.period_end || null,
        item_notes: it.item_notes || null,
        category: it.category || null,
      }))
      : null,
  };
}
