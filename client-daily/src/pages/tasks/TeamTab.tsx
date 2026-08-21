// ══════════════════════════════════════════════════
// チーム — 件数だけ。中身は出さない (要件 D8)
// ══════════════════════════════════════════════════
import { Eye, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTeamLoad } from '@/lib/tasksApi';

function Num({ v, tone }: { v: number; tone?: string }) {
  return (
    <td className={cn('px-2 py-2 text-right font-number tabular-nums', v === 0 ? 'text-muted-foreground/50' : tone)}>
      {v}
    </td>
  );
}

export function TeamTab() {
  const { data, isLoading } = useTeamLoad();
  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  const rows = data ?? [];

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-1.5 text-note text-muted-foreground">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        誰が溢れているかを見て仕事を配り直すための画面です。件数だけを出し、タスクの内容は表示しません
        （「自分だけ」に設定されたタスクも件数には入りますが中身は出ません）。
      </p>
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sub text-muted-foreground">メンバーがいません。</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sub">
            <thead>
              <tr className="border-b border-border text-left text-th text-muted-foreground">
                <th className="py-2 pr-2">メンバー</th>
                <th className="px-2 py-2 text-right">未完了</th>
                <th className="px-2 py-2 text-right">期限超過</th>
                <th className="px-2 py-2 text-right">スコア 9</th>
                <th className="px-2 py-2 text-right">未返答の依頼</th>
                <th className="px-2 py-2 text-right">期限なし</th>
                <th className="px-2 py-2 text-right">自分だけ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b border-border/60">
                  <td className="text-list py-2 pr-2">{r.user_name}</td>
                  <Num v={r.open_count} />
                  <Num v={r.overdue_count} tone={r.overdue_count > 0 ? 'text-red-700' : undefined} />
                  <Num v={r.top_priority_count} tone={r.top_priority_count > 0 ? 'text-rose-700' : undefined} />
                  <Num v={r.unanswered_count} tone={r.unanswered_count > 0 ? 'text-violet-700' : undefined} />
                  <Num v={r.no_due_count} tone={r.no_due_count > 0 ? 'text-amber-700' : undefined} />
                  <Num v={r.private_count} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
