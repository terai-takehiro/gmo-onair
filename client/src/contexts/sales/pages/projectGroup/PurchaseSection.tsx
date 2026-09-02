/**
 * 費用を分け合うグループの仕入（分けて計上）一覧 (v4)
 */
import { Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import type { Allocation, GroupPurchase } from './types';

function AllocationBreakdown({ allocations }: { allocations: Allocation[] }) {
  if (allocations.length === 0) return null;
  return (
    <div className="mt-2 space-y-0.5 border-t border-border-faint pt-2">
      <p className="text-note mb-1 font-bold text-muted-foreground">分けた額の内訳</p>
      {allocations.map((a, i) => (
        <div key={i} className="flex items-center justify-between text-sub">
          <span className="truncate text-secondary-foreground">{a.gls_number} {a.project_name}</span>
          <Money value={a.allocated_amount} className="shrink-0 font-bold" />
        </div>
      ))}
    </div>
  );
}

export function PurchaseSection({
  purchases, canEdit, canDelete, onAdd, onEdit, onDelete,
}: {
  purchases: GroupPurchase[];
  canEdit: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (pu: GroupPurchase) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-cardtitle flex items-center gap-2 font-bold">
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          グループ仕入（分けて計上）
        </h2>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />仕入追加
          </Button>
        )}
      </div>

      {purchases.length === 0 ? (
        <EmptyState title="グループ仕入がありません" description="複数案件にまたがる仕入を登録すると、案件ごとに金額を分けて計上します。" />
      ) : (
        purchases.map((pu) => (
          <div key={pu.id} className="rounded-card border border-border p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{pu.description || '（説明なし）'}</div>
                <div className="text-note text-muted-foreground">{pu.vendor_name}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Money value={pu.amount} className="text-cardtitle font-bold" />
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="この仕入を編集" title="この仕入を編集" onClick={() => onEdit(pu)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        aria-label="この仕入を削除" title="この仕入を削除"
                        onClick={async () => {
                          if (!(await confirmAction({
                            title: 'この仕入を削除しますか？',
                            description: '分けた額の内訳も一緒に消えます。',
                            confirmLabel: '削除する', tone: 'danger',
                          }))) return;
                          onDelete(pu.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <AllocationBreakdown allocations={pu.allocations} />
          </div>
        ))
      )}
    </div>
  );
}
