/**
 * チーム — 件数だけ。中身は出さない（要件 D8）
 *
 * ── 作り直しで変えたこと ────────────────────────────────────
 *
 * ① **見て終わりにしない。** 誰が空いているかが分かっても、そこから配り直す道が
 *    無かった（別のタブへ移って相手を選び直す必要があった）。行の右に
 *    **「依頼する」**を置き、相手を決めた状態で依頼のダイアログを開く。
 * ② **色を状態のトークンに戻した。** `text-red-700` / `text-rose-700` /
 *    `text-violet-700` / `text-amber-700` の直書きをやめ、
 *    期限超過・最優先は `--destructive`、未返答は `--warning` にそろえる
 *    （4色を段の意味なしに使い分けていたので、どれが重いのか読めなかった）。
 */
import { Eye, Send } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTeamLoad } from '@/lib/tasksApi';

/** 件数の1マス。**0 は薄く**（読ませる数字ではない・端はそろえたままにする） */
function Count({ v, tone }: { v: number; tone?: string }) {
  return (
    <span className={cn('font-number text-sub', v === 0 ? 'text-fg-disabled' : tone ?? 'text-foreground')}>
      {v}
    </span>
  );
}

const COLUMNS: { key: string; label: string; title?: string }[] = [
  { key: 'open_count', label: '未対応' },
  { key: 'overdue_count', label: '期限超過' },
  { key: 'top_priority_count', label: '最優先', title: '重要度 高 × 緊急度 高（最優先）の未対応タスク数' },
  { key: 'unanswered_count', label: '未返答' },
  { key: 'no_due_count', label: '期限なし' },
  { key: 'private_count', label: '自分だけ' },
];

export function TeamTab({ onRequest, canEdit }: {
  /** その人を相手にして依頼のダイアログを開く */
  onRequest: (userId: string) => void;
  canEdit: boolean;
}) {
  const { data, isLoading } = useTeamLoad();
  if (isLoading) return <Delayed><SkeletonRows rows={5} /></Delayed>;
  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="メンバーがいません"
        description="日常業務の権限を持つ人がいると、ここに件数が出ます。"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* **見出しの副題と同じ文を繰り返さない。** ここに書くのは、
          見出しでは言っていない「自分だけ」の扱いだけ */}
      <p className="text-note flex items-start gap-1.5 text-muted-foreground">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        「自分だけ」に設定されたタスクも件数には入りますが、中身は出ません。
      </p>

      <div className="overflow-x-auto">
        <div className="flex min-w-[720px] flex-col overflow-hidden rounded-card border border-border bg-card">
          <RowHeader>
            <RowMain>メンバー</RowMain>
            {COLUMNS.map((c) => (
              <RowSlot key={c.key} w={72} align="right"><span title={c.title}>{c.label}</span></RowSlot>
            ))}
            <RowSlot w={128} placeholder="" />
          </RowHeader>

          {rows.map((r) => (
            <Row key={r.user_id} divider density="table">
              <RowMain><span className="text-list truncate">{r.user_name}</span></RowMain>
              <RowSlot w={72} align="right"><Count v={r.open_count} /></RowSlot>
              <RowSlot w={72} align="right"><Count v={r.overdue_count} tone="font-bold text-destructive" /></RowSlot>
              <RowSlot w={72} align="right"><Count v={r.top_priority_count} tone="font-bold text-destructive" /></RowSlot>
              <RowSlot w={72} align="right"><Count v={r.unanswered_count} tone="font-bold text-warning" /></RowSlot>
              <RowSlot w={72} align="right"><Count v={r.no_due_count} tone="text-warning" /></RowSlot>
              <RowSlot w={72} align="right"><Count v={r.private_count} /></RowSlot>
              <RowSlot w={128} align="right" placeholder="">
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => onRequest(r.user_id)}>
                    <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />依頼する
                  </Button>
                )}
              </RowSlot>
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}
