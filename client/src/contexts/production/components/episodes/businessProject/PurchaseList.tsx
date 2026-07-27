// ビジネス案件ビューの「仕入一覧」 — v2.9.293 で BusinessProjectView.tsx から切り出し。
// **JSX は 1 行も変えていない**（props 経由に置き換えただけ）。
import { Loader2, Plus, ShoppingCart, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/format';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import type { Purchase } from './types';

export default function PurchaseList({
  monthlyMode, isEstimateMode, purchasesLoading, flatPurchases,
  openNewPurchase, openEditPurchase, deletePurMutation,
}: {
  monthlyMode: boolean;
  isEstimateMode?: boolean;
  purchasesLoading: boolean;
  flatPurchases: Purchase[];
  openNewPurchase: () => void;
  openEditPurchase: (p: Purchase) => void;
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
              {monthlyMode ? "月次以外の仕入はありません。月締めの仕入は上の「月次管理」から追加します。" : "仕入データがありません"}
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPurchase(pu)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
                            if ((await confirmAction({ title: "この仕入を削除しますか？", confirmLabel: '削除する', tone: 'danger' }))) deletePurMutation.mutate(pu.id);
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
