// 売上明細（項目）の編集まわり — v2.9.295 で RevenueListPage.tsx から切り出し。
// **JSX は 1 行も変えていない**（props 経由に置き換えただけ）。
//
// 型は親 (RevenueListPage) の宣言をそのまま写している。
// 推測で書くと「渡せるが意味が違う」形になるので、必ず元に合わせる。
import { Plus, Trash2, Percent, Download, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { formatCurrency } from '@/lib/format';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { RevenueItem } from './types';

export default function RevenueItemsEditor({
  items, addItem, updateItem, removeItem, itemsTotal, flashRowIdx,
  isProjectCategoryB, selectedProjectId, simulationItems, handleImportSimulation,
  openItemDiscount, openGlobalDiscount, setPricingPickerOpen,
}: {
  items: RevenueItem[];
  addItem: () => void;
  updateItem: (index: number, field: keyof RevenueItem, value: string | number | null) => void;
  removeItem: (index: number) => void;
  itemsTotal: number;
  flashRowIdx: number | null;
  isProjectCategoryB: boolean;
  selectedProjectId: string;
  simulationItems: Array<{ subtotal?: number; [k: string]: unknown }>;
  handleImportSimulation: () => void;
  openItemDiscount: (idx: number) => void;
  openGlobalDiscount: () => void;
  setPricingPickerOpen: (v: boolean) => void;
}) {
  return (
            <div className="space-y-2">
          <datalist id="revenue-item-categories">
            <option value="制作費" />
            <option value="機材費" />
            <option value="人件費" />
            <option value="スタジオ費" />
            <option value="配信費" />
            <option value="諸経費" />
          </datalist>
          <div className="flex items-center justify-between">
            <Label>明細行</Label>
            <div className="flex flex-wrap gap-2">
              {/* Import from simulation (A系のみ) */}
              {selectedProjectId &&
                !isProjectCategoryB &&
                simulationItems.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleImportSimulation}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    シミュレーション引用
                  </Button>
                )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPricingPickerOpen(true)}
                disabled={!selectedProjectId}
                title={!selectedProjectId ? "案件を選択してください" : undefined}
              >
                <Link2 className="mr-1 h-3 w-3" />
                料金表から追加
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-3 w-3" />
                行追加
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={openGlobalDiscount}
              >
                <Percent className="mr-1 h-3 w-3" />
                全体値引き
              </Button>
            </div>
          </div>

          {items.length > 0 && (
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
                        className={flashRowIdx === idx ? "bg-emerald-50 transition-colors" : undefined}
                      >
                        <TableCell className="p-1">
                          <div className="relative">
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateItem(idx, "description", e.target.value)
                              }
                              placeholder="項目名"
                              className={`h-8 text-sm ${item.pricing_item_id ? "pr-8" : ""}`}
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
                            value={item.category || ""}
                            onChange={(e) => updateItem(idx, "category", e.target.value || null)}
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
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "quantity",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="flex items-center gap-0.5">
                            <CurrencyInput
                              value={item.unit_price}
                              onChange={(v) =>
                                updateItem(idx, "unit_price", v)
                              }
                              className="h-8 text-sm flex-1"
                            />
                            <TaxHelperButton
                              fieldLabel="単価"
                              defaultIncludedAmount={item.unit_price}
                              onResult={(v) => updateItem(idx, "unit_price", v)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="p-1 text-right font-number text-sm font-medium">
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="date"
                            value={item.period_start || ""}
                            onChange={(e) =>
                              updateItem(idx, "period_start", e.target.value || null)
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="date"
                            value={item.period_end || ""}
                            onChange={(e) =>
                              updateItem(idx, "period_end", e.target.value || null)
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Textarea
                            value={item.item_notes || ""}
                            onChange={(e) =>
                              updateItem(idx, "item_notes", e.target.value || null)
                            }
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
                                className="h-7 w-7 text-amber-600 hover:bg-amber-50"
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
                    className={`p-3 space-y-2 ${flashRowIdx === idx ? "bg-emerald-50 transition-colors" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          updateItem(idx, "description", e.target.value)
                        }
                        placeholder="項目名"
                        className="flex-1 text-sm"
                      />
                      {(item.amount || 0) > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-amber-600"
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
                      value={item.category || ""}
                      onChange={(e) => updateItem(idx, "category", e.target.value || null)}
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
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "quantity",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">単価</Label>
                        <div className="flex items-center gap-0.5">
                          <CurrencyInput
                            value={item.unit_price}
                            onChange={(v) =>
                              updateItem(idx, "unit_price", v)
                            }
                            className="text-sm flex-1"
                          />
                          <TaxHelperButton
                            fieldLabel="単価"
                            defaultIncludedAmount={item.unit_price}
                            onResult={(v) => updateItem(idx, "unit_price", v)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">金額</Label>
                        <div className="flex items-center h-9 text-sm font-medium font-number">
                          {formatCurrency(item.amount)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">期間（開始）</Label>
                        <Input
                          type="date"
                          value={item.period_start || ""}
                          onChange={(e) =>
                            updateItem(idx, "period_start", e.target.value || null)
                          }
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">期間（終了）</Label>
                        <Input
                          type="date"
                          value={item.period_end || ""}
                          onChange={(e) =>
                            updateItem(idx, "period_end", e.target.value || null)
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">明細備考</Label>
                      <Textarea
                        value={item.item_notes || ""}
                        onChange={(e) =>
                          updateItem(idx, "item_notes", e.target.value || null)
                        }
                        placeholder="PDFに表示される商品説明・利用条件など"
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-t">
                <span className="text-sm font-medium">合計</span>
                <span className="text-base font-bold font-number">
                  {formatCurrency(itemsTotal)}
                </span>
              </div>
            </div>
          )}
        </div>
  );
}
