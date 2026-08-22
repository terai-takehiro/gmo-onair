/**
 * お客様の詳細（顧客360）— 「やり取りを記録」ダイアログ (v4)
 *
 * 旧実装はインライン展開のフォーム（見出しの下に開閉）だったが、`<FormDialog>`
 * （PC=中央ダイアログ・スマホ=下シート）へ載せ替えた。**送る中身は1つも変えていない**
 * — `POST /activity-logs` の payload は旧実装のままで、見た目とレイアウトだけを作り直す
 * という今回のタスクの範囲を守っている。
 *
 * 種別は `activityLog/kinds.ts` の `ACTIVITY_TYPES` を読む（旧実装はこの画面専用の
 * 短い一覧を別に持っていた）。migration 184 でメモが `activity_type='memo'` として
 * 同じ列に畳まれているので、`memo` を含む1つの表を両画面で共有するのが正しい。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVITY_TYPES } from '../activityLog/kinds';
import type { CustomerProject } from './types';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function ActivityFormDialog({
  open, onOpenChange, customerId, customerQueryId, projects,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** `companies.id`（サーバーが返した正規の顧客ID） */
  customerId: string;
  /** react-query の鍵に使う URL の id（旧URL経由だと `customerId` と一致しないことがある） */
  customerQueryId: string;
  projects: CustomerProject[];
}) {
  const qc = useQueryClient();
  const [type, setType] = useState('call');
  const [projectId, setProjectId] = useState('none');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  const reset = () => {
    setType('call'); setProjectId('none'); setSubject(''); setDescription('');
    setNextAction(''); setNextActionDate('');
  };

  const create = useMutation({
    mutationFn: () => api.post('/activity-logs', {
      customer_id: customerId,
      project_id: projectId === 'none' ? null : projectId,
      activity_type: type,
      activity_date: todayStr(),
      subject: subject.trim(),
      description: description.trim() || null,
      next_action: nextAction.trim() || null,
      next_action_date: nextAction.trim() ? (nextActionDate || null) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-overview', customerQueryId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess('やり取りを記録しました');
      reset();
      onOpenChange(false);
    },
    onError: (err) => notifyApiError('やり取りを記録できませんでした', err),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => { if (!v) { reset(); } onOpenChange(v); }}
      title="やり取りを記録"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button disabled={!subject.trim() || create.isPending} onClick={() => create.mutate()}>
            記録する
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>種別</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>関連案件（任意）</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">案件に紐づけない</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.gls_number || p.code || ''} {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>件名 *</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="例: 見積内容の確認電話" />
        </div>

        <div>
          <Label>詳細（任意）</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sub mb-2 font-bold">次回アクション（任意）</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>内容</Label>
              <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="例: 再提案の日程調整" />
            </div>
            <div>
              <Label>期日</Label>
              <Input
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                disabled={!nextAction.trim()}
              />
            </div>
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
