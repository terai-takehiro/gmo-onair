// スコア順リスト・9マスボードの選んだマスが共有する1行分のカード。
import { Check, Clock, EyeOff, Pencil, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CELL_ACTION, DELEGATION_LABELS, formatDue, LEVEL_LABELS, useUpdateTask, type MyTask } from '@/lib/tasksApi';
import { CellScoreBadge } from './CellScoreBadge';

export function TaskRow({ t, canEdit, canOpenProject, onEdit }: {
  t: MyTask; canEdit: boolean; canOpenProject: boolean; onEdit: () => void;
}) {
  const update = useUpdateTask();
  return (
    <Card className={cn(t.is_completed && 'opacity-60', t.is_overdue && 'border-red-200')}>
      <CardContent className="flex items-start gap-2.5 p-3">
        {canEdit && (
          <button
            onClick={() => update.mutate({ id: t.id, patch: { is_completed: !t.is_completed } })}
            disabled={update.isPending}
            className={cn(
              'v4-tap mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
              t.is_completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40 hover:border-primary'
            )}
            title={t.is_completed ? '未完了に戻す' : '完了にする'}
          >
            {t.is_completed && <Check className="h-3.5 w-3.5" />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CellScoreBadge score={t.priority_score} />
            <span className="text-sub-sm text-muted-foreground">{CELL_ACTION[t.priority_cell]}</span>
            {t.gls_number && (
              canOpenProject ? (
                <a
                  href={`/sales/projects/${t.project_id}`}
                  className="text-badge rounded bg-muted px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:underline"
                  title={t.project_name ?? undefined}
                >
                  {t.gls_number}
                </a>
              ) : (
                <span className="text-badge rounded bg-muted px-1.5 py-0.5 text-muted-foreground" title={t.project_name ?? undefined}>
                  {t.gls_number}
                </span>
              )
            )}
            {t.requester_id && t.delegation_status && (
              <Badge variant="outline" className="text-badge">
                {DELEGATION_LABELS[t.delegation_status]}
              </Badge>
            )}
            {t.visibility === 'private' && (
              <span className="text-badge inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                <EyeOff className="h-3 w-3" />自分だけ
              </span>
            )}
            {t.source?.startsWith('intake') && (
              <span className="text-badge inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-violet-700">
                <Sparkles className="h-3 w-3" />AI作成
              </span>
            )}
          </div>
          <p className={cn('text-list mt-1', t.is_completed && 'line-through')}>{t.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sub-sm text-muted-foreground">
            <span className={cn('flex items-center gap-0.5', t.is_overdue && 'font-bold text-red-700')}>
              <Clock className="h-3 w-3" />{formatDue(t.due_at)}{t.is_overdue ? '（期限超過）' : ''}
            </span>
            <span>重要 {LEVEL_LABELS[t.importance]} × 緊急 {LEVEL_LABELS[t.urgency]}</span>
            {t.requester_name && <span>{t.requester_name} さんから</span>}
          </p>
        </div>
        {canEdit && (
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onEdit} title="編集">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
