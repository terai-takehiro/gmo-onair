/**
 * 売上の明細行を扱う手続き（③ 売上のダイアログから切り出し）
 *
 * **旧 `RevenueListPage` の中身をそのまま持ってきています。計算は変えていません。**
 * 分けた理由は1ファイル400行の上限で、作り直しではありません。
 *
 * 行の追加・削除・書き換え・料金表からの取り込み・見積の積算の引用・値引きを
 * まとめて持ちます。**金額は `quantity × unit_price` でここだけが計算します** —
 * 画面のあちこちで掛け算すると、片方だけ直したときに合計が合わなくなります。
 */
import { useCallback, useMemo, useState } from 'react';
import type { PickedPricingItem } from '../../components/PricingItemPicker';
import type { DiscountResult } from '../../components/DiscountDialog';
import type { RevenueItem } from './types';

export interface DiscountTarget {
  open: boolean;
  mode: 'item' | 'global';
  targetIdx?: number;
  targetDescription?: string;
  baseAmount: number;
}

export function useRevenueItems() {
  const [items, setItems] = useState<RevenueItem[]>([]);
  /** 料金表から足した行を一瞬光らせる。どこに入ったか分からないと探すことになる */
  const [flashRowIdx, setFlashRowIdx] = useState<number | null>(null);
  const [discountDialog, setDiscountDialog] = useState<DiscountTarget>({
    open: false, mode: 'item', baseAmount: 0,
  });

  const itemsTotal = useMemo(() => items.reduce((sum, it) => sum + (it.amount || 0), 0), [items]);

  const addItem = useCallback(() => {
    // 項目追加時は1つ前の入力分の日付・カテゴリをコピー
    setItems((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, {
        description: '', quantity: 1, unit_price: 0, amount: 0,
        period_start: last?.period_start ?? null,
        period_end: last?.period_end ?? null,
        category: last?.category ?? null,
      }];
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback(
    (index: number, field: keyof RevenueItem, value: string | number | null) => {
      setItems((prev) => {
        const next = [...prev];
        const item = { ...next[index], [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          item.amount = (item.quantity || 0) * (item.unit_price || 0);
        }
        next[index] = item;
        return next;
      });
    }, []);

  /** 見積の積算（シミュレーション）を明細に引き写す。**置き換え**（足し算ではない） */
  const importSimulation = useCallback((simulationItems: Record<string, unknown>[]) => {
    if (!simulationItems || simulationItems.length === 0) return;
    setItems(simulationItems.map((si) => ({
      description: String(si.pricing_item_name ?? '') + (si.sub_label ? ` (${si.sub_label})` : ''),
      quantity: Number(si.quantity) || 1,
      unit_price: Number(si.unit_price) || 0,
      amount: Number(si.subtotal) || 0,
      pricing_item_id: si.pricing_item_id as string | undefined,
    })));
  }, []);

  const pickPricingItem = useCallback((picked: PickedPricingItem) => {
    const description = picked.sub_label ? `${picked.name} (${picked.sub_label})` : picked.name;
    setItems((prev) => {
      const next = [...prev, {
        description,
        quantity: 1,
        unit_price: picked.unit_price,
        amount: picked.unit_price,
        pricing_item_id: picked.pricing_item_id,
      }];
      const newIdx = next.length - 1;
      setFlashRowIdx(newIdx);
      setTimeout(() => setFlashRowIdx((cur) => (cur === newIdx ? null : cur)), 1200);
      return next;
    });
  }, []);

  const openItemDiscount = useCallback((idx: number) => {
    setItems((prev) => {
      const item = prev[idx];
      if (!item || (item.amount || 0) <= 0) return prev;
      setDiscountDialog({
        open: true, mode: 'item', targetIdx: idx,
        targetDescription: item.description, baseAmount: item.amount,
      });
      return prev;
    });
  }, []);

  const openGlobalDiscount = useCallback(() => {
    setItems((prev) => {
      // マイナスの行（既に入れた値引き）は元の小計に足し戻さない
      const positiveSubtotal = prev.reduce((s, it) => s + Math.max(0, it.amount || 0), 0);
      if (positiveSubtotal <= 0) return prev;
      setDiscountDialog({ open: true, mode: 'global', baseAmount: positiveSubtotal });
      return prev;
    });
  }, []);

  /** 値引きは**単価を下げず、別の行として足す**（v4 の決めごと） */
  const applyDiscount = useCallback((result: DiscountResult) => {
    const newItem: RevenueItem = {
      description: result.description,
      quantity: result.quantity,
      unit_price: result.unit_price,
      amount: result.amount,
    };
    setItems((prev) => {
      if (discountDialog.mode === 'item' && discountDialog.targetIdx !== undefined) {
        const next = [...prev];
        next.splice(discountDialog.targetIdx + 1, 0, newItem);
        return next;
      }
      return [...prev, newItem];
    });
  }, [discountDialog.mode, discountDialog.targetIdx]);

  return {
    items, setItems, itemsTotal, flashRowIdx,
    addItem, removeItem, updateItem, importSimulation, pickPricingItem,
    discountDialog, setDiscountDialog, openItemDiscount, openGlobalDiscount, applyDiscount,
  };
}
