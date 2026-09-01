/**
 * GPM の請求タブ — 売上明細ダイアログの「明細項目」の行（段13）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 * インデントも元のまま。
 *
 * ⚠️ **PC の表とスマホのカードは、同じ項目を2度書いています**（`hidden sm:block` と
 * `sm:hidden`）。**片方だけ直すと、もう片方から欄が消えます** — 過去にそれで
 * 「スマホだと期間が入れられない」が起きました。欄を足すときは必ず両方に足すこと。
 *
 * ⚠️ 表は `overflow-x-auto` の枠に入れて**列は圧縮しない**（縦の桁が揃わなくなるため）。
 */
import { Trash2, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { formatCurrency } from '@/lib/format';
import type { RevenueItem } from './types';

export function RevenueItemRows({
  items, updateItem, removeItem, openItemDiscount,
}: {
  items: RevenueItem[];
  updateItem: (idx: number, field: string, value: any) => void;
  removeItem: (idx: number) => void;
  openItemDiscount: (idx: number) => void;
}) {
  return (
    <>
              {/* PC: table layout — dialog 幅を超えたら bordered 枠内で横スクロール (列は圧縮しない) */}
              <div className="hidden sm:block mt-2 rounded border overflow-x-auto">
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
                      <TableRow key={idx} className="align-top">
                        <TableCell className="p-1">
                          <Textarea
                            value={item.description}
                            onChange={(e) => updateItem(idx, "description", e.target.value)}
                            placeholder="項目名・内容"
                            rows={1}
                            className="text-sm min-h-[36px] resize-y"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={item.category || ""}
                            onChange={(e) => updateItem(idx, "category", e.target.value || null)}
                            placeholder="カテゴリ"
                            className="h-9 text-sm"
                            list="revenue-item-categories"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                            className="h-9 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="flex items-center gap-0.5">
                            <CurrencyInput
                              value={item.unit_price}
                              onChange={(v) => updateItem(idx, "unit_price", v)}
                              className="h-8 text-sm flex-1"
                            />
                            <TaxHelperButton
                              fieldLabel="単価"
                              defaultIncludedAmount={item.unit_price}
                              onResult={(v) => updateItem(idx, "unit_price", v)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className={`p-1 text-right font-number text-sm font-medium ${(item.amount || 0) < 0 ? "text-amber-600" : ""}`}>
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="date"
                            value={item.period_start || ""}
                            onChange={(e) => updateItem(idx, "period_start", e.target.value || null)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="date"
                            value={item.period_end || ""}
                            onChange={(e) => updateItem(idx, "period_end", e.target.value || null)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Textarea
                            value={item.item_notes || ""}
                            onChange={(e) => updateItem(idx, "item_notes", e.target.value || null)}
                            className="text-xs min-h-[36px] resize-y"
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
                                title="値引きを追加"
                              >
                                <Percent className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {items.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                aria-label="この項目を削除"
                                title="この項目を削除"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: card layout */}
              <div className="sm:hidden mt-2 space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">項目 {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        {(item.amount || 0) > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-amber-600 hover:bg-amber-50"
                            onClick={() => openItemDiscount(idx)}
                            title="この項目に値引きを追加"
                          >
                            <Percent className="h-3 w-3 mr-1" />
                            値引き
                          </Button>
                        )}
                        {items.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            aria-label="この項目を削除"
                            title="この項目を削除"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Input
                      placeholder="項目名（例: コンサルティング費用）"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                    <div>
                      <Label className="text-xs">カテゴリ（任意・見積書でカテゴリ別に内訳整理）</Label>
                      <Input
                        placeholder="例: 機材費 / 人件費 / 制作費"
                        value={item.category || ""}
                        onChange={(e) => updateItem(idx, "category", e.target.value || null)}
                        list="revenue-item-categories"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">数量</Label>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)} />
                      </div>
                      <div>
                        <Label className="text-xs">金額</Label>
                        <p className="h-9 flex items-center font-number font-medium text-sm">{formatCurrency(item.amount)}</p>
                      </div>
                      {/* 単価は全幅。3等分だと 375px で1列 ~90px しかなく、¥接頭辞＋
                          税ボタン(スマホは min-width 44px)で数字がほぼ見えなくなる */}
                      <div className="col-span-2">
                        <Label className="text-xs">単価</Label>
                        <div className="flex items-center gap-0.5">
                          {/* CurrencyInput は className を内側の <input> に渡すため、
                              flex で伸ばすのはこの外側の div */}
                          <div className="min-w-0 flex-1">
                            <CurrencyInput value={item.unit_price} onChange={(v) => updateItem(idx, "unit_price", v)} />
                          </div>
                          <TaxHelperButton
                            fieldLabel="単価"
                            defaultIncludedAmount={item.unit_price}
                            onResult={(v) => updateItem(idx, "unit_price", v)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">期間（開始）</Label>
                        <Input type="date" value={item.period_start || ""} onChange={(e) => updateItem(idx, "period_start", e.target.value || null)} />
                      </div>
                      <div>
                        <Label className="text-xs">期間（終了）</Label>
                        <Input type="date" value={item.period_end || ""} onChange={(e) => updateItem(idx, "period_end", e.target.value || null)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">明細備考</Label>
                      <Textarea
                        value={item.item_notes || ""}
                        onChange={(e) => updateItem(idx, "item_notes", e.target.value || null)}
                        placeholder="PDFに表示される商品説明・利用条件など（改行で複数行）"
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
    </>
  );
}
