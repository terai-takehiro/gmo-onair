// ══════════════════════════════════════════════════
// 依頼
// ══════════════════════════════════════════════════
import { useState } from 'react';
import {
  AlertTriangle, Check, Clock, Loader2, MessageCircle, Trash2, Undo2, UserPlus, X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import {
  DELEGATION_LABELS, daysSinceRequested, formatDue,
  useAssignees, useMyDelegations, useRespondDelegation, useResolveDelegation,
  type MyTask,
} from '@/lib/tasksApi';
import { CellScoreBadge } from './CellScoreBadge';
import { TaskCommentsThread } from './TaskComments';

function ReceivedRow({ t, canEdit }: { t: MyTask; canEdit: boolean }) {
  const respond = useRespondDelegation();
  const [noteFor, setNoteFor] = useState<'declined' | 'consulting' | null>(null);
  const [note, setNote] = useState('');
  const unanswered = t.delegation_status === 'requested';

  return (
    <Card className={cn(unanswered && 'border-violet-200 bg-violet-50/40', t.is_overdue && 'border-red-200')}>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <CellScoreBadge score={t.priority_score} />
          {t.delegation_status && (
            <Badge variant="outline" className={cn('text-badge', unanswered && 'border-violet-300 text-violet-700')}>
              {DELEGATION_LABELS[t.delegation_status]}
            </Badge>
          )}
          {t.gls_number && <span className="text-badge rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{t.gls_number}</span>}
        </div>
        <p className="text-list mt-1">{t.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sub-sm text-muted-foreground">
          {t.requester_name && <span>{t.requester_name} さんから</span>}
          <span className={cn('flex items-center gap-0.5', t.is_overdue && 'font-bold text-red-700')}>
            <Clock className="h-3 w-3" />{formatDue(t.due_at)}{t.is_overdue ? '（期限超過）' : ''}
          </span>
        </p>
        {t.description && (
          <p className="mt-1.5 whitespace-pre-wrap rounded bg-muted/50 p-2 text-note text-muted-foreground">{t.description}</p>
        )}

        {canEdit && unanswered && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" className="h-8 gap-1 text-xs" disabled={respond.isPending}
                onClick={() => respond.mutate({ id: t.id, decision: 'accepted' })}>
                <Check className="h-3.5 w-3.5" />受ける
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                onClick={() => { setNoteFor('consulting'); setNote(''); }}
                title="依頼者に差し戻して相談します（消えません）">
                <MessageCircle className="h-3.5 w-3.5" />相談
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                onClick={() => { setNoteFor('declined'); setNote(''); }}
                title="依頼者に差し戻します（消えません）">
                <X className="h-3.5 w-3.5" />辞退
              </Button>
            </div>
            {noteFor && (
              <div className="mt-2 space-y-1.5 rounded-lg border border-border bg-muted/30 p-2">
                <Label className="text-th text-muted-foreground">
                  {noteFor === 'declined' ? '辞退の理由' : '相談したいこと'}（依頼者に差し戻されます）
                </Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={noteFor === 'declined' ? '例: 同じ期限で別の本番が入っています' : '例: 期限を1日ずらせますか'} />
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-8 text-xs" disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: t.id, decision: noteFor, note }, { onSuccess: () => setNoteFor(null) })}>
                    差し戻す
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setNoteFor(null)}>キャンセル</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* やり取りは description に混ぜず、コメントスレッドで残す (Phase 2 ⑤) */}
        <TaskCommentsThread taskId={t.id} canWrite={canEdit} />
      </CardContent>
    </Card>
  );
}

function SentRow({ t, canEdit }: { t: MyTask; canEdit: boolean }) {
  const resolve = useResolveDelegation();
  const { data: users } = useAssignees();
  const { currentUser } = useAuth();
  const [reassignTo, setReassignTo] = useState('');
  const bounced = t.delegation_status === 'declined' || t.delegation_status === 'consulting';
  const stale = t.delegation_status === 'requested' ? (daysSinceRequested(t.requested_at) ?? 0) : 0;

  return (
    <Card className={cn(bounced && 'border-amber-300 bg-amber-50/40', t.is_overdue && 'border-red-200')}>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <CellScoreBadge score={t.priority_score} />
          {t.delegation_status && (
            <Badge variant="outline" className={cn('text-badge', bounced && 'border-amber-400 text-amber-800')}>
              {bounced ? `差し戻し（${DELEGATION_LABELS[t.delegation_status]}）` : DELEGATION_LABELS[t.delegation_status]}
            </Badge>
          )}
          {t.gls_number && <span className="text-badge rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{t.gls_number}</span>}
        </div>
        <p className="text-list mt-1">{t.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sub-sm text-muted-foreground">
          <span>{t.assigned_to_name ?? '担当者不明'} さんへ</span>
          <span className={cn('flex items-center gap-0.5', t.is_overdue && 'font-bold text-red-700')}>
            <Clock className="h-3 w-3" />{formatDue(t.due_at)}{t.is_overdue ? '（期限超過）' : ''}
          </span>
        </p>

        {/* 滞留: 見たけれど答えない状態は依頼者側に見せて催促の判断をさせる (要件 D3) */}
        {stale >= 3 && (
          <p className="mt-1.5 flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-sub-sm text-amber-900">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {stale} 日間反応がありません。声をかけてください。
          </p>
        )}

        {t.description && (
          <p className="mt-1.5 whitespace-pre-wrap rounded bg-muted/50 p-2 text-note text-muted-foreground">{t.description}</p>
        )}

        {/* 差し戻しは依頼者が決着をつけるまで残る (消さない) */}
        {canEdit && bounced && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-background p-2">
            <p className="text-th text-foreground">この依頼をどうしますか</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: t.id, action: 'take_over' })}>
                <Undo2 className="h-3.5 w-3.5" />自分でやる
              </Button>
              {/* **相手を選ぶ select は「振り直す」より前。** 選ぶまでボタンは
                  押せない（`disabled={!reassignTo}`）ので、ボタンが先にあると
                  押せないものを先に触ってから戻ることになる
                  （`_form-order.md` 2-1「依存する欄は依存される欄より下」） */}
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">相手を選ぶ…</option>
                {(users ?? []).filter((u) => u.id !== currentUser?.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={resolve.isPending || !reassignTo}
                onClick={() => resolve.mutate({ id: t.id, action: 'reassign', assigned_to: reassignTo })}>
                <UserPlus className="h-3.5 w-3.5" />振り直す
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-destructive" disabled={resolve.isPending}
                onClick={async () => {
                  const ok = await confirmAction({
                    title: 'この依頼を取り下げますか',
                    description: t.title,
                    confirmLabel: '取り下げる',
                    tone: 'danger',
                  });
                  if (ok) resolve.mutate({ id: t.id, action: 'withdraw' });
                }}>
                <Trash2 className="h-3.5 w-3.5" />取り下げる
              </Button>
            </div>
          </div>
        )}

        {/* 出した側からも同じスレッドが見える (受け手の返答メモもここに入る) */}
        <TaskCommentsThread taskId={t.id} canWrite={canEdit} />
      </CardContent>
    </Card>
  );
}

export function DelegationsTab() {
  const { canEdit } = usePermissions();
  const [includeDone, setIncludeDone] = useState(false);
  const { data: received, isLoading: l1 } = useMyDelegations('received', includeDone);
  const { data: sent, isLoading: l2 } = useMyDelegations('sent', includeDone);

  if (l1 || l2) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => setIncludeDone((v) => !v)}
        className={cn('min-h-tap lg:h-9 lg:min-h-0 rounded-md px-3 py-1.5 text-sub', includeDone ? 'bg-primary/15 font-bold text-primary' : 'text-muted-foreground hover:bg-accent')}
      >
        完了した依頼も表示
      </button>

      <section>
        <h2 className="text-h2 mb-2">受けた依頼 <span className="text-muted-foreground">{(received ?? []).length}</span></h2>
        {(received ?? []).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sub text-muted-foreground">受けた依頼はありません。</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(received ?? []).map((t) => <ReceivedRow key={t.id} t={t} canEdit={canEdit} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-h2 mb-2">出した依頼 <span className="text-muted-foreground">{(sent ?? []).length}</span></h2>
        <p className="mb-2 text-note text-muted-foreground">
          指示をしたら完了させるまでが依頼者の仕事です。反応が無いものと差し戻されたものを上に出しています。
        </p>
        {(sent ?? []).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sub text-muted-foreground">出した依頼はありません。</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(sent ?? []).map((t) => <SentRow key={t.id} t={t} canEdit={canEdit} />)}
          </div>
        )}
      </section>
    </div>
  );
}
