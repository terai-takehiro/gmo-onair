/**
 * 営業活動記録の行 (v4)
 *
 * 列（`docs/design/v4/_rules.md`「1. 縦の整列」の7段に寄せた）:
 *
 *   活動日   96px (`RowSlot`)
 *   種別     72px (`RowSlot` + `TableBadge`)
 *   件名 ／ 案件・顧客 ／ 次回アクション   伸びる (`RowMain`)
 *   担当     96px (`RowSlot`・スマホでは落とす)
 *
 * **次回アクションは列にしていません。** 文字数が案件ごとに大きく違ううえ、
 * 「完了」「延期」のボタンまで持つので、固定幅の枠に押し込むと文字が切れます。
 * `RowMain` の3行目に置き、PC・スマホの両方で同じ形にしてあります
 * （固定列は `hideOnMobile` で落とせますが、`RowMain` の中身はスマホでも
 * 全部読めるべき「今すぐ片づけられるもの」なので落としません）。
 *
 * **活動の種別バッジは今までどおり生の色**（`kinds.ts` の `color`）です。
 * `cat-1`〜`cat-8`（見分けの色トークン）は v4 で用意されていますが、
 * どの画面もまだ使っておらず、8色に対して種別が9つあるうえ `check-contrast-tokens.mjs`
 * が確かめる「塗り前提の色」にも入っていません。ここで最初に採用してコントラストや
 * 割り当てを決め打ちするより、生の色（既存の債務・件数は増やさない）を残すほうが安全です。
 */
import { useState } from 'react';
import { Clock, Check } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Button } from '@/components/ui/button';
import { getActivityType } from './kinds';
import { AiCreatedBadge, ProvenanceChips } from './Badges';
import { relatedName, shortDate, isOverdue, type ActivityLogRow } from './types';
import type { useNextActionActions } from './useNextActionActions';

type Actions = ReturnType<typeof useNextActionActions>;

/**
 * 次回アクション1行。**完了は即実行、延期は「明日／1週間」を選んでから実行**（顧客360°ビューと同じ形）
 *
 * **`export` して顧客360°ビュー（`customerDetail/`）からも呼ぶ。** 写すと、
 * 完了・延期の片づけ方が画面によって変わる（先に `顧客360°ビュー` が使っていた形に
 * この一覧側を合わせた経緯があるので、ここが更新の起点であるべき）。
 * `row` は `Pick` にしてある — 顧客360°ビューが持つ行には
 * `duration_minutes` 等の列が無いため、フル `ActivityLogRow` を要求すると渡せない。
 */
export function NextActionInline({
  row, actions,
}: {
  row: Pick<ActivityLogRow, 'id' | 'next_action' | 'next_action_date' | 'next_action_done_at'>;
  actions: Actions;
}) {
  const [postponing, setPostponing] = useState(false);
  const done = !!row.next_action_done_at;
  const overdue = !done && !!row.next_action_date && isOverdue(row.next_action_date);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sub">
      {done ? (
        <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          <span className="truncate line-through">{row.next_action}</span>
          <span className="shrink-0 text-sub-sm">対応済み</span>
        </span>
      ) : (
        <>
          <span className={`inline-flex min-w-0 items-center gap-1.5 ${overdue ? 'text-destructive' : 'text-foreground'}`}>
            <Clock className={`h-3.5 w-3.5 shrink-0 ${overdue ? 'text-destructive' : 'text-warning'}`} aria-hidden="true" />
            <span className={`shrink-0 text-sub-sm font-bold ${overdue ? 'text-destructive' : 'text-warning'}`}>
              次回{row.next_action_date ? ` ${shortDate(row.next_action_date)}` : ''}{overdue ? '（期限超過）' : ''}
            </span>
            <span className="truncate">{row.next_action}</span>
          </span>
          {/* 行を開かなくても片づけられる。**押下は行の onClick に伝えない** */}
          <span className="inline-flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm" variant="outline" className="px-2 text-xs"
              disabled={actions.isPending}
              onClick={() => actions.complete(row.id)}
            >
              完了
            </Button>
            {postponing ? (
              <>
                <Button size="sm" variant="ghost" className="px-1.5 text-xs" onClick={() => { actions.postponeTomorrow(row.id); setPostponing(false); }}>明日</Button>
                <Button size="sm" variant="ghost" className="px-1.5 text-xs" onClick={() => { actions.postponeWeek(row.id); setPostponing(false); }}>1週間</Button>
                <Button size="sm" variant="ghost" className="px-1.5 text-xs" onClick={() => setPostponing(false)}>×</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="px-2 text-xs" onClick={() => setPostponing(true)}>延期</Button>
            )}
          </span>
        </>
      )}
    </div>
  );
}

export function ActivityRows({
  rows, actions, onOpen,
}: {
  rows: ActivityLogRow[];
  actions: Actions;
  onOpen: (row: ActivityLogRow) => void;
}) {
  return (
    <>
      <RowHeader className="hidden sm:flex">
        <RowSlot w={96}>活動日</RowSlot>
        <RowSlot w={72}>種別</RowSlot>
        <RowMain>件名</RowMain>
        <RowSlot w={96}>担当</RowSlot>
      </RowHeader>

      {rows.map((row) => {
        const at = getActivityType(row.activity_type);
        return (
          <Row
            key={row.id}
            divider
            interactive
            stackOnMobile
            align="start"
            className={row.is_ai_created ? 'bg-ai-surface' : undefined}
            onClick={() => onOpen(row)}
          >
            <RowSlot w={96}>
              <span className="font-number text-sub-sm">{shortDate(row.activity_date)}</span>
            </RowSlot>

            <RowSlot w={72}>
              <TableBadge label={at.label} w={null} className={at.color} />
            </RowSlot>

            <RowMain>
              <div className="flex min-w-0 items-center gap-1.5">
                <RowTitle className="flex-1">{row.subject}</RowTitle>
                {row.is_ai_created && <AiCreatedBadge requestedBy={row.ai_requested_by} />}
              </div>
              <RowSub>
                {relatedName(row) ?? '案件・顧客のひも付けなし'}
                <span className="sm:hidden">{row.user_name ? ` ・ ${row.user_name}` : ''}</span>
              </RowSub>
              {(row.source_channel || row.message_id || row.ai_requested_by) && (
                <div className="mt-1"><ProvenanceChips log={row} /></div>
              )}
              {row.next_action && <NextActionInline row={row} actions={actions} />}
            </RowMain>

            <RowSlot w={96} hideOnMobile>
              {row.user_name && <span className="truncate text-sub text-secondary-foreground">{row.user_name}</span>}
            </RowSlot>
          </Row>
        );
      })}
    </>
  );
}
