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
  items, actions, onSeeAll,
}: {
  items: ActivityLogRow[];
  actions: ReturnType<typeof useNextActionActions>;
  /**
   * 5件を超える分の行き先。**渡すと「すべて見る」を出す**（`OverviewTab.tsx`
   * の「すべて見る（N件）」と同じ考え方 — 見出しの件数と描画件数を必ず一致させる）。
   * 未指定なら見出しは描画した件数（最大5）を出す。
   */
  onSeeAll?: () => void;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 5);
  const hasMore = items.length > shown.length;
  return (
    <div className="rounded-card border border-warning-border bg-warning-surface p-3.5">
      <p className="flex flex-wrap items-center justify-between gap-1.5 text-sub font-bold text-warning">
        <span className="flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          次のアクション予定（{shown.length}件）
        </span>
        {hasMore && onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-note min-h-tap font-normal text-primary hover:underline lg:min-h-0"
          >
            すべて見る（{items.length}件）
          </button>
        )}
      </p>
      <ul className="mt-2 space-y-1.5">
        {shown.map((a) => {
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
