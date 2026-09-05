/**
 * GPM の請求タブ — 仕入の一覧（月次ユニットに属さないぶん）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません**（段3）。
 * インデントも props への差し替え以外は元のままです（差分を「移動しかしていない」と
 * 目で確かめられるようにするため）。
 *
 * ⚠️ **出す・出さないの条件は親に残しています。** 子に `if (…) return null` を
 * 新しく作らないこと — **位置だけを動かす**のが分割の約束です。
 *
 * ⚠️ **按分されている行（`group_id` がある）は編集・削除のボタンを出しません。**
 * 元の実装のまま。
 *
 * ⚠️ **`confirm()` はそのまま残しています。** `check-ui-tokens` の `browser-dialog` は
 * アプリ単位の件数を数えるので、**書き換えても写しても件数が動いて検査が止まります**。
 * 置き換えるのは別の回に、まとめて。
 */
import { Plus, Pencil, Trash2, ShoppingCart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Purchase } from './types';

export function PurchaseList({
  monthlyMode, isEstimateMode, purchasesLoading, flatPurchases,
  openNewPurchase, openEditPurchase, deletePurMutation,
}: {
  monthlyMode: boolean;
  isEstimateMode?: boolean;
  purchasesLoading: boolean;
  flatPurchases: Purchase[];
  openNewPurchase: () => void;
  openEditPurchase: (pu: Purchase) => void;
  /** 削除。親の mutation をそのまま渡す（`.mutate(id)` を呼ぶ形も元のまま） */
  deletePurMutation: { mutate: (id: string) => void };
}) {
  return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            {monthlyMode ? "その他の仕入（月次外）" : "仕入一覧"}
          </h2>
          {!isEstimateMode && (
            <Button size="sm" onClick={openNewPurchase}>
              <Plus className="h-4 w-4 mr-1" />
              仕入追加
            </Button>
          )}
        </div>

        {purchasesLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : flatPurchases.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              {monthlyMode ? "月ぶんの請求に入らない仕入はありません。月締めの仕入は上の「月次管理」から追加します。" : "まだ仕入がありません。上の「追加」から登録します。"}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {flatPurchases.map((pu) => (
              <Card key={pu.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">
                        {pu.description || "（説明なし）"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {pu.vendor_name}
                        {pu.recognition_date && ` / ${formatDate(pu.recognition_date)}`}
                      </div>
                      {pu.group_name && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          按分: {pu.group_name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {pu.allocated_amount != null && pu.allocated_amount !== pu.amount ? (
                          <>
                            <span className="font-number text-lg font-bold">{formatCurrency(pu.allocated_amount)}</span>
                            <div className="text-xs text-muted-foreground">
                              全体 {formatCurrency(pu.amount)}
                            </div>
                          </>
                        ) : (
                          <span className="font-number text-lg font-bold">{formatCurrency(pu.amount)}</span>
                        )}
                      </div>
                      {!pu.group_id && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="この仕入を編集" title="この仕入を編集" onClick={() => openEditPurchase(pu)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="この仕入を削除" title="この仕入を削除" onClick={() => {
                            if (confirm("この仕入を削除しますか？")) deletePurMutation.mutate(pu.id);
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
}
