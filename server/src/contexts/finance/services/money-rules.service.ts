/**
 * お金のルール — v4 設定 ⑤
 *
 * ── 会社ぜんぶで1本 ＋ 取引先ごとに例外 ────────────────────
 *
 * モックの指定どおり（「案件ごとに書き換えず、例外は取引先ごとの設定で持ちます」）。
 * 案件ごとの上書きは持ちません。
 *
 * ── 読むたびに DB を叩かない ────────────────────────────────
 *
 * 支払期日は売上を作るたびに要るので、1 行の設定を毎回 SELECT すると
 * 一覧の N 件ぶん問い合わせが増えます。**保存したときだけ読み直す**形で
 * 覚えておきます（プロセスが 1 つの構成なので、保存 = 自分のキャッシュを捨てる）。
 */
import { queryOne, execute } from '../../../shared/db/connection';
import { setTaxRounding, type TaxRounding } from '../../../shared/services/tax-category.service';
import { dueDateOf, mergeRule, type DueDateRule } from '../../../shared/services/dueDate';

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
  tax_rounding: TaxRounding;
  estimate_display: 'excluded' | 'included';
  currency: string;
  amount_unit: number;
  labor_unit: 'person_day' | 'person_hour';
}

/**
 * DB が読めないときの値。**画面に出すためではなく、計算を止めないため。**
 * 設定が読めないから売上が作れない、にはしません。
 */
const FALLBACK: MoneyRules = {
  closing_day: 31, payment_months: 1, payment_day: 31,
  purchase_payment_months: 1, purchase_payment_day: 25,
  payment_holiday_shift: 'before', invoice_issue_rule: 'next_business_day',
  standard_tax_rate: 0.1, tax_unit: 'document', tax_rounding: 'floor',
  estimate_display: 'excluded', currency: 'JPY', amount_unit: 1, labor_unit: 'person_day',
};

let cache: MoneyRules | null = null;

export async function getMoneyRules(): Promise<MoneyRules> {
  if (cache) return cache;
  try {
    const row = await queryOne(`SELECT * FROM money_rules WHERE id = 'default'`) as Record<string, unknown> | null;
    if (!row) { cache = FALLBACK; }
    else {
      cache = {
        closing_day: Number(row.closing_day),
        payment_months: Number(row.payment_months),
        payment_day: Number(row.payment_day),
        purchase_payment_months: Number(row.purchase_payment_months),
        purchase_payment_day: Number(row.purchase_payment_day),
        payment_holiday_shift: row.payment_holiday_shift as MoneyRules['payment_holiday_shift'],
        invoice_issue_rule: row.invoice_issue_rule as MoneyRules['invoice_issue_rule'],
        standard_tax_rate: Number(row.standard_tax_rate),
        tax_unit: row.tax_unit as MoneyRules['tax_unit'],
        tax_rounding: row.tax_rounding as TaxRounding,
        estimate_display: row.estimate_display as MoneyRules['estimate_display'],
        currency: String(row.currency),
        amount_unit: Number(row.amount_unit),
        labor_unit: row.labor_unit as MoneyRules['labor_unit'],
      };
    }
  } catch {
    cache = FALLBACK;
  }
  setTaxRounding(cache.tax_rounding);
  return cache;
}

/** 保存したら覚え直す。**税の丸め方もここで差し替える** */
export function invalidateMoneyRules(): void { cache = null; }

/** 起動時に一度読む（税の丸め方を反映させるため） */
export async function primeMoneyRules(): Promise<void> {
  await getMoneyRules();
}

// ───────────────────────────────────────────────────────────
// 支払期日
// ───────────────────────────────────────────────────────────

/** 取引先ごとの例外。列が NULL = 決めていない（会社のルールに従う） */
async function customerException(customerId: string | null | undefined): Promise<Partial<DueDateRule> | null> {
  if (!customerId) return null;
  const row = await queryOne(
    'SELECT closing_day, payment_months, payment_day FROM customers WHERE id = ?',
    [customerId],
  ) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    closingDay: row.closing_day == null ? undefined : Number(row.closing_day),
    paymentMonths: row.payment_months == null ? undefined : Number(row.payment_months),
    paymentDay: row.payment_day == null ? undefined : Number(row.payment_day),
  };
}

export async function ruleForCustomer(customerId: string | null | undefined): Promise<DueDateRule> {
  const r = await getMoneyRules();
  const company: DueDateRule = {
    closingDay: r.closing_day, paymentMonths: r.payment_months, paymentDay: r.payment_day,
  };
  return mergeRule(company, await customerException(customerId));
}

/**
 * 計上日から支払期日を出す。**読めない日付のときは null** を返し、
 * 呼び出し側は「入れない」でよい（推測の期日が入ると遅延の一覧が狂う）。
 */
export async function computeDueDate(
  recognitionDate: string | null | undefined,
  customerId: string | null | undefined,
): Promise<string | null> {
  if (!recognitionDate) return null;
  return dueDateOf(recognitionDate, await ruleForCustomer(customerId));
}

/** 仕入・販管費の支払日（払う側）。取引先ごとの例外は仕入先の列を見る */
export async function computeVendorDueDate(
  recognitionDate: string | null | undefined,
  vendorId: string | null | undefined,
): Promise<string | null> {
  if (!recognitionDate) return null;
  const r = await getMoneyRules();
  let ex: Partial<DueDateRule> | null = null;
  if (vendorId) {
    const row = await queryOne(
      'SELECT payment_months, payment_day FROM vendors WHERE id = ?', [vendorId],
    ) as Record<string, unknown> | null;
    if (row) {
      ex = {
        paymentMonths: row.payment_months == null ? undefined : Number(row.payment_months),
        paymentDay: row.payment_day == null ? undefined : Number(row.payment_day),
      };
    }
  }
  return dueDateOf(recognitionDate, mergeRule({
    closingDay: r.closing_day,
    paymentMonths: r.purchase_payment_months,
    paymentDay: r.purchase_payment_day,
  }, ex));
}

// ───────────────────────────────────────────────────────────
// 保存
// ───────────────────────────────────────────────────────────

/** 保存してよい列。**ここに無い名前は黙って捨てる**（画面から知らない列を書かせない） */
const WRITABLE = [
  'closing_day', 'payment_months', 'payment_day',
  'purchase_payment_months', 'purchase_payment_day',
  'payment_holiday_shift', 'invoice_issue_rule',
  'standard_tax_rate', 'tax_unit', 'tax_rounding', 'estimate_display',
  'currency', 'amount_unit', 'labor_unit',
] as const;

export async function saveMoneyRules(patch: Record<string, unknown>, userId: string): Promise<MoneyRules> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of WRITABLE) {
    if (!(col in patch)) continue;
    sets.push(`${col} = ?`);
    params.push(patch[col]);
  }
  if (sets.length > 0) {
    await execute(
      `UPDATE money_rules SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = 'default'`,
      [...params, userId],
    );
    invalidateMoneyRules();
  }
  return getMoneyRules();
}
