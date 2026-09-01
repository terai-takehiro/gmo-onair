/**
 * タスクを足す／直す — ③ プロジェクト詳細「概要」の工程の下
 *
 * ── どの工程に付けるかを必ず選べるようにする ────────────────
 *
 * 工程の「タスクを足す」から開いたときは**その工程が既に選ばれています**が、
 * 選び直せます（打合せの途中で「これは調達側だ」となるのが普通なので、
 * 足したあとに付け替える口が無いと作り直すことになる）。
 * **「工程なし」も選べます** — 工程が決まる前のタスクを置く場所が要ります。
 *
 * ── 担当は `gpm` の権限を持っている人だけ ────────────────────
 *
 * `useGpmUsers()`（`/users/by-module/gpm`）で引きます。全員を出すと、
 * このアプリを開けない人が担当になり、その人の「自分のタスク」には出ますが
 * プロジェクトを開けません。
 *
 * ── 期限は日付だけ受ける ────────────────────────────────────
 *
 * サーバーが `due_at`（時刻つき）に **18:00** で入れます。時刻を選ばせても
 * 工事の工程で時刻まで決まっていることは無く、ひな形から写したタスクと
 * 形が変わってしまいます。
 */
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useGpmUsers, useInvalidateGpm } from '../../queries';
import { PHASE_STATE_LABEL, ymd, type GpmPhase, type GpmTask } from '../../types';
import { PredecessorField } from './PredecessorField';

const NONE = '_none_';

export function TaskDialog({
  projectId, task, phases, defaultPhaseId, onClose,
}: {
  projectId: string;
  /** 直すとき。足すときは `null` */
  task: GpmTask | null;
  phases: GpmPhase[];
  /** 足すときに最初から選んでおく工程（工程の「タスクを足す」から開いたとき） */
  defaultPhaseId?: string | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateGpm();
  const users = useGpmUsers();

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? '');
  const [startDate, setStartDate] = useState(ymd(task?.start_date) ?? '');
  const [dueDate, setDueDate] = useState(ymd(task?.due_at) ?? '');
  const [phaseId, setPhaseId] = useState(task?.phase_id ?? defaultPhaseId ?? '');
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [isMilestone, setIsMilestone] = useState(task?.is_milestone ?? false);

  // **task は react-query 由来で、開いたまま裏で更新されうる**（同じ行の完了チェックなど）。
  // 呼び出し元の key だけでは「同じタスクの中身が裏で変わった」場合まで拾えないので、
  // ここでも再同期する（EditProjectDialog と同じ落とし穴を踏まないため）
  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setAssignedTo(task?.assigned_to ?? '');
    setStartDate(ymd(task?.start_date) ?? '');
    setDueDate(ymd(task?.due_at) ?? '');
    setPhaseId(task?.phase_id ?? defaultPhaseId ?? '');
    setProgress(task?.progress ?? 0);
    setIsMilestone(task?.is_milestone ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        gpm_phase_id: phaseId || null,
        progress,
        is_milestone: isMilestone,
      };
      return task
        ? api.put(`/gpm/tasks/${task.id}`, body)
        : api.post(`/gpm/projects/${projectId}/tasks`, body);
    },
    onSuccess: () => {
      invalidate(projectId);
      notifySuccess(task ? 'タスクを直しました' : 'タスクを足しました');
      onClose();
    },
    onError: (err) => notifyApiError(task ? 'タスクを直せませんでした' : 'タスクを足せませんでした', err),
  });

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={task ? 'タスクを直す' : 'タスクを足す'}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {task ? '直す' : '足す'}
          </Button>
        </FormDialogFooter>
      }
    >
        <div className="space-y-3">
          <div>
            <Label htmlFor="tk-title">
              何をするか <span className="text-destructive">必須</span>
            </Label>
            <Input
              id="tk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="カメラ制御盤の型番を確定する"
            />
          </div>

          <div>
            <Label htmlFor="tk-phase">どの工程か</Label>
            <Select value={phaseId || NONE} onValueChange={(v) => setPhaseId(v === NONE ? '' : v)}>
              <SelectTrigger id="tk-phase"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>工程なし</SelectItem>
                {phases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}（{PHASE_STATE_LABEL[p.state]}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tk-who">担当</Label>
              <Select value={assignedTo || NONE} onValueChange={(v) => setAssignedTo(v === NONE ? '' : v)}>
                <SelectTrigger id="tk-who"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>決めない</SelectItem>
                  {(users.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tk-progress">進み具合</Label>
              <Select value={String(progress)} onValueChange={(v) => setProgress(Number(v))}>
                <SelectTrigger id="tk-progress"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 25, 50, 75, 100].map((p) => (
                    <SelectItem key={p} value={String(p)}>{p}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tk-start">開始日（ガントのバーの左端）</Label>
              <Input id="tk-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tk-due">期限</Label>
              <Input id="tk-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <label className="flex min-h-tap cursor-pointer items-center gap-2.5 lg:min-h-0">
            <input
              type="checkbox"
              checked={isMilestone}
              onChange={(e) => setIsMilestone(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sub">
              マイルストーン（◆）にする — 引渡し・検収など<strong className="font-bold">1日の節目</strong>。ガントでひし形になります
            </span>
          </label>

          {/* 先行タスクは別テーブルへその場で保存するので、タスクがまだ無い（足すとき）は出せない */}
          {task && <PredecessorField projectId={projectId} taskId={task.id} />}

          <div>
            <Label htmlFor="tk-desc">補足</Label>
            <Textarea
              id="tk-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="担当: 技術"
            />
          </div>

          <p className="text-sub-sm text-muted-foreground">
            期限は<strong className="font-bold">その日の 18:00</strong> として入ります
            （ひな形から写したタスクと同じ形にするため）。担当を決めると、その人の「自分のタスク」に出ます。
          </p>
        </div>
    </FormDialog>
  );
}
