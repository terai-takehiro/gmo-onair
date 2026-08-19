/**
 * 費用を分け合うグループの売上（分けて計上）一覧 (v4)
 */
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import type { Allocation, GroupRevenue } from './types';

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

export function RevenueSection({
  revenues, canEdit, canDelete, onAdd, onEdit, onDelete,
}: {
  revenues: GroupRevenue[];
  canEdit: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (rev: GroupRevenue) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-cardtitle flex items-center gap-2 font-bold">
          <FileText className="h-4 w-4" aria-hidden="true" />
          グループ売上（分けて計上）
        </h2>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />売上追加
          </Button>
        )}
      </div>

      {revenues.length === 0 ? (
        <EmptyState title="グループ売上がありません" description="複数案件にまたがる売上を登録すると、案件ごとに金額を分けて計上します。" />
      ) : (
        revenues.map((rev) => (
          <div key={rev.id} className="rounded-card border border-border p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-number text-sub font-bold">{rev.billing_key}</span>
                  {rev.subtitle && <span className="text-sub">{rev.subtitle}</span>}
                  <TableBadge label={rev.status === 'estimate' ? '見積' : '確定'} w={null} />
                </div>
                <div className="text-note mt-0.5 text-muted-foreground">
                  {rev.customer_name}
                  {rev.recognition_date && ` ・ ${formatDate(rev.recognition_date)}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Money value={rev.amount} className="text-cardtitle font-bold" />
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(rev)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={async () => {
                          if (!(await confirmAction({
                            title: 'この売上を削除しますか？',
                            description: '分けた額の内訳も一緒に消えます。',
                            confirmLabel: '削除する', tone: 'danger',
                          }))) return;
                          onDelete(rev.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {rev.items.length > 0 && (
              <div className="mt-2 space-y-0.5 border-t border-border-faint pt-2">
                {rev.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sub text-secondary-foreground">
                    <span className="truncate">{item.description}（{item.quantity} × <Money value={item.unit_price} />）</span>
                    <Money value={item.amount} className="shrink-0 font-bold" />
                  </div>
                ))}
              </div>
            )}
            <AllocationBreakdown allocations={rev.allocations} />
          </div>
        ))
      )}
    </div>
  );
}
