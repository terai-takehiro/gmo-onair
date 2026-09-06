/**
 * お金のルール — v4 設定 ⑤
 *
 * ── 会社（entity_code）ごとに1本 ＋ 取引先ごとに例外 ────────────
 *
 * モックの指定どおり（「案件ごとに書き換えず、例外は取引先ごとの設定で持ちます」）。
 * 案件ごとの上書きは持ちません。**2026年10月の事業再編で会社が複数になった
 * ため（migration 288・P2 Round 1）、いまは会社ごとに1本**（`money_rules.id`
 * が `entity_code` と同じ値）。entityCode を省略した呼び出しは
 * `CURRENT_ENTITY_CODE`（今までの唯一の会社ぶん）に落ちるので、
 * 呼び出し側を直していない箇所も今までどおり動く。
 *
 * ── 読むたびに DB を叩かない ────────────────────────────────
 *
 * 支払期日は売上を作るたびに要るので、1 行の設定を毎回 SELECT すると
 * 一覧の N 件ぶん問い合わせが増えます。**保存したときだけ読み直す**形で
 * 会社ごとに覚えておきます（プロセスが 1 つの構成なので、保存 = その会社ぶんの
 * キャッシュを捨てる）。
 */
import { queryOne, queryAll, execute } from '../../../shared/db/connection';
import { setTaxRounding, type TaxRounding } from '../../../shared/services/tax-category.service';
import { dueDateOf, mergeRule, type DueDateRule } from '../../../shared/services/dueDate';
import { holidaysOf } from '../../../shared/services/holidays';
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';
import type { LegalEntityCode } from '../../platform/services/legal-entity.service';

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

/**
 * 会社（`entity_code`）ごとにキャッシュする（2026年10月の事業再編・財務の2社タブ・
 * P2 Round 1。`money_rules` は migration 288 で `id='default'` の1行から
 * `id=entity_code` の複数行に変わった）。
 *
 * ⚠️ **税の丸め方 (`setTaxRounding`) は `CURRENT_ENTITY_CODE` を読んだときだけ反映する。**
 * `tax-category.service.ts` の丸め方は意図的にプロセス全体で1つのグローバル変数
 * （同ファイルのコメント参照——引き回すと渡し忘れた所だけ既定に落ちて食い違うため）。
 * ここを entityCode ごとに毎回差し替えると、**他社の設定画面を開いただけで
 * 同時に処理している別リクエストの税額計算が入れ替わる**（Node は単一プロセス）。
 * いまは売上・仕入・販管費の INSERT が実際に書く entity_code は
 * `CURRENT_ENTITY_CODE` 定数だけ（resolveEntity の結果を書き込むのは案件番号だけ・P1）
 * なので、税計算のグローバルに効かせてよいのも今はそのぶんだけでよい。
 * 複数社が実際に税計算を持つようになったら（P2 Round 2 以降・INSERT 側の
 * entity_code 解決が進んでから）、`roundByRule` の呼び出し側に entity_code を
 * 引き回す設計に本格対応する。
 */
const cache = new Map<LegalEntityCode, MoneyRules>();

export async function getMoneyRules(entityCode: LegalEntityCode = CURRENT_ENTITY_CODE): Promise<MoneyRules> {
  const hit = cache.get(entityCode);
  if (hit) return hit;
  let rules: MoneyRules;
  try {
    const row = await queryOne(`SELECT * FROM money_rules WHERE id = ?`, [entityCode]) as Record<string, unknown> | null;
    if (!row) { rules = FALLBACK; }
    else {
      rules = {
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
    rules = FALLBACK;
  }
  cache.set(entityCode, rules);
  if (entityCode === CURRENT_ENTITY_CODE) setTaxRounding(rules.tax_rounding);
  return rules;
}

/** 保存したら覚え直す。**税の丸め方もここで差し替わりうる**（entityCode 省略時は全社ぶん捨てる） */
export function invalidateMoneyRules(entityCode?: LegalEntityCode): void {
  if (entityCode) cache.delete(entityCode);
  else cache.clear();
}

/** 起動時に一度読む（税の丸め方を反映させるため。今の会社ぶんだけでよい——上のコメント参照） */
export async function primeMoneyRules(): Promise<void> {
  await getMoneyRules();
}

// ───────────────────────────────────────────────────────────
// 支払期日
// ───────────────────────────────────────────────────────────

/**
 * 取引先ごとの例外。列が NULL = 決めていない（会社のルールに従う）。
 *
 * **正は `companies`**（Phase 3-1・取引先マスター一本化）。`customerId` は
 * Phase 3-2a 以降 `companies.id` そのもの（`projects.customer_id` 等のFKが
 * companies を直接指すよう張り替え済み）なので、そのまま引く。顧客としての
 * 例外は `customer_*` 列（仕入先を兼ねる会社の `vendor_*` 列とは別）
 *
 * ⚠️ **`companies.deleted_at` では絞らない**（レビュー指摘・PR #188 P1）。
 * 取引先マスター（`companies`）を削除しても、紐づく顧客としての参照
 * （案件・売上の `customer_id`）はそのまま残り続けるので、ここで
 * `deleted_at IS NULL` を掛けると、**会社だけ消した瞬間にその顧客の
 * 支払例外が消え**、以後の売上作成が例外の効いていない期日で
 * 静かに登録されてしまう
 */
async function customerException(customerId: string | null | undefined): Promise<Partial<DueDateRule> | null> {
  if (!customerId) return null;
  const row = await queryOne(
    `SELECT customer_closing_day AS closing_day, customer_payment_months AS payment_months,
            customer_payment_day AS payment_day
       FROM companies WHERE id = ?`,
    [customerId],
  ) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    closingDay: row.closing_day == null ? undefined : Number(row.closing_day),
    paymentMonths: row.payment_months == null ? undefined : Number(row.payment_months),
    paymentDay: row.payment_day == null ? undefined : Number(row.payment_day),
  };
}

/**
 * 「その日は振り込めないか」を返す関数を作る（支払期日を寄せるのに使う）。
 *
 * ── 何を休業日と見るか ──────────────────────────────────────
 *
 *   ・**土日**（銀行が動かない）
 *   ・**祝日**（`shared/services/holidays.ts` の計算。振替休日・国民の休日を含む）
 *   ・**全社の休業日**（`closed_days` のうち `location_id IS NULL` で
 *     `availability <> 'open'` のもの。夏季休業・年末年始）
 *
 * ⚠️ **拠点ごとの休業日は見ません。** あれは「その部屋が使えない」であって、
 * 会社が休みという意味ではありません（スタジオが1室点検で閉まっている日に
 * 支払期日が動いたら、経理には理由が分かりません）。
 * ⚠️ **祝日の `availability` も見ません** — 祝日の行は「スタジオは稼働する」の
 * 意味で既定が `open` です（migration 176）。銀行はそれとは関係なく閉まります。
 */
async function closedDayChecker(): Promise<(ymd: string) => boolean> {
  const rows = await queryAll(
    `SELECT from_date, to_date FROM closed_days
      WHERE deleted_at IS NULL AND location_id IS NULL AND availability <> 'open'`,
  ) as { from_date: string; to_date: string }[];
  const holidays = new Map<number, Set<string>>();
  const isHoliday = (d: string): boolean => {
    const y = Number(d.slice(0, 4));
    if (!holidays.has(y)) holidays.set(y, new Set(holidaysOf(y).map((h) => h.date)));
    return holidays.get(y)!.has(d);
  };
  return (d: string): boolean => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) return true;
    if (isHoliday(d)) return true;
    return rows.some((r) => d >= r.from_date && d <= r.to_date);
  };
}

