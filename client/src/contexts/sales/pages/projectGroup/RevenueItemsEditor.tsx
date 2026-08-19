/**
 * グループ売上の明細行（v4）
 *
 * **料金表・値引き・期間には繋がっていない**。財務⑤売上台帳の明細
 * （`finance/pages/ledger/RevenueItemsTable.tsx`）とは別の、もっと単純な
 * 4項目（項目名・数量・単価・金額）だけの表。グループ売上は複数案件へ
 * 按分するのが主目的で、料金表連携まで持たせるとこの画面だけ複雑になる
 */
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { EMPTY_REVENUE_ITEM, type RevenueItem } from './types';

export function RevenueItemsEditor({
  items, setItems, total,
}: {
  items: RevenueItem[];
  setItems: (fn: (prev: RevenueItem[]) => RevenueItem[]) => void;
  total: number;
}) {
  const update = (idx: number, field: keyof RevenueItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        next[idx]!.amount = (next[idx]!.quantity || 0) * (next[idx]!.unit_price || 0);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sub font-bold">明細項目</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setItems((prev) => [...prev, { ...EMPTY_REVENUE_ITEM }])}>
          <Plus className="mr-1 h-3 w-3" />行追加
        </Button>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-end gap-2">
          <div className="flex-1">
            {idx === 0 && <Label className="text-note">項目名</Label>}
            <Input value={item.description} onChange={(e) => update(idx, 'description', e.target.value)} placeholder="項目" />
          </div>
          <div className="w-16">
            {idx === 0 && <Label className="text-note">数量</Label>}
            <Input type="number" min={1} value={item.quantity} onChange={(e) => update(idx, 'quantity', Number(e.target.value))} />
          </div>
          <div className="w-28">
            {idx === 0 && <Label className="text-note">単価</Label>}
            <CurrencyInput value={item.unit_price} onChange={(v) => update(idx, 'unit_price', v)} />
          </div>
          <div className="flex h-9 w-28 items-center justify-end">
            {idx === 0 && <span className="sr-only">金額</span>}
            <Money value={item.amount} className="font-bold" />
          </div>
          {items.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-end gap-2 text-sub">
        <span className="text-muted-foreground">合計:</span>
        <Money value={total} className="font-bold" />
      </div>
    </div>
  );
}
