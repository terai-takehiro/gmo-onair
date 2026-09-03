/**
 * 見積の明細 — カテゴリの値引き行の自動生成（9/3 要望）
 *
 * 「グループ内案件など、定価に対して値引きが発生している場合は、値引き項目行を
 * 自動で生成し、各項目の値引き金額の合計が自動で入るようにする。ただし値引き
 * 金額や項目名などは他の項目と同様に任意編集ができ、それらが出力する見積もり
 * や請求・検収書にも反映されるようにする」の実装本体
 * （`client/src/contexts/sales/pages/projectDetail/estimateCategoryDiscount.ts`）を、
 * DOM を介さず直接呼んで固定する。
 *
 * ⚠️ **一番大事なのは「二重値引きにならない」こと。** 定価差のある行はカタログ
 * 選択時点で既に割引後の実額（`unit_price`）が入っているため、差額をそのまま
 * 値引き行として足すと合計が余分に下がる。ここでは元の行の単価を定価まで
 * 引き上げてから差額を別行に立てる設計なので、**カテゴリの合計（Σamount）が
 * 1円も変わらないこと**を主に確かめる。
 */
import { describe, it, expect } from 'vitest';
import {
  applyCategoryDiscount, pendingCategoryDiscount,
} from '../../client/src/contexts/sales/pages/projectDetail/estimateCategoryDiscount';
import type { EstimateItemRow } from '../../client/src/contexts/sales/pages/projectDetail/EstimateItems';

/** 手短に行を作る（未指定は「定価も無い普通の行」の既定値） */
function row(partial: Partial<EstimateItemRow> & { category: string }): EstimateItemRow {
  return {
    description: '', quantity: 1, unit: null, unit_price: 0, amount: 0, cost: 0,
    list_unit_price: null,
    ...partial,
  };
}

describe('見積の明細 — pendingCategoryDiscount（ボタンを押したら入る額）', () => {
  it('定価 > 実額の行だけを合算する（カテゴリ単位）', () => {
    const items = [
      row({ category: 'studio', quantity: 1, unit_price: 8000, amount: 8000, list_unit_price: 10000 }),
      row({ category: 'studio', quantity: 2, unit_price: 3000, amount: 6000, list_unit_price: 3500 }),
      // 定価が無い・定価 <= 実額の行は寄与しない
      row({ category: 'studio', quantity: 1, unit_price: 1000, amount: 1000 }),
      // 別カテゴリは無視する
      row({ category: 'tech', quantity: 1, unit_price: 100, amount: 100, list_unit_price: 999 }),
    ];
    // (10000-8000)*1 + (3500-3000)*2 = 2000 + 1000 = 3000
    expect(pendingCategoryDiscount(items.filter((it) => it.category === 'studio'))).toBe(3000);
  });

  it('定価差が無ければ 0（フォールバック用）', () => {
    const items = [row({ category: 'studio', unit_price: 1000, amount: 1000, list_unit_price: 1000 })];
    expect(pendingCategoryDiscount(items)).toBe(0);
  });
});

describe('見積の明細 — applyCategoryDiscount（自動生成の中身）', () => {
  it('定価差があれば、元の行を定価まで戻し、差額ぶんの値引き行を1本足す', () => {
    const items = [
      row({ description: 'カメラマン', category: 'studio', quantity: 1, unit_price: 8000, amount: 8000, list_unit_price: 10000 }),
      row({ description: '別カテゴリの行', category: 'tech', quantity: 1, unit_price: 500, amount: 500 }),
    ];
    const out = applyCategoryDiscount(items, 'studio');

    expect(out).toHaveLength(3);
    const studioSource = out.find((it) => it.description === 'カメラマン')!;
    // **単価を定価まで戻す**（値引きは単価を下げず別建て、を保つための組み替え）
    expect(studioSource.unit_price).toBe(10000);
    expect(studioSource.amount).toBe(10000);

    const discountRow = out.find((it) => it.description === 'グループ価格による値引き')!;
    expect(discountRow.category).toBe('studio');
    expect(discountRow.unit_price).toBe(-2000);
    expect(discountRow.amount).toBe(-2000);

    // 他カテゴリの行はそのまま
    const other = out.find((it) => it.description === '別カテゴリの行')!;
    expect(other.unit_price).toBe(500);
    expect(other.amount).toBe(500);

    // ⚠️ **二重値引きになっていないこと**（全行の合計が1円も変わらない）
    const before = items.reduce((s, it) => s + it.amount, 0);
    const after = out.reduce((s, it) => s + it.amount, 0);
    expect(after).toBe(before);
  });

  it('定価差の無いカテゴリでは、従来どおり手入力用の空行にフォールバックする', () => {
    const items = [row({ category: 'studio', unit_price: 1000, amount: 1000 })];
    const out = applyCategoryDiscount(items, 'studio');
    expect(out).toHaveLength(2);
    const added = out[out.length - 1];
    expect(added).toMatchObject({ description: '値引き', quantity: 1, unit_price: 0, amount: 0, category: 'studio' });
  });

  it('複数の定価差行があるカテゴリでは、その合計1本にまとめる（行ごとに分けない）', () => {
    const items = [
      row({ description: 'A', category: 'studio', quantity: 1, unit_price: 8000, amount: 8000, list_unit_price: 10000 }),
      row({ description: 'B', category: 'studio', quantity: 3, unit_price: 900, amount: 2700, list_unit_price: 1000 }),
    ];
    const out = applyCategoryDiscount(items, 'studio');
    const discountRows = out.filter((it) => it.description === 'グループ価格による値引き');
    expect(discountRows).toHaveLength(1);
    // (10000-8000) + (1000-900)*3 = 2000 + 300 = 2300
    expect(discountRows[0].amount).toBe(-2300);
    expect(out.reduce((s, it) => s + it.amount, 0)).toBe(items.reduce((s, it) => s + it.amount, 0));
  });

  it('一度自動生成すると、再度押しても定価差はもう残っていないので空行にフォールバックする', () => {
    const items = [row({ category: 'studio', quantity: 1, unit_price: 8000, amount: 8000, list_unit_price: 10000 })];
    const once = applyCategoryDiscount(items, 'studio');
    expect(pendingCategoryDiscount(once.filter((it) => it.category === 'studio'))).toBe(0);
    const twice = applyCategoryDiscount(once, 'studio');
    // 3行目（今回追加分）が空の手入力行であり、前回の値引き行はそのまま残る
    expect(twice).toHaveLength(3);
    expect(twice[2]).toMatchObject({ description: '値引き', unit_price: 0, amount: 0 });
  });

  it('生成後の値引き行は他の行と同じ形（自由に金額・項目名を直せる）', () => {
    const items = [row({ category: 'studio', quantity: 1, unit_price: 8000, amount: 8000, list_unit_price: 10000 })];
    const out = applyCategoryDiscount(items, 'studio');
    const discountRow = out.find((it) => it.description === 'グループ価格による値引き')!;
    // 特別なフラグ列を持たない — id を持たない・他の任意フィールドと同じ形の
    // 普通の EstimateItemRow なので、保存・PDF・売上変換の既存経路をそのまま通る
    expect(discountRow.pricing_item_id ?? null).toBeNull();
    expect(discountRow.list_unit_price ?? null).toBeNull();
  });
});
