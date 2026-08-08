/**
 * 税区分を1か所で決める (v3.1.5)
 *
 * ── なぜ1か所に寄せるか ──────────────────────────────
 *
 * 税枝番 (billing_key の末尾) を出す式が**4か所に散っていて、それぞれ違っていた**:
 *   - billing-key.service    … tax8→2 / それ以外→1 (**非課税も 1 になっていた**)
 *   - project.service        … tax8→2 / exempt→0 / それ以外→1
 *   - project-groups.routes  … tax8→2 / exempt→0 / それ以外→1
 *   - revenues.routes        … tax8→2 / exempt→0 / それ以外→1
 * 同じ非課税の売上が、作った入口によって `...-1` と `...-0` に分かれる。
 * billing_key は請求キーで PDF のファイル名にもなるので、入口ごとに違う値が出るのは困る。
 *
 * ── 非課税 (exempt) と不課税 (nontax) は別物 ────────────
 *
 *  - 非課税: 消費税の対象だが法令で課税しない取引 (土地の貸付・利息・行政手数料など)
 *  - 不課税: そもそも消費税の対象外 (給与・寄付・配当・国外取引など)
 *
 * どちらも税額は 0 円なので**金額の計算は同じ**だが、帳簿と申告では区別する。
 * 片方に寄せて保存すると後から分けられないので、列の値としても分けている
 * (CHECK 制約は migration 156 で `nontax` を許可した)。
 *
 * 画面側の写しは `shared/src/enums.ts` と `client/src/types/index.ts`
 * (この製品は server が shared を import しない構成)。**3か所の値を揃えること**。
 */

/** 消費税率。未知の値は 10% として扱う (既存データに合わせる) */
const TAX_RATES: Record<string, number> = {
  tax10: 0.1,
  tax8: 0.08,
  exempt: 0,
  nontax: 0,
};

/** 保存してよい税区分 (DB の CHECK 制約と同じ集合) */
export const TAX_CATEGORIES = ['tax10', 'tax8', 'exempt', 'nontax'] as const;
export type TaxCategoryValue = typeof TAX_CATEGORIES[number];

/** 帳票に刷る税率の表記。非課税と不課税は税額 0 円だが**別の区分**なので分けて出す */
export const TAX_RATE_LABELS: Record<TaxCategoryValue, string> = {
  tax10: '10%',
  tax8: '8%',
  exempt: '非課税',
  nontax: '不課税',
};

/** 税率 (0〜1)。未知の値は 10% */
export function taxRateOf(taxCategory: string | null | undefined): number {
  return TAX_RATES[String(taxCategory ?? '')] ?? TAX_RATES.tax10;
}

/** 知らない値・空を既定 (10%) に寄せる。CHECK 制約違反で 500 を返さないための入口 */
export function normalizeTaxCategory(taxCategory: unknown): TaxCategoryValue {
  const v = String(taxCategory ?? '');
  return (TAX_CATEGORIES as readonly string[]).includes(v) ? (v as TaxCategoryValue) : 'tax10';
}

/**
 * billing_key の末尾に付ける税枝番。
 * 1桁で保つ (既存の billing_key は `-\d$` で末尾を差し替えている箇所がある)。
 */
export function taxBillingSuffix(taxCategory: string | null | undefined): string {
  switch (normalizeTaxCategory(taxCategory)) {
    case 'tax8': return '2';
    case 'exempt': return '0';
    case 'nontax': return '3';
    default: return '1';
  }
}

// ───────────────────────────────────────────────────────────
// 端数の扱い (お金のルール ⑤)
// ───────────────────────────────────────────────────────────

/**
 * 端数の丸め方。**この 1 か所だけが持つ。**
 *
 * ── なぜ引数ではなくモジュールの状態なのか ────────────────
 *
 * 税額を出すのは帳票・取込・見積・請求と散っており、全部に「丸め方」を
 * 引き回すと**渡し忘れた所だけ既定に落ちて、同じ売上が入口によって
 * 1 円ずれます**（税枝番が 4 か所に散って食い違っていたのと同じ形）。
 * 設定は 1 行しかない会社ぜんぶの決めごとなので、ここに 1 つ持ちます。
 *
 * 値の出どころは `money-rules.service` で、起動時と保存時に
 * `setTaxRounding` が呼ばれます。**呼ばれなくても既定 (切り捨て) で動きます** —
 * DB が読めないときに 500 で止めるより、決めた既定で出すほうがよい。
 */
export type TaxRounding = 'floor' | 'round' | 'ceil';

let taxRounding: TaxRounding = 'floor';

export function setTaxRounding(mode: TaxRounding): void { taxRounding = mode; }
export function getTaxRounding(): TaxRounding { return taxRounding; }

/** 決めた丸め方で 1 円未満を落とす */
export function roundByRule(n: number): number {
  if (taxRounding === 'ceil') return Math.ceil(n);
  if (taxRounding === 'round') return Math.round(n);
  return Math.floor(n);
}

/** 税抜 → 税額。非課税・不課税は 0 */
export function taxAmountOf(excludedAmount: number, taxCategory: string | null | undefined): number {
  const rate = taxRateOf(taxCategory);
  if (rate === 0) return 0;
  return roundByRule(excludedAmount * rate);
}

/** 税抜 → 税込 */
export function toIncludedAmount(excludedAmount: number, taxCategory: string | null | undefined): number {
  return excludedAmount + taxAmountOf(excludedAmount, taxCategory);
}

/**
 * 税込 → 税抜。非課税・不課税はそのまま。
 *
 * **税抜を直接丸めない。** 先に税額を出して引きます。
 * 直接丸めると 税抜 + 税額 ≠ 税込 になり、帳票の合計が 1 円合いません。
 */
export function toExcludedAmount(includedAmount: number, taxCategory: string | null | undefined): number {
  const rate = taxRateOf(taxCategory);
  if (rate === 0) return Math.round(includedAmount);
  return includedAmount - roundByRule((includedAmount * rate) / (1 + rate));
}