export async function ruleForCustomer(
  customerId: string | null | undefined,
  entityCode: LegalEntityCode = CURRENT_ENTITY_CODE,
): Promise<DueDateRule> {
  const r = await getMoneyRules(entityCode);
  const company: DueDateRule = {
    closingDay: r.closing_day, paymentMonths: r.payment_months, paymentDay: r.payment_day,
  };
  return mergeRule(company, await customerException(customerId));
}

/**
 * 計上日から支払期日を出す。**読めない日付のときは null** を返し、
 * 呼び出し側は「入れない」でよい（推測の期日が入ると遅延の一覧が狂う）。
 *
 * `entityCode` はその売上を計上する会社のお金のルールを引くため
 * （省略時は `CURRENT_ENTITY_CODE`＝今まで通りの1社ぶんの設定）。
 */
export async function computeDueDate(
  recognitionDate: string | null | undefined,
  customerId: string | null | undefined,
  entityCode: LegalEntityCode = CURRENT_ENTITY_CODE,
): Promise<string | null> {
  if (!recognitionDate) return null;
  const r = await getMoneyRules(entityCode);
  return dueDateOf(recognitionDate, await ruleForCustomer(customerId, entityCode), {
    shift: r.payment_holiday_shift,
    isClosed: await closedDayChecker(),
  });
}

/**
 * 保存前のルールで期日を試す（設定の画面の下見）。**保存しない。**
 * 休業日の寄せまで含めて出すので、**見せた日と入る日が同じ**になる。
 */
export async function previewDueDate(
  recognitionDate: string,
  rule: DueDateRule,
  shift: MoneyRules['payment_holiday_shift'],
): Promise<string | null> {
  return dueDateOf(recognitionDate, rule, { shift, isClosed: await closedDayChecker() });
}

/**
 * 仕入・販管費の支払日（払う側）。取引先ごとの例外は `companies` の
 * `vendor_*` 列を見る（正はもう `vendors` ではない。Phase 3-1）。
 *
 * **正は `companies`**（Phase 3-1・取引先マスター一本化）。`vendorId` は
 * Phase 3-2b 以降 `companies.id` そのもの（`purchases.vendor_id` 等のFKが
 * companies を直接指すよう張り替え済み）なので、そのまま引く（`customerException`
 * と同じ形・以前は `vendors` テーブルを1段経由していたが不要になった）。
 * `companies.deleted_at` では絞らない理由は `customerException` と同じ
 * （会社だけ削除しても仕入先は残り続けるため）
 */
export async function computeVendorDueDate(
  recognitionDate: string | null | undefined,
  vendorId: string | null | undefined,
  entityCode: LegalEntityCode = CURRENT_ENTITY_CODE,
): Promise<string | null> {
  if (!recognitionDate) return null;
  const r = await getMoneyRules(entityCode);
  let ex: Partial<DueDateRule> | null = null;
  if (vendorId) {
    const row = await queryOne(
      `SELECT vendor_payment_months AS payment_months, vendor_payment_day AS payment_day
         FROM companies WHERE id = ?`,
      [vendorId],
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
  }, ex), { shift: r.payment_holiday_shift, isClosed: await closedDayChecker() });
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

export async function saveMoneyRules(
  patch: Record<string, unknown>,
  userId: string,
  entityCode: LegalEntityCode = CURRENT_ENTITY_CODE,
): Promise<MoneyRules> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of WRITABLE) {
    if (!(col in patch)) continue;
    sets.push(`${col} = ?`);
    params.push(patch[col]);
  }
  if (sets.length > 0) {
    await execute(
      `UPDATE money_rules SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = ?`,
      [...params, userId, entityCode],
    );
    invalidateMoneyRules(entityCode);
  }
  return getMoneyRules(entityCode);
}
