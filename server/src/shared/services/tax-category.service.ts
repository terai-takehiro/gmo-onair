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

/** 税込 → 税抜 (四捨五入)。非課税・不課税はそのまま */
export function toExcludedAmount(includedAmount: number, taxCategory: string | null | undefined): number {
  const rate = taxRateOf(taxCategory);
  if (rate === 0) return Math.round(includedAmount);
  return Math.round(includedAmount / (1 + rate));
}
