/**
 * お客様の詳細（顧客360）— やり取りの履歴（PC・行表示） (v4)
 *
 * `activityLog/ActivityRows.tsx`（営業活動記録の一覧）と**列の考え方を同じ**にしてある
 * （活動日 96px ／ 種別 72px ／ 本文は伸びる `RowMain`）。ここは特定の1社の中に
 * 既にいるので、`ActivityRows` が持つ「案件・顧客のひも付け」列は**案件名だけ**に絞り、
 * 代わりに **やり取り本文（`description`）を出す**（あちらには無い） — 顧客360は
 * 「この会社と今どうなっているか」を読みに来る画面なので、件名だけでは文脈が戻せない。
 *
 * バッジ・由来チップ・次回アクションの片づけ（完了／延期）は
 * `activityLog/` の部品をそのまま呼ぶ（写すと画面ごとに挙動がずれる）。
 */
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { getActivityType } from '../activityLog/kinds';
import { AiCreatedBadge, ProvenanceChips } from '../activityLog/Badges';
import { NextActionInline } from '../activityLog/ActivityRows';
import type { useNextActionActions } from '../activityLog/useNextActionActions';
import type { CustomerActivity } from './types';

type Actions = ReturnType<typeof useNextActionActions>;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** `YYYY-MM-DD` → `8/2(水)`（`activityLog/types.ts` の `shortDate` と同じ形） */
function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function TimelineRows({
  items, actions, onOpenProject,
}: {
  items: CustomerActivity[];
  /** 完了・延期の口。**未指定ならボタンを出さない**（`sales` の editor が無い人・`NextActionInline` と同じ約束） */
  actions?: Actions;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {items.map((a) => {
        const at = getActivityType(a.activity_type);
        return (
          <Row key={a.id} divider align="start" className={a.is_ai_created ? 'bg-ai-surface' : undefined}>
            <RowSlot w={96}>
              <span className="font-number text-sub-sm">{shortDate(a.activity_date)}</span>
            </RowSlot>

            <RowSlot w={72}>
              <TableBadge label={at.label} w={null} className={at.color} />
            </RowSlot>

            <RowMain>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <RowTitle className="flex-1">{a.subject}</RowTitle>
                {a.is_ai_created && <AiCreatedBadge requestedBy={a.ai_requested_by} />}
              </div>
              <RowSub>
                {a.project_name ? (
                  <button
                    type="button"
                    className="hover:text-primary hover:underline"
                    onClick={() => a.project_id && onOpenProject(a.project_id)}
                  >
                    {a.project_gls ? `${a.project_gls} ` : ''}{a.project_name}
                  </button>
                ) : (
                  '案件のひも付けなし'
                )}
                {a.user_name ? ` ・ ${a.user_name}` : ''}
              </RowSub>
              {a.description && (
                <p className="text-sub mt-0.5 line-clamp-2 whitespace-pre-line text-muted-foreground">
                  {a.description}
                </p>
              )}
              {(a.source_channel || a.message_id || a.ai_requested_by) && (
                <div className="mt-1"><ProvenanceChips log={a} /></div>
              )}
              {a.next_action && <div className="mt-1"><NextActionInline row={a} actions={actions} /></div>}
            </RowMain>
          </Row>
        );
      })}
    </div>
  );
}
