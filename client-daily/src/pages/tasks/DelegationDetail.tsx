/**
 * 依頼の詳細 — **選んだ1件だけ**を出すパネル（PC は右・スマホはシートの中身）
 *
 * 一覧（`DelegationList`）が「どれを開くか」を選ぶ場所なのに対して、
 * ここは**読む・返す・決める**場所。本文・やり取り・操作はこの1か所にしか出さない。
 *
 * ── 操作は「いま自分が押せるもの」だけ出す ──────────────────
 *
 * | 立場 | 段 | 出す操作 |
 * | --- | --- | --- |
 * | 受け手 | 未返答 | 承諾する ／ 相談する ／ 辞退する（相談・辞退は理由が要る） |
 * | 受け手 | 承諾 | **対応済にする** — 作り直す前はこれが依頼タブに無く、承諾したあと
 * |        |      | マイタスクへ移らないと片づけられなかった |
 * | 依頼者 | 差し戻し | 自分が担当する ／ 担当者を変更 ／ 取り下げる（決めるまで消えない・要件 D3） |
 * | 依頼者 | 未返答 | 操作は無い。3日以上返事が無いときだけ催促の案内を出す |
 *
 * 差し戻しの理由は `task_comments` に `[辞退] …` の形で入る（サーバー側の仕様）ので、
 * **専用の欄を作らず「やり取り」に出す**。2か所に同じ文が出ると、どちらが正か分からない。
 */
import { useState } from 'react';
import { AlertTriangle, Check, MessageCircle, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { TaskDoneButton } from '@gmo-onair/shared/src/client-v4/taskDoneButton';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  BUCKET_LABELS, CELL_ACTION, LEVEL_LABELS, daysSinceRequested, delegationBucket, formatDueLong,
  useAssignees, useResolveDelegation, useRespondDelegation, useUpdateTask, type MyTask,
} from '@/lib/tasksApi';
import { TaskCommentsThread } from './TaskComments';

/** 反応が無いまま何日で催促の案内を出すか（要件 D3。一覧の印と同じ日数） */
const STALE_DAYS = 3;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-th w-[72px] shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      <span className="text-sub min-w-0 flex-1">{children}</span>
    </div>
  );
}

/** 相談・辞退の理由を書く欄。**理由なしでは差し戻せない**（相手が次に何をすべきか決まらない） */
function BounceForm({ kind, pending, onSubmit, onCancel, requesterName }: {
  kind: 'declined' | 'consulting';
  pending: boolean;
  onSubmit: (note: string) => void;
  onCancel: () => void;
  requesterName: string;
}) {
  const [note, setNote] = useState('');
  const label = kind === 'declined' ? '辞退の理由' : '相談したいこと';
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-3">
      <Label className="text-th text-muted-foreground">
        {label}（{requesterName} さんに差し戻されます）
      </Label>
      <Textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={kind === 'declined' ? '例: 同じ期限で別の本番が入っています' : '例: 期限を1日ずらせますか'}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !note.trim()} onClick={() => onSubmit(note.trim())}>差し戻す</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>キャンセル</Button>
      </div>
      <p className="text-note text-muted-foreground">
        依頼は消えません。{requesterName} さんが「自分が担当する ／ 担当者を変更 ／ 取り下げる」を決めるまで残ります。
      </p>
    </div>
  );
}

/**
 * いま出せる操作があるか。**枠を出す前に判定する** — 空の枠を出すと
 * 罫線だけの帯が本文とやり取りの間に残る。
 */
function hasActions(t: MyTask, direction: 'received' | 'sent'): boolean {
  const bucket = delegationBucket(t);
  if (direction === 'received') return bucket === 'requested' || bucket === 'accepted';
  if (bucket === 'bounced') return true;
  return bucket === 'requested' && (daysSinceRequested(t.requested_at) ?? 0) >= STALE_DAYS;
}

