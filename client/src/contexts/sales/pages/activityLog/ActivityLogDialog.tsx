/**
 * 営業活動記録の登録・編集ダイアログ (v4)
 *
 * **旧実装から中身は変えていません**（項目・必須・保存の形は同じ）。
 * 変えたのは: ①`confirm()`/`alert()` を `confirmAction`/`notify` に ②枠と
 * 見出しの型を v4 のトークンに ③削除できるのは `manager` だけに絞った
 * （旧実装は開ける人なら誰でも削除ボタンが出ていたが、サーバーは
 * `requirePermission('sales', 'manager')` なので、**押せるのに 403** だった）。
 * ④ 入れ物を `Dialog` から `FormDialog` に載せ替えた（スマホは下シート）。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { ACTIVITY_TYPES } from './kinds';
import { emptyForm, type ActivityLogRow, type FormData } from './types';

interface ProjectOption { id: string; gls_number?: string; code?: string; name: string }
interface CustomerOption { id: string; name: string }

function formFromRow(log: ActivityLogRow): FormData {
  return {
    project_id: log.project_id || '',
    customer_id: log.customer_id || '',
    activity_type: log.activity_type,
    activity_date: log.activity_date,
    duration_minutes: log.duration_minutes ? String(log.duration_minutes) : '',
    subject: log.subject,
    description: log.description || '',
    next_action: log.next_action || '',
    next_action_date: log.next_action_date || '',
  };
}

export function ActivityLogDialog({
  editing, canDelete, onClose,
}: {
  /** 直す行。`null` なら新規 */
  editing: ActivityLogRow | null;
  canDelete: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // 遅延初期化 — mount のたびに評価し、新規の活動日を「開いた日」のローカル日付にする
  const [form, setForm] = useState<FormData>(() => (editing ? formFromRow(editing) : emptyForm()));

  const { data: projectsData } = useQuery({
    queryKey: ['projects-dropdown'],
    queryFn: async () => (await api.get('/projects?limit=200')).data,
  });
  const projectOptions: ProjectOption[] = projectsData?.data ?? [];

  const { data: custData } = useQuery({
    queryKey: ['customers-dropdown'],
    queryFn: async () => (await api.get('/customers?limit=200')).data,
  });
  const customers: CustomerOption[] = custData?.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activity-logs'] });
    qc.invalidateQueries({ queryKey: ['activity-upcoming'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        duration_minutes: data.duration_minutes ? Number(data.duration_minutes) : null,
        project_id: data.project_id || null,
        customer_id: data.customer_id || null,
        next_action: data.next_action || null,
        next_action_date: data.next_action_date || null,
      };
      return editing
        ? (await api.put(`/activity-logs/${editing.id}`, payload)).data
        : (await api.post('/activity-logs', payload)).data;
    },
    onSuccess: () => {
      invalidate();
      notifySuccess(editing ? '活動記録を更新しました' : '活動を記録しました');
      onClose();
    },
    onError: (err) => notifyApiError('活動記録の保存に失敗しました', err),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/activity-logs/${id}`)).data,
    onSuccess: () => {
      invalidate();
      notifySuccess('活動記録を削除しました');
      onClose();
    },
    onError: (err) => notifyApiError('削除に失敗しました', err),
  });

  const handleDelete = async () => {
    if (!editing) return;
    if (!(await confirmAction({
      title: 'この活動記録を削除しますか？',
      description: '次回アクションも一緒に消えます。',
      confirmLabel: '削除する',
      tone: 'danger',
    }))) return;
    deleteMutation.mutate(editing.id);
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={editing ? '活動記録の編集' : '活動を記録'}
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {editing && canDelete ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive sm:mr-auto"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-1 h-4 w-4" />削除
            </Button>
          ) : <span className="hidden sm:block" />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>キャンセル</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={!form.subject || !form.activity_date || saveMutation.isPending}
            >
              {editing ? '更新' : '保存'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>活動種別</Label>
            <Select value={form.activity_type} onValueChange={(v) => setForm((f) => ({ ...f, activity_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>活動日</Label>
            <Input type="date" value={form.activity_date} onChange={(e) => setForm((f) => ({ ...f, activity_date: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>件名 *</Label>
          <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="打合せ内容の概要" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>案件（任意）</Label>
            <Select value={form.project_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                {projectOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.gls_number || o.code} {o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>顧客（任意）</Label>
            <Select value={form.customer_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>所要時間（分）</Label>
          <Input type="number" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} placeholder="30" />
        </div>
        <div>
          <Label>詳細</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
        </div>
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sub font-bold">次回アクション</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>内容</Label>
              <Input value={form.next_action} onChange={(e) => setForm((f) => ({ ...f, next_action: e.target.value }))} placeholder="見積書を送付" />
            </div>
            <div>
              <Label>期日</Label>
              <Input type="date" value={form.next_action_date} onChange={(e) => setForm((f) => ({ ...f, next_action_date: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
