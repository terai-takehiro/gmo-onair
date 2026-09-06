/**
 * 売上の「金額・明細行・税区分」（③ 売上のダイアログの中身）
 *
 * **`RevenueDialog` から切り出したものです。JSX を1文字も変えずに移しています。**
 * 分けた理由は1ファイル400行の上限（`client/CLAUDE.md`）で、欄の作り直しでは
 * ありません。**この回で組み直した並び順もそのまま**です
 * （金額 → 明細行と合計 → 税区分。GPM の売上明細ダイアログと同じ順）。
 *
 * まとまりの意味は「**いくらの売上か**」（`docs/design/v4/_form-order.md` 段3）。
 * 総額・明細・税区分は互いに効き合う（明細が1行でもあれば合計が金額になり、
 * 税区分は請求KEYの末尾を決める）ので、1つの塊として読ませる。
 *
 * ⚠️ **state は持たない。** 明細行の足し引きは `useRevenueItems`、送信 payload の
 * 組み立ては `RevenueDialog` のままで、ここは受け取って描くだけ
 * （持たせると「合計はどこで決まるのか」が2か所に散る）。
 */
import { Plus, Download, Link2, Percent } from 'lucide-react';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TaxCategoryLabels } from '@/types';
import { RevenueItemsTable } from './RevenueItemsTable';
import type { RevenueItem } from './types';

export function RevenueAmountFields({
  amount, setAmount,
  items, itemsTotal, flashRowIdx, updateItem, removeItem, openItemDiscount,
  addItem, openGlobalDiscount, discountable,
  importSimulation, simulationItems,
  selectedProjectId, isProjectCategoryB, setPricingPickerOpen,
  taxCategory, setTaxCategory, billingKeyPreview,
}: {
  amount: number;
  setAmount: (v: number) => void;
  items: RevenueItem[];
  itemsTotal: number;
  flashRowIdx: number | null;
  updateItem: (index: number, field: keyof RevenueItem, value: string | number | null) => void;
  removeItem: (index: number) => void;
  openItemDiscount: (idx: number) => void;
  addItem: () => void;
  openGlobalDiscount: () => void;
  /** 値引きの対象になる明細があるか（判定は `RevenueDialog` 側） */
  discountable: boolean;
  importSimulation: (simulationItems: Record<string, unknown>[]) => void;
  simulationItems: Record<string, unknown>[];
  selectedProjectId: string;
  isProjectCategoryB: boolean;
  setPricingPickerOpen: (open: boolean) => void;
  taxCategory: string;
  setTaxCategory: (v: string) => void;
  billingKeyPreview: string;
}) {
  return (
    <>
      {/* 総額。**明細の有無にかかわらず常に出す。**
          着手前は「明細0件のときだけ」描いていたので、明細を1行足した瞬間に
          欄ごと消え、金額をどこで直すのか分からなくなっていた。
          明細が1行でもあるときは合計が金額になる（送信は `handleCreateSubmit`）ので、
          そのことを欄の下に書いておく */}
      <div className="space-y-1">
        <Label>金額</Label>
        <div className="flex items-center gap-1">
          <div className="flex-1"><CurrencyInput value={amount} onChange={(v) => setAmount(v)} /></div>
          <TaxHelperButton fieldLabel="売上金額" defaultIncludedAmount={amount} onResult={setAmount} />
        </div>
        {items.length > 0 && (
          <p className="text-note text-muted-foreground">
            明細行があるので、登録するのは明細の合計です（この欄の金額は使いません）
          </p>
        )}
      </div>

      {/* 明細行。**操作ボタンは行の下**（GPM と同じ。行を見てから足す・引くの順） */}
      <div className="space-y-2">
        <datalist id="revenue-item-categories">
          <option value="制作費" /><option value="機材費" /><option value="人件費" />
          <option value="スタジオ費" /><option value="配信費" /><option value="諸経費" />
        </datalist>
        <Label>明細行</Label>

        <RevenueItemsTable
          items={items}
          itemsTotal={itemsTotal}
          flashRowIdx={flashRowIdx}
          updateItem={updateItem}
          removeItem={removeItem}
          openItemDiscount={openItemDiscount}
        />

        <div className="flex flex-wrap gap-2">
          {selectedProjectId && !isProjectCategoryB && simulationItems.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => importSimulation(simulationItems)}>
              <Download className="mr-1 h-3 w-3" />見積の積算を引用
            </Button>
          )}
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setPricingPickerOpen(true)}
            disabled={!selectedProjectId}
            title={!selectedProjectId ? '案件を選んでください' : undefined}
          >
            <Link2 className="mr-1 h-3 w-3" />料金表から追加
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1 h-3 w-3" />行追加
          </Button>
          <Button
            type="button" variant="outline" size="sm"
            onClick={openGlobalDiscount}
            disabled={!discountable}
            title={discountable ? undefined : '値引きの対象になる明細がありません'}
          >
            <Percent className="mr-1 h-3 w-3" />全体値引き
          </Button>
        </div>
      </div>

      {/* 税区分は金額（明細の合計）の下。請求KEY は回と税区分から決まるので一緒に出す */}
      <div className="space-y-1">
        <Label>税区分</Label>
        <Select value={taxCategory} onValueChange={setTaxCategory}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(TaxCategoryLabels).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {billingKeyPreview && (
          <p className="font-number text-note text-muted-foreground">請求KEY: {billingKeyPreview}</p>
        )}
      </div>
    </>
  );
}
