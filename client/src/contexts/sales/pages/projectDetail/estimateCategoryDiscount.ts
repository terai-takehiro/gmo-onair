/**
 * 「カテゴリに値引き行を追加」ボタンの中身（`EstimateItems.tsx` から切り出し）
 *
 * `EstimateItems.tsx` から関数として切り出したのは、400行の上限に収めるため
 * だけではない。**定価差の自動計算はここ1か所の純粋関数**にしておくと、
 * `shared/tests/` から DOM 無しで固定できる。
 *
 * ── 何をするボタンか（9/3 要望「値引きが発生している場合は、値引き項目行を
 *    自動で生成し、各項目の値引き金額の合計が自動で入るようにする」）────
 *
 * カタログ選択時に `unit_price`（実額）へグループ内価格が自動で入った行は、
 * 定価（`list_unit_price`）との差が**画面のカテゴリ小計・見積書PDFだけがその場で
 * 動的に合成する表示専用のゴースト値引き**のままだった。見積を受注して売上へ
 * 変換すると（`revenue_items` に定価列は無い）この値引きはどこにも残らず、
 * 請求書・検収書には出ない。
 *
 * このカテゴリの定価差合計を単価に入れた**実在する値引き行**（`estimate_items`
 * の通常行）を1本足すことで、既存の保存・見積PDF・売上変換・請求書/検収書PDF
 * の経路にそのまま乗せる。差が無いカテゴリでは従来どおり空の値引き行
 * （手入力用）にフォールバックする。
 *
 * ── なぜ元の行の単価を定価まで戻すのか（二重値引きを防ぐ）──────────
 *
 * 定価差のある行は、その時点で**すでに割引後の実額で計上済み**。差額をそのまま
 * 値引き行として足すと、実額の行 ＋ 新しい値引き行の**二重**で値引かれたことに
 * なる（例: 定価1万円・実額8千円の行に「値引き2千円」の行を追加すると、
 * 実質6千円しか請求しない計算になる）。元の行の `unit_price` を
 * `list_unit_price`（定価）まで引き上げてから差額を別行に立てるので、
 * カテゴリの合計は1円も変わらない（Σ実額 = Σ定価 − 差額、という関係を保った
 * まま「値引きは単価を下げず別建て」という設計方針どおりの形に組み替えるだけ）。
 *
 * 生成後は他の行と完全に同じ — 金額・項目名とも自由に直せる。**自動計算は
 * 押した瞬間の初期値の提案でしかなく、以降は保存のたびに再計算しない**
 * （編集・削除した値引き行が保存のたびに復活すると、任意編集ができなくなる）。
 *
 * ⚠️ **`EstimateCategorySubtotal.tsx` の `categoryTotals().discount` は使わない。**
 * あちらは「定価小計 − 実額小計」という画面表示用の差分で、**一度材料化した
 * 値引き行そのもの（単価マイナス）も実額側に含めて計算する**ため、材料化した
 * 直後にもう一度ボタンを押すと同じ額を「まだ未材料化の差」と誤認して
 * **もう1本値引き行を足してしまう**（実際にテストで踏んだ）。ここでは
 * `list_unit_price > unit_price` の行だけを直接合算する
 * （`estimate-pdf.service.ts` の `groupDiscountByCategory` と同じ考え方）。
 */
import type { EstimateItemRow } from './EstimateItems';

/**
 * ボタンを押したら入る額。**まだ定価まで戻していない行だけ**を合計する
 * （0 なら手入力用の空行にフォールバックする）。
 */
export function pendingCategoryDiscount(rows: EstimateItemRow[]): number {
  return rows.reduce((sum, it) => {
    if (it.list_unit_price == null || it.list_unit_price <= it.unit_price) return sum;
    const qty = Math.max(0, it.quantity);
    return sum + Math.round(it.list_unit_price - it.unit_price) * qty;
  }, 0);
}

export function applyCategoryDiscount(items: EstimateItemRow[], category: string): EstimateItemRow[] {
  const catRows = items.filter((it) => (it.category ?? 'other') === category);
  const discount = pendingCategoryDiscount(catRows);
  if (discount <= 0) {
    return [...items,
      { description: '値引き', quantity: 1, unit: null, unit_price: 0, amount: 0, cost: 0, category }];
  }
  const undiscounted = items.map((it) => {
    if ((it.category ?? 'other') !== category) return it;
    if (it.list_unit_price == null || it.list_unit_price <= it.unit_price) return it;
    const unit_price = it.list_unit_price;
    return { ...it, unit_price, amount: Math.max(0, it.quantity) * Math.round(unit_price) };
  });
  return [...undiscounted, {
    description: 'グループ価格による値引き', quantity: 1, unit: null,
    unit_price: -discount, amount: -discount, cost: 0, category,
  }];
}
