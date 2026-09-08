/**
 * タスクの追加・編集ダイアログ
 *
 * ── 「依頼」はここから出さない ──────────────────────────────
 *
 * 作り直す前、このダイアログは「タスク・依頼を追加」という名前で担当者の欄を持ち、
 * **自分以外を選んだ瞬間に依頼に変わる**（期限が必須になる）作りでした。
 * つまり「依頼を出す」という行為に**専用の入口が無く**、選ぶまでそれが依頼になると
 * 分からない。人に頼むのは `RequestDialog`（依頼タブの主操作「依頼する」）に分け、
 * ここは**自分のタスク**だけを扱います。
 *
 * 欄の並びは追加・編集で同じ:
 *   やること → 期限 → 重要度/緊急度 → 判定 → 補足・公開範囲
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  useCreateTask, useUpdateTask, toLocalInput, fromLocalInput, type MyTask,
} from '@/lib/tasksApi';
import { DueField, LevelPicker, PriorityPreview } from './TaskFields';

function apiMessage(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function VisibilityPicker({ value, onChange }: { value: 'team' | 'private'; onChange: (v: 'team' | 'private') => void }) {
  return (
    <div>
      <Label className="text-th">公開範囲</Label>
      <div className="mt-1 flex gap-1">
        {([['team', 'チームに見せる'], ['private', '自分だけ']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            aria-pressed={value === k}
            className={cn(
              'min-h-tap text-sub lg:min-h-[36px] flex-1 rounded-control border',
              value === k ? 'border-primary bg-primary-surface font-bold text-primary' : 'border-input hover:bg-accent',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-note mt-1 text-muted-foreground">
        「自分だけ」でもチームタブの件数には入ります（内容は出ません）。
      </p>
    </div>
  );
}

export function TaskEditDialog({ task, onClose }: { task: MyTask; onClose: () => void }) {
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(toLocalInput(task.due_at));
  const [imp, setImp] = useState(task.importance);
  const [urg, setUrg] = useState(task.urgency);
  const [vis, setVis] = useState<'team' | 'private'>(task.visibility);
  const [err, setErr] = useState<string | null>(null);
  const isDelegation = !!task.requester_id;

  // 開いたまま裏で一覧が invalidate されて `task` の値が変わっても、
  // 保存が古い値の全項目 PATCH で相手の更新を巻き戻さないよう再同期する
  useEffect(() => {
    setTitle(task.title);
    setDue(toLocalInput(task.due_at));
    setImp(task.importance);
    setUrg(task.urgency);
    setVis(task.visibility);
  }, [task.id, task.title, task.due_at, task.importance, task.urgency, task.visibility]);

  const save = () => {
    setErr(null);
    if (!title.trim()) { setErr('やることを入力してください'); return; }
    if (isDelegation && !due) { setErr('依頼の期限は空にできません。何月何日何時何分までかを入れてください'); return; }
    update.mutate(
      { id: task.id, patch: { title: title.trim(), due_at: fromLocalInput(due), importance: imp, urgency: urg, visibility: vis } },
      { onSuccess: onClose, onError: (e) => setErr(apiMessage(e, 'タスクを保存できませんでした。少し待ってから、もう一度お試しください。')) },
    );
  };

  return (
    <FormDialog open onOpenChange={onClose} title="タスクを編集" onSubmit={(e) => { e.preventDefault(); if (!update.isPending) save(); }} footer={
      <FormDialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}保存
        </Button>
      </FormDialogFooter>
    }>
      <div className="space-y-3">
        {err && <p className="text-sub rounded-note bg-destructive-surface px-2 py-1.5 text-destructive">{err}</p>}
        <div>
          <Label className="text-th">やること</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
        </div>
        {/* **期限が必須になる理由は期限欄より前に出す** */}
        {isDelegation && (
          <p className="text-note text-muted-foreground">
            これは {task.requester_name ?? '誰か'} さんからの依頼です。期限は必須です。
          </p>
        )}
        <DueField value={due} onChange={setDue} required={isDelegation} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LevelPicker label="重要度" value={imp} onChange={setImp} />
          <LevelPicker label="緊急度" value={urg} onChange={setUrg} />
        </div>
        <PriorityPreview importance={imp} urgency={urg} hasDue={!!due} />
        {/* 依頼は相手と自分の2人で見るものなので、公開範囲を選ばせない */}
        {!isDelegation && <VisibilityPicker value={vis} onChange={setVis} />}
      </div>
    </FormDialog>
  );
}

export function TaskCreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateTask();
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [imp, setImp] = useState(2);
  const [urg, setUrg] = useState(2);
  const [desc, setDesc] = useState('');
  const [vis, setVis] = useState<'team' | 'private'>('team');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    if (!title.trim()) { setErr('やることを入力してください'); return; }
    if (!currentUser?.id) { setErr('ログインし直してください'); return; }
    create.mutate(
      {
        title: title.trim(),
        assigned_to: currentUser.id,
        due_at: fromLocalInput(due),
        importance: imp,
        urgency: urg,
        description: desc.trim() || null,
        visibility: vis,
      },
      { onSuccess: onClose, onError: (e) => setErr(apiMessage(e, 'タスクを登録できませんでした。少し待ってから、もう一度お試しください。')) },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title="タスクを追加"
      sub="自分でやることを登録します。人に頼むときは「依頼」タブの「依頼する」から。"
      onSubmit={(e) => { e.preventDefault(); if (!create.isPending) submit(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}追加
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-3">
        {err && <p className="text-sub rounded-note bg-destructive-surface px-2 py-1.5 text-destructive">{err}</p>}
        <div>
          <Label className="text-th">やること</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="例: 見積書の作成" />
        </div>
        <DueField value={due} onChange={setDue} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LevelPicker label="重要度" value={imp} onChange={setImp} />
          <LevelPicker label="緊急度" value={urg} onChange={setUrg} />
        </div>
        <PriorityPreview importance={imp} urgency={urg} hasDue={!!due} />
        <div>
          <Label className="text-th">補足</Label>
          <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1" />
        </div>
        <VisibilityPicker value={vis} onChange={setVis} />
      </div>
    </FormDialog>
  );
}
