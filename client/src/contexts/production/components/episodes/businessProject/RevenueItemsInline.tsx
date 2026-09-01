/**
 * GPM の請求タブ — 売上明細のカードの中の「明細項目」（表示とインライン編集）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません**（段6）。
 * インデントも元のまま（差分を「移動しかしていない」と目で確かめられるようにするため）。
 *
 * ⚠️ **`key={idx}` はそのまま。** 安定した id に「直す」と、入力中のフォーカスと
 * 再マウントの挙動が変わります。
 *
 * ⚠️ **`useCallback` / `useMemo` を新しく足さないこと。** ここが読む
 * `inlineItems` や親の mutation は毎レンダー作り直されているから最新値を見ています。
 * 依存配列を付けると**古い値を掴んだまま動く**（見た目は動くので気づけない種類のバグ）。
 */
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { formatCurrency } from '@/lib/format';
import type { Revenue, RevenueItem } from './types';

export function RevenueItemsInline({
  rev, inlineEditId, inlineItems, inlineSaveMutation,
  startInlineEdit, cancelInlineEdit, addInlineItem, updateInlineItem, removeInlineItem,
}: {
  rev: Revenue;
  inlineEditId: string | null;
  inlineItems: RevenueItem[];
  inlineSaveMutation: { isPending: boolean; mutate: (v: { id: string; items: RevenueItem[] }) => void };
  startInlineEdit: (rev: Revenue) => void;
  cancelInlineEdit: () => void;
  addInlineItem: () => void;
  updateInlineItem: (idx: number, field: keyof RevenueItem, value: string | number) => void;
  removeInlineItem: (idx: number) => void;
}) {
  return (
    <>
                  {/* 明細項目: 表示 / インライン編集 (v2.8.104+) */}
                  {(rev.items && rev.items.length > 0) || inlineEditId === rev.id ? (
                    <div className="mt-3 border-t pt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-muted-foreground tracking-wide">明細項目</span>
                        {inlineEditId !== rev.id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => startInlineEdit(rev)}
                            title="明細項目をインラインで編集"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            明細を編集
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={cancelInlineEdit}
                              disabled={inlineSaveMutation.isPending}
                            >
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => inlineSaveMutation.mutate({ id: rev.id, items: inlineItems })}
                              disabled={inlineSaveMutation.isPending}
                            >
                              {inlineSaveMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : null}
                              保存
                            </Button>
                          </div>
                        )}
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-normal pb-1">項目</th>
                            <th className="text-right font-normal pb-1 w-16">数量</th>
                            <th className="text-right font-normal pb-1 w-24">単価</th>
                            <th className="text-right font-normal pb-1 w-24">金額</th>
                            {inlineEditId === rev.id && <th className="w-8"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {inlineEditId === rev.id
                            ? inlineItems.map((item, idx) => (
                                <tr key={idx} className="border-t border-dashed">
                                  <td className="py-1 pr-1">
                                    <Input
                                      value={item.description}
                                      onChange={(e) => updateInlineItem(idx, "description", e.target.value)}
                                      placeholder="項目名"
                                      className="h-7 text-xs"
                                    />
                                  </td>
                                  <td className="py-1 px-1">
                                    <Input
                                      type="number"
                                      min={1}
                                      value={item.quantity}
                                      onChange={(e) =>
                                        updateInlineItem(idx, "quantity", parseInt(e.target.value) || 0)
                                      }
                                      className="h-7 text-xs text-right"
                                    />
                                  </td>
                                  <td className="py-1 px-1">
                                    <div className="flex items-center gap-0.5">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={item.unit_price}
                                        onChange={(e) =>
                                          updateInlineItem(idx, "unit_price", parseInt(e.target.value) || 0)
                                        }
                                        className="h-7 text-xs text-right flex-1"
                                      />
                                      <TaxHelperButton
                                        fieldLabel="単価"
                                        defaultIncludedAmount={item.unit_price}
                                        onResult={(v) => updateInlineItem(idx, "unit_price", v)}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-1 text-right font-number font-medium tabular-nums">
                                    {formatCurrency(item.amount)}
                                  </td>
                                  <td className="py-1 pl-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => removeInlineItem(idx)}
                                      title="この行を削除"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            : rev.items!.map((item, idx) => (
                                <tr key={idx} className="border-t border-dashed">
                                  <td className="py-1">{item.description}</td>
                                  <td className="py-1 text-right font-number">{item.quantity}</td>
                                  <td className="py-1 text-right font-number">{formatCurrency(item.unit_price)}</td>
                                  <td className="py-1 text-right font-number font-medium">{formatCurrency(item.amount)}</td>
                                </tr>
                              ))}
                        </tbody>
                      </table>
                      {inlineEditId === rev.id && (
                        <div className="mt-2 flex items-center justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={addInlineItem}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            行追加
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            合計: <span className="font-number font-medium text-foreground">
                              {formatCurrency(inlineItems.reduce((s, it) => s + (it.amount || 0), 0))}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 border-t pt-2 flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-muted-foreground"
                        onClick={() => startInlineEdit(rev)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        明細項目を追加
                      </Button>
                    </div>
                  )}
    </>
  );
}