/** 受け手の操作。未返答は3択、承諾済は「対応済にする」 */
function ReceivedActions({ t }: { t: MyTask }) {
  const respond = useRespondDelegation();
  const update = useUpdateTask();
  const [bounce, setBounce] = useState<'declined' | 'consulting' | null>(null);
  const bucket = delegationBucket(t);
  const requesterName = t.requester_name ?? '依頼者';

  if (bucket === 'accepted') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-th text-muted-foreground">この依頼を片づけますか</p>
        <TaskDoneButton
          done={false}
          taskTitle={t.title}
          disabled={update.isPending}
          onToggle={() => update.mutate({ id: t.id, patch: { is_completed: true } })}
        />
        <p className="text-note text-muted-foreground">
          対応済にすると {requesterName} さんの「出した依頼」でも完了として見えます。
        </p>
      </div>
    );
  }
  if (bucket !== 'requested') return null;

  if (bounce) {
    return (
      <BounceForm
        kind={bounce}
        pending={respond.isPending}
        requesterName={requesterName}
        onCancel={() => setBounce(null)}
        onSubmit={(note) => respond.mutate({ id: t.id, decision: bounce, note }, { onSuccess: () => setBounce(null) })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-th text-muted-foreground">この依頼にどう返しますか</p>
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1" disabled={respond.isPending}
          onClick={() => respond.mutate({ id: t.id, decision: 'accepted' })}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />承諾する
        </Button>
        <Button variant="outline" onClick={() => setBounce('consulting')}>
          <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />相談する
        </Button>
        <Button variant="outline" onClick={() => setBounce('declined')}>
          <X className="mr-1.5 h-4 w-4" aria-hidden="true" />辞退する
        </Button>
      </div>
      <p className="text-note text-muted-foreground">
        相談・辞退を選ぶと理由を書く欄が出ます。依頼は消えず、{requesterName} さんに差し戻されます。
      </p>
    </div>
  );
}

/** 依頼者の操作。差し戻されたものを決着させる（要件 D3） */
function SentActions({ t }: { t: MyTask }) {
  const resolve = useResolveDelegation();
  const { data: users } = useAssignees();
  const { currentUser } = useAuth();
  const [reassignTo, setReassignTo] = useState('');
  const bucket = delegationBucket(t);
  const stale = bucket === 'requested' ? (daysSinceRequested(t.requested_at) ?? 0) : 0;

  if (bucket === 'requested') {
    if (stale < STALE_DAYS) return null;
    return (
      <p className="text-sub flex items-start gap-2 rounded-card border border-warning-border bg-warning-surface px-3 py-2 text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {stale} 日間 返事がありません。{t.assigned_to_name ?? '相手'} さんに声をかけてください。
      </p>
    );
  }
  if (bucket !== 'bounced') return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-th text-muted-foreground">この依頼をどうしますか</p>
      <Button variant="outline" className="justify-start" disabled={resolve.isPending}
        onClick={() => resolve.mutate({ id: t.id, action: 'take_over' })}>
        <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />自分が担当する
      </Button>
      {/* **相手を選ぶ欄はボタンより上。** 選ぶまでボタンは押せないので、
          ボタンが先にあると押せないものを先に触ってから戻ることになる
          （`docs/design/v4/_form-order.md` 2-1「依存する欄は依存される欄より下」） */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={reassignTo}
          onChange={(e) => setReassignTo(e.target.value)}
          aria-label="担当を変える相手"
          className="min-h-tap text-sub min-w-0 flex-1 rounded-control border border-input bg-background px-2 lg:min-h-[40px]"
        >
          <option value="">担当を変える相手を選ぶ…</option>
          {(users ?? []).filter((u) => u.id !== currentUser?.id).map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <Button variant="outline" disabled={resolve.isPending || !reassignTo}
          onClick={() => resolve.mutate({ id: t.id, action: 'reassign', assigned_to: reassignTo })}>
          <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />担当者を変更
        </Button>
      </div>
      <Button variant="ghost" className="justify-start text-destructive" disabled={resolve.isPending}
        onClick={async () => {
          const ok = await confirmAction({
            title: 'この依頼を取り下げますか',
            description: t.title,
            confirmLabel: '取り下げる',
            tone: 'danger',
          });
          if (ok) resolve.mutate({ id: t.id, action: 'withdraw' });
        }}>
        <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />取り下げる
      </Button>
    </div>
  );
}

export function DelegationDetail({ task, direction, canEdit, embedded = false }: {
  task: MyTask | null;
  direction: 'received' | 'sent';
  canEdit: boolean;
  /** シートの中身として出すとき（枠と見出しはシートが持っている） */
  embedded?: boolean;
}) {
  if (!task) {
    return (
      <div className="rounded-card border border-border bg-card">
        <EmptyState
          className="border-none bg-transparent"
          title="依頼を選んでください"
          description="左の一覧から1件を選ぶと、本文・やり取り・返す操作がここに出ます。"
        />
      </div>
    );
  }

  const bucket = delegationBucket(task);
  const cell = `${task.importance}x${task.due_at ? task.urgency : 1}`;

  return (
    <div className={cn('flex flex-col', !embedded && 'overflow-hidden rounded-card border border-border bg-card')}>
      {!embedded && (
        <div className="flex flex-col gap-2 border-b border-border-subtle p-4">
          <span className="flex flex-wrap items-center gap-2">
            <TableBadge label={BUCKET_LABELS[bucket]} w={null} />
            {task.is_overdue && <TableBadge label="期限超過" w={null} className="bg-destructive-surface text-destructive" />}
          </span>
          <p className="text-cardtitle">{task.title}</p>
        </div>
      )}

      <div className="flex flex-col gap-2.5 border-b border-border-subtle p-4">
        <Field label={direction === 'received' ? '依頼した人' : '依頼した相手'}>
          <span className="font-bold text-foreground">
            {(direction === 'received' ? task.requester_name : task.assigned_to_name) ?? '（不明）'} さん
          </span>
        </Field>
        <Field label="期限">
          <span className={cn('font-number', task.is_overdue ? 'font-bold text-destructive' : 'text-foreground')}>
            {formatDueLong(task.due_at)}{task.is_overdue && '（期限超過）'}
          </span>
        </Field>
        <Field label="優先度">
          重要 {LEVEL_LABELS[task.importance]} × 緊急 {LEVEL_LABELS[task.due_at ? task.urgency : 1]}
          <span className="text-muted-foreground"> ・ {CELL_ACTION[cell] ?? ''}</span>
        </Field>
        {task.gls_number && (
          <Field label="案件">
            <span className="font-number">{task.gls_number}</span>
            {task.project_name && <span className="text-muted-foreground"> ・ {task.project_name}</span>}
          </Field>
        )}
      </div>

      {task.description && (
        <div className="border-b border-border-subtle p-4">
          <p className="text-th mb-1.5 text-muted-foreground">依頼の本文</p>
          <p className="text-sub whitespace-pre-wrap rounded-note bg-surface-subtle p-3 text-secondary-foreground">
            {task.description}
          </p>
        </div>
      )}

      {canEdit && hasActions(task, direction) && (
        <div className="border-b border-border-subtle p-4">
          {direction === 'received' ? <ReceivedActions t={task} /> : <SentActions t={task} />}
        </div>
      )}

      <div className="p-4">
        <TaskCommentsThread taskId={task.id} canWrite={canEdit} alwaysOpen />
      </div>
    </div>
  );
}
