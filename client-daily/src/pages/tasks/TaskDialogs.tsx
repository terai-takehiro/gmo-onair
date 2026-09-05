// 編集 / 作成ダイアログ。
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
  CELL_ACTION, LEVEL_LABELS, useAssignees, useCreateTask, useUpdateTask,
  toLocalInput, fromLocalInput, type MyTask,
} from '@/lib/tasksApi';
import { CellScoreBadge } from './CellScoreBadge';

/**
 * 期限のクイック選択。**短い順に並べる**のが意図。
 * イズム (目標達成10カ条 1-1)「期限はできるだけ短く設定する」を選択肢の並びで示す。
 */
function dueQuickPicks(): { label: string; value: string }[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const at = (d: Date, h: number, m: number) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(h)}:${pad(m)}`;
  };
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const friday = new Date(now); friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));
  const nextMon = new Date(now); nextMon.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  return [
    { label: '今日 18:00', value: at(now, 18, 0) },
    { label: '明日 10:00', value: at(tomorrow, 10, 0) },
    { label: '明日 18:00', value: at(tomorrow, 18, 0) },
    { label: '金曜 18:00', value: at(friday, 18, 0) },
    { label: '来週月曜 10:00', value: at(nextMon, 10, 0) },
  ];
}

function LevelPicker({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex gap-1">
        {[3, 2, 1].map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => onChange(lv)}
            className={cn(
              'min-h-tap lg:min-h-[36px] flex-1 rounded-md border py-1.5 text-xs transition-colors',
              value === lv ? 'border-primary bg-primary/15 font-medium text-primary' : 'border-input hover:bg-accent'
            )}
          >
            {LEVEL_LABELS[lv]}
          </button>
        ))}
      </div>
    </div>
  );
}

function DueField({ value, onChange, required }: {
  value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      {/* 聞き方でイズムを伝える (「いつまで？」ではなく「何月何日何時何分まで？」) */}
      <Label className="text-xs">
        何月何日何時何分まで {required && <span className="text-destructive">*</span>}
      </Label>
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {dueQuickPicks().map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange(q.value)}
            className="min-h-tap lg:min-h-[36px] rounded-full border border-input px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {q.label}
          </button>
        ))}
      </div>
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
  const score = imp * (due ? urg : 1);

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
      { onSuccess: onClose, onError: (e) => setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'タスクを保存できませんでした。少し待ってから、もう一度お試しください。') }
    );
  };

  return (
    <FormDialog open onOpenChange={onClose} title="タスクを編集" footer={
      <FormDialogFooter>
        <Button variant="outline" onClick={onClose}>キャンセル</Button>
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}保存
        </Button>
      </FormDialogFooter>
    }>
      <div className="space-y-3">
        {err && <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{err}</p>}
        <div>
          <Label className="text-xs">やること</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
        </div>
        <DueField value={due} onChange={setDue} required={isDelegation} />
        {isDelegation && (
          <p className="text-[11px] text-muted-foreground">
            これは {task.requester_name ?? '誰か'} さんからの依頼です。期限は必須です。
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LevelPicker label="重要度" value={imp} onChange={setImp} />
          <LevelPicker label="緊急度" value={urg} onChange={setUrg} />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <CellScoreBadge score={score} />
          <span className="text-note text-muted-foreground">
            {CELL_ACTION[`${imp}x${due ? urg : 1}`]}
            {!due && '（期限が無いので緊急度は低として扱います）'}
          </span>
        </div>
        {!isDelegation && (
          <div>
            <Label className="text-xs">見せる範囲</Label>
            <div className="mt-1 flex gap-1">
              <button type="button" onClick={() => setVis('team')}
                className={cn('min-h-tap lg:min-h-[36px] flex-1 rounded-md border py-1.5 text-xs', vis === 'team' ? 'border-primary bg-primary/15 font-medium text-primary' : 'border-input hover:bg-accent')}>
                チームに見せる
              </button>
              <button type="button" onClick={() => setVis('private')}
                className={cn('min-h-tap lg:min-h-[36px] flex-1 rounded-md border py-1.5 text-xs', vis === 'private' ? 'border-primary bg-primary/15 font-medium text-primary' : 'border-input hover:bg-accent')}>
                自分だけ
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              「自分だけ」でもチームタブの件数には入ります（内容は出ません）。
            </p>
          </div>
        )}
      </div>
    </FormDialog>
  );
}

export function TaskCreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateTask();
  const { currentUser } = useAuth();
  const { data: users } = useAssignees();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState(currentUser?.id ?? '');
  const [due, setDue] = useState('');
  const [imp, setImp] = useState(2);
  const [urg, setUrg] = useState(2);
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // 自分以外を担当にすると「依頼」になる → 期限が必須 (要件 D9)
  const isDelegation = !!assignee && assignee !== currentUser?.id;
  const score = imp * (due ? urg : 1);

  const submit = () => {
    setErr(null);
    if (!title.trim()) { setErr('やることを入力してください'); return; }
    if (!assignee) { setErr('担当者を選んでください'); return; }
    if (isDelegation && !due) {
      setErr('人に頼むときは期限が必須です。何月何日何時何分までかを入れてください');
      return;
    }
    create.mutate(
      { title: title.trim(), assigned_to: assignee, due_at: fromLocalInput(due), importance: imp, urgency: urg, description: desc || null },
      { onSuccess: onClose, onError: (e) => setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'タスクを登録できませんでした。少し待ってから、もう一度お試しください。') }
    );
  };

  return (
    <FormDialog open onOpenChange={onClose} title="タスク・依頼を追加" footer={
      <FormDialogFooter>
        <Button variant="outline" onClick={onClose}>キャンセル</Button>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}登録する
        </Button>
      </FormDialogFooter>
    }>
      <div className="space-y-3">
        {err && <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{err}</p>}
        <div>
          <Label className="text-xs">やること</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="例: 見積書の作成" />
        </div>
        <div>
          <Label className="text-xs">担当者</Label>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">選んでください</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}{u.id === currentUser?.id ? '（自分）' : ''}</option>
            ))}
          </select>
          {isDelegation && (
            <p className="mt-1 text-[11px] text-violet-700">
              人に頼む依頼になります。期限は必須です。相手は受ける / 相談 / 辞退を選べます。
            </p>
          )}
        </div>
        <DueField value={due} onChange={setDue} required={isDelegation} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LevelPicker label="重要度" value={imp} onChange={setImp} />
          <LevelPicker label="緊急度" value={urg} onChange={setUrg} />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <CellScoreBadge score={score} />
          <span className="text-note text-muted-foreground">{CELL_ACTION[`${imp}x${due ? urg : 1}`]}</span>
        </div>
        <div>
          <Label className="text-xs">補足（任意）</Label>
          <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1" />
        </div>
      </div>
    </FormDialog>
  );
}
