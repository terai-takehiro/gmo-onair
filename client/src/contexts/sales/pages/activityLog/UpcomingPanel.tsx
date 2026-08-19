/**
 * 次回アクション予定の帯 (v4)
 *
 * 案件一覧・料金表など v4 の他画面と同じ「警告の帯」（`warning-surface` /
 * `warning-border`）にした。旧実装は `border-orange-200 bg-orange-50` の
 * 生の色で、この画面だけ別の橙だった。
 *
 * **この帯からも完了・延期ができる**（この回で追加。`useNextActionActions.ts` 参照）。
 * 旧実装は件名を並べるだけで、片づけるには一覧まで探しに行く必要があった。
 */
import { AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { relatedName, shortDate, isOverdue, type ActivityLogRow } from './types';
import type { useNextActionActions } from './useNextActionActions';

export function UpcomingPanel({
  items, actions,
}: {
  items: ActivityLogRow[];
  actions: ReturnType<typeof useNextActionActions>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-card border border-warning-border bg-warning-surface p-3.5">
      <p className="flex items-center gap-1.5 text-sub font-bold text-warning">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        次回アクション予定（{items.length}件）
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 5).map((a) => {
          const overdue = a.next_action_date ? isOverdue(a.next_action_date) : false;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-sub">
              <TableBadge
                label={overdue ? `超過 ${shortDate(a.next_action_date!)}` : shortDate(a.next_action_date!)}
                w={null}
                className={overdue ? 'border-transparent bg-destructive-surface text-destructive' : 'border-transparent bg-card text-secondary-foreground'}
              />
              <span className="min-w-0 flex-1 truncate font-bold">{a.next_action}</span>
              {relatedName(a) && (
                <span className="shrink-0 truncate text-muted-foreground">— {relatedName(a)}</span>
              )}
              <Button
                size="sm" variant="outline" className="shrink-0 px-2 text-xs"
                disabled={actions.isPending}
                onClick={() => actions.complete(a.id)}
              >
                <Check className="mr-0.5 h-3 w-3" aria-hidden="true" />完了
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
