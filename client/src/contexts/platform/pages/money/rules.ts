/**
 * お金のルールの選択肢（v4 設定 ⑤）
 *
 * ── 自由入力にしない ────────────────────────────────────────
 *
 * 締め日・支払サイトは**実際に使われる値が数種類**しかありません。
 * 自由入力にすると「31」と「末」と「月末」が混ざり、どれが正か分からなくなります。
 * 選ばせれば保存される値は必ず 1〜31 の数字になります。
 */

export interface MoneyRules {
  closing_day: number;
  payment_months: number;
  payment_day: number;
  purchase_payment_months: number;
  purchase_payment_day: number;
  payment_holiday_shift: 'before' | 'after' | 'none';
  invoice_issue_rule: 'closing_day' | 'next_business_day' | 'manual';
  standard_tax_rate: number;
  tax_unit: 'document' | 'item';
  tax_rounding: 'floor' | 'round' | 'ceil';
  estimate_display: 'excluded' | 'included';
  currency: string;
  amount_unit: number;
  labor_unit: 'person_day' | 'person_hour';
}

export interface DiscountLimitRow {
  role_id: string;
  role_name: string;
  max_rate: string | number | null;
  max_amount: string | number | null;
  approver_role_id: string | null;
  approver_name: string | null;
  can_estimate: boolean | null;
}

export interface MoneyResponse {
  rules: MoneyRules;
  describe: { payment: string; purchase: string };
  limits: DiscountLimitRow[];
}

export type Choice = { value: string | number; label: string };

/** 1〜28 と末日。**29・30 は作らない** — 2月に無い日を選ばせると毎年ずれる */
export const DAY_CHOICES: Choice[] = [
  ...[5, 10, 15, 20, 25].map((d) => ({ value: d, label: `${d}日` })),
  { value: 31, label: '末日' },
];

export const MONTH_CHOICES: Choice[] = [
  { value: 0, label: '当月' },
  { value: 1, label: '翌月' },
  { value: 2, label: '翌々月' },
  { value: 3, label: '3か月後' },
];

export const ROUNDING_CHOICES: Choice[] = [
  { value: 'floor', label: '切り捨て' },
  { value: 'round', label: '四捨五入' },
  { value: 'ceil', label: '切り上げ' },
];

export const TAX_UNIT_CHOICES: Choice[] = [
  { value: 'document', label: '請求書ごと' },
  { value: 'item', label: '明細ごと' },
];

export const DISPLAY_CHOICES: Choice[] = [
  { value: 'excluded', label: '税抜で表示' },
  { value: 'included', label: '税込で表示' },
];

export const ISSUE_CHOICES: Choice[] = [
  { value: 'closing_day', label: '締め日' },
  { value: 'next_business_day', label: '締めの翌営業日' },
  { value: 'manual', label: '決めない（手で出す）' },
];

export const HOLIDAY_SHIFT_CHOICES: Choice[] = [
  { value: 'before', label: '前の営業日へ' },
  { value: 'after', label: '次の営業日へ' },
  { value: 'none', label: '寄せない' },
];

export const LABOR_UNIT_CHOICES: Choice[] = [
  { value: 'person_day', label: '1 人日（半日は 0.5）' },
  { value: 'person_hour', label: '1 人時' },
];

export const TAX_RATE_CHOICES: Choice[] = [
  { value: 0.1, label: '10 ％（標準）' },
  { value: 0.08, label: '8 ％' },
];
