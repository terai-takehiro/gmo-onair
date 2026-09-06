/**
 * タスクを足す (v4 ④ タスク一覧の主アクション)
 *
 * モックの言葉どおり **「案件と担当・期限だけ決めれば入ります」** にしてあります。
 * 既存の `TaskDialog` は種別・工程・カラム・進捗・マイルストーンまで持つ**編集用**で、
 * 案件の中からしか開けません (`projectId` を外から渡す作り)。
 * 全案件の一覧から足すときに同じ数の入力を求めると、**その場で足す**という
 * この画面の目的が消えるので、ここは最小の4つだけにしました。
 * 細かい設定は、足したあと行を押して編集します。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { invalidateTasks } from '@/contexts/tasks/hooks/useProjectTasks';
import { WORK_STATE_OPTIONS } from './state';
import type { TaskWorkState } from '@/types';

/** 選べる案件。**終わった案件は出さない** (終わった案件にタスクを追加することはない) */
interface PickableProject { id: string; name: string; gls_number: string | null; code: string | null }

export function AddTaskDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [workState, setWorkState] = useState<TaskWorkState>('todo');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', 'pickable'],
    queryFn: async () =>
      (await api.get<{ data: PickableProject[] }>('/projects', {
        params: { limit: 200, stage: 'neta,d_hold,c_proposal,b_verbal,a_won', sort_by: 'event_start', sort_dir: 'asc' },
      })).data.data,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-by-module-sales'],
    queryFn: async () =>
      (await api.get<{ data: { id: string; name: string }[] }>('/users/by-module/sales')).data.data,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/tasks`, {
        title: title.trim(),
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        work_state: workState,
      }),
    // **一覧と案件の両方を読み直す。** 片方だけだと「足したのに出ない」ように見える
    // （episodes・task-deadlines も含めて4つ — 鍵の対は invalidateTasks に集約）
    onSuccess: () => {
      invalidateTasks(qc, projectId);
      notifySuccess('タスクを足しました');
      onClose();
    },
    onError: (err) => notifyApiError('タスクを足せませんでした', err),
  });

  const canSubmit = projectId !== '' && title.trim() !== '' && !create.isPending;

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="タスクを追加"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            追加
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>
            案件 <span className="text-destructive">必須</span>
          </Label>
          <SearchableSelect
            value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({
              value: p.id,
              label: p.name,
              subLabel: p.gls_number || p.code || undefined,
            }))}
            placeholder="案件を検索"
          />
        </div>
        <div>
          <Label>
            タスク <span className="text-destructive">必須</span>
          </Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="見積を送る" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>担当</Label>
            <Select value={assignedTo || '_none_'} onValueChange={(v) => setAssignedTo(v === '_none_' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">未定</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>期限</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>状態</Label>
            <Select value={workState} onValueChange={(v) => setWorkState(v as TaskWorkState)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORK_STATE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
