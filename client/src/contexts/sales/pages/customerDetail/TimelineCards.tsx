/**
 * お客様の詳細（顧客360）— やり取りの履歴（スマホ・カード積み） (v4)
 *
 * PC の行（`TimelineRows.tsx`）を縮めたものではなく、**1件＝1枚のカード**として
 * 組み直してある（`company/CompanyCards.tsx` と同じ考え方）。375px では
 * 活動日・種別・件名・本文・次回アクションの5つを1行に並べる余地が無く、
 * 縮めると種別バッジと日付だけが読めて本文が潰れる。
 */
import { getActivityType } from '../activityLog/kinds';
import { AiCreatedBadge, ProvenanceChips } from '../activityLog/Badges';
import { NextActionInline } from '../activityLog/ActivityRows';
import type { useNextActionActions } from '../activityLog/useNextActionActions';
import type { CustomerActivity } from './types';

type Actions = ReturnType<typeof useNextActionActions>;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function TimelineCards({
  items, actions, onOpenProject,
}: {
  items: CustomerActivity[];
  actions: Actions;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {items.map((a) => {
        const at = getActivityType(a.activity_type);
        return (
          <li key={a.id}>
            <div className={`rounded-card flex flex-col gap-1.5 border border-border-subtle p-3.5 ${a.is_ai_created ? 'bg-ai-surface' : 'bg-card'}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-badge shrink-0 rounded-badge-xs px-1.5 py-0.5 font-bold ${at.color}`}>
                  {at.label}
                </span>
                <span className="font-number text-sub-sm text-muted-foreground">{shortDate(a.activity_date)}</span>
                {a.is_ai_created && <AiCreatedBadge requestedBy={a.ai_requested_by} />}
              </div>

              <p className="text-list text-foreground">{a.subject}</p>

              {a.project_name && (
                <button
                  type="button"
                  className="min-h-tap -my-1 w-fit text-sub-sm text-primary"
                  onClick={() => a.project_id && onOpenProject(a.project_id)}
                >
                  {a.project_gls ? `${a.project_gls} ` : ''}{a.project_name}
                </button>
              )}

              {a.description && (
                <p className="text-sub line-clamp-3 whitespace-pre-line text-muted-foreground">{a.description}</p>
              )}

              {(a.source_channel || a.message_id || a.ai_requested_by) && (
                <ProvenanceChips log={a} />
              )}

              {a.user_name && <p className="text-sub-sm text-muted-foreground">記録: {a.user_name}</p>}

              {a.next_action && (
                <div className="border-t border-border-faint pt-1.5">
                  <NextActionInline row={a} actions={actions} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
