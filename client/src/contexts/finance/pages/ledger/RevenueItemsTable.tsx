/**
 * 売上の明細行の入力表（③ 売上のダイアログの中身）
 *
 * **旧 `RevenueListPage` から切り出したものです。動きは1つも変えていません。**
 * 枠（一覧）の作り直しと、金額を扱うフォームの作り直しを同じ回でやると、
 * 壊れたときどちらが原因か切り分けられません（前回の刷新が捨てられた原因）。
 * ここは v4 の見た目に**まだ寄せていません**。
 *
 * 変えたのは**色の書き方だけ**です（`bg-emerald-50` → `bg-success-surface` など）。
 * 生の色指定は `check-ui-tokens` が止めるので、同じ意味のトークンに置き換えました。
 */
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Percent, Link2 } from 'lucide-react';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import type { RevenueItem } from './types';

export function RevenueItemsTable({
  items, itemsTotal, flashRowIdx, updateItem, removeItem, openItemDiscount,
}: {
  items: RevenueItem[];
  itemsTotal: number;
  flashRowIdx: number | null;
  updateItem: (index: number, field: keyof RevenueItem, value: string | number | null) => void;
  removeItem: (index: number) => void;
  openItemDiscount: (idx: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded border">
      {/* Desktop table — dialog 幅を超えたら bordered 枠内で横スクロール (列は圧縮しない) */}
      <div className="hidden sm:block overflow-x-auto">
        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">内容</TableHead>
              <TableHead className="w-32">カテゴリ</TableHead>
              <TableHead className="w-20 text-right">数量</TableHead>
              <TableHead className="w-40 text-right">単価</TableHead>
              <TableHead className="w-28 text-right">金額</TableHead>
              <TableHead className="w-[130px]">期間開始</TableHead>
              <TableHead className="w-[130px]">期間終了</TableHead>
              <TableHead className="min-w-[180px]">明細備考</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow
                key={idx}
                className={flashRowIdx === idx ? 'bg-success-surface transition-colors' : undefined}
              >
                <TableCell className="p-1">
                  <div className="relative">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      placeholder="項目名"
                      className={`h-8 text-sm ${item.pricing_item_id ? 'pr-8' : ''}`}
                    />
                    {item.pricing_item_id && (
                      <span
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-primary"
                        title="料金表に紐付け済"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    value={item.category || ''}
                    onChange={(e) => updateItem(idx, 'category', e.target.value || null)}
                    placeholder="カテゴリ"
                    className="h-8 text-sm"
                    list="revenue-item-categories"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                    className="h-8 text-sm text-right"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <div className="flex items-center gap-0.5">
                    <CurrencyInput
                      value={item.unit_price}
                      onChange={(v) => updateItem(idx, 'unit_price', v)}
                      className="h-8 text-sm flex-1"
                    />
                    <TaxHelperButton
                      fieldLabel="単価"
                      defaultIncludedAmount={item.unit_price}
                      onResult={(v) => updateItem(idx, 'unit_price', v)}
                    />
                  </div>
                </TableCell>
                <TableCell className="p-1 text-right text-sm">
                  <Money value={item.amount} className="font-medium justify-end" />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    type="date"
                    value={item.period_start || ''}
                    onChange={(e) => updateItem(idx, 'period_start', e.target.value || null)}
                    className="h-8 text-xs"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    type="date"
                    value={item.period_end || ''}
                    onChange={(e) => updateItem(idx, 'period_end', e.target.value || null)}
                    className="h-8 text-xs"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Textarea
                    value={item.item_notes || ''}
                    onChange={(e) => updateItem(idx, 'item_notes', e.target.value || null)}
                    className="text-xs min-h-[32px] resize-none"
                    rows={1}
                    placeholder="備考"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <div className="flex items-center gap-0.5">
                    {(item.amount || 0) > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-warning hover:bg-warning-surface"
                        onClick={() => openItemDiscount(idx)}
                        title="この項目に値引きを追加"
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden divide-y">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`p-3 space-y-2 ${flashRowIdx === idx ? 'bg-success-surface transition-colors' : ''}`}
          >
            <div className="flex items-start gap-2">
              <Input
                value={item.description}
                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                placeholder="項目名"
                className="flex-1 text-sm"
              />
              {(item.amount || 0) > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-warning"
                  onClick={() => openItemDiscount(idx)}
                  title="値引き"
                >
                  <Percent className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => removeItem(idx)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            <Input
              value={item.category || ''}
              onChange={(e) => updateItem(idx, 'category', e.target.value || null)}
              placeholder="カテゴリ（任意）"
              className="text-sm"
              list="revenue-item-categories"
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">数量</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">単価</Label>
                <div className="flex items-center gap-0.5">
                  <CurrencyInput
                    value={item.unit_price}
                    onChange={(v) => updateItem(idx, 'unit_price', v)}
                    className="text-sm flex-1"
                  />
                  <TaxHelperButton
                    fieldLabel="単価"
                    defaultIncludedAmount={item.unit_price}
                    onResult={(v) => updateItem(idx, 'unit_price', v)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">金額</Label>
                <div className="flex items-center h-9 text-sm">
                  <Money value={item.amount} className="font-medium" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">期間（開始）</Label>
                <Input
                  type="date"
                  value={item.period_start || ''}
                  onChange={(e) => updateItem(idx, 'period_start', e.target.value || null)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">期間（終了）</Label>
                <Input
                  type="date"
                  value={item.period_end || ''}
                  onChange={(e) => updateItem(idx, 'period_end', e.target.value || null)}
                  className="text-sm"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">明細備考</Label>
              <Textarea
                value={item.item_notes || ''}
                onChange={(e) => updateItem(idx, 'item_notes', e.target.value || null)}
                placeholder="PDFに表示される商品説明・利用条件など"
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-subtle border-t">
        <span className="text-sm font-medium">合計</span>
        <Money value={itemsTotal} className="text-base font-bold" />
      </div>
    </div>
  );
}
