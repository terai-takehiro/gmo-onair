/**
 * 案件詳細 / やり取りタブ (v4 ⑥-C)
 *
 * お客様とのやり取りを**時系列で1本**にします。いまの元は活動記録
 * (`activity_logs`) だけです。メールの取り込みは AI が活動記録に書くので、
 * ここに出れば同じ流れの中に並びます。
 *
 * **打合せの録音から議事録を起こせます** (v4)。録音 → Whisper で文字起こし →
 * AI が決定事項と持ち帰りを下書き → 人が直して確定、の順です。
 * 確定するときに**どこを直したかがサーバーで自動記録され**、次の下書きに効きます
 * (会社方針「AI を使い捨てにしない」の条件2と4)。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Mic, Info, Phone, Mail, Users, Presentation, MoreHorizontal } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import { RecordDialog } from './thread/RecordDialog';
import { MinutesCard } from './thread/MinutesCard';
import type { MinutesResponse, MinutesPatch } from './thread/types';
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { localDateStr } from '@/lib/format';
import type { ActivityLog } from './types';

/** 活動の種類。DB の `activity_type` と同じ集合 */
const KIND: Record<string, { label: string; icon: typeof Phone }> = {
  call: { label: '電話', icon: Phone },
  email: { label: 'メール', icon: Mail },
  meeting: { label: '打合せ', icon: Users },
  visit: { label: '訪問', icon: Users },
  proposal: { label: '提案', icon: Presentation },
  followup: { label: '追いかけ', icon: MoreHorizontal },
  other: { label: 'その他', icon: MoreHorizontal },
};

interface ThreadItem extends ActivityLog {
  activity_type: string;
  description: string | null;
  user_name?: string | null;
}

export function ThreadTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const [recOpen, setRecOpen] = useState(false);

  const minutes = useQuery<MinutesResponse>({
    queryKey: ['project-minutes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/minutes`)).data,
    // **処理中の行があるあいだだけ**見に来る。ずっと回すと無駄に叩き続ける
    refetchInterval: (q) =>
      (q.state.data?.data ?? []).some((m) => m.status === 'transcribing') ? 5_000 : false,
  });
  const rows = minutes.data?.data ?? [];
  const sttAvailable = minutes.data?.stt_available !== false;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['project-minutes', projectId] });

  const start = useMutation({
    mutationFn: async (p: { file: File; metOn: string }) => {
      const fd = new FormData();
      fd.append('audio', p.file);
      fd.append('met_on', p.metOn);
      return api.post(`/projects/${projectId}/minutes`, fd);
    },
    onSuccess: () => {
      setRecOpen(false);
      invalidate();
      notifySuccess('文字起こしをはじめました。できたらこのタブに出ます');
    },
    onError: (e) => notifyApiError('文字起こしをはじめられませんでした', e),
  });

  const save = useMutation({
    mutationFn: (p: { id: string; patch: MinutesPatch }) =>
      api.put(`/projects/${projectId}/minutes/${p.id}`, p.patch),
    onSuccess: (_r, p) => { invalidate(); notifySuccess(p.patch.confirm ? '確定しました' : '保存しました'); },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/minutes/${id}`),
    onSuccess: () => { invalidate(); notifySuccess('消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const { data, isLoading } = useQuery<{ data: ThreadItem[] }>({
    queryKey: ['project-activities', projectId],
    queryFn: async () =>
      (await api.get('/activity-logs', { params: { project_id: projectId, limit: 100 } })).data,
  });

  const items = data?.data ?? [];
  const today = localDateStr(new Date());

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* **押してから「使えません」を出さない。** 設定が無い環境では理由を添えて止める */}
        <Button
          variant="outline"
          disabled={!canEdit || !sttAvailable}
          title={!sttAvailable ? 'この環境は文字起こしにつないでいません（管理者にご連絡ください）' : undefined}
          onClick={() => setRecOpen(true)}
        >
          <Mic className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />打合せを録音
        </Button>
        <Link
          to="/sales/activity-logs"
          className="text-sub min-h-tap inline-flex items-center text-primary hover:underline lg:min-h-[36px]"
        >
          営業活動の画面で記録する
        </Link>
      </div>

      {isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : items.length === 0 ? (
        <EmptyState
          title="やり取りの記録はまだありません"
          description="電話・打合せは営業活動の画面から記録できます。メールは AI が自動で取り込みます。"
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          {items.map((a) => {
            const k = KIND[a.activity_type] ?? KIND.other;
            const overdue = a.next_action && !a.next_action_done_at
              && !!a.next_action_date && a.next_action_date < today;
            return (
              <Row key={a.id} divider align="start" stackOnMobile>
                <RowMain>
                  <RowTitle>{a.subject}</RowTitle>
                  {a.description && (
                    <p className="text-sub mt-0.5 whitespace-pre-line text-muted-foreground">{a.description}</p>
                  )}
                  {a.next_action && (
                    <p className={`text-sub-sm mt-1 ${overdue ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
                      次にやること: {a.next_action}
                      {a.next_action_date && `（${a.next_action_date}${overdue ? ' 過ぎています' : ''}）`}
                      {a.next_action_done_at && '（済み）'}
                    </p>
                  )}
                </RowMain>
                <TableBadge w={96} label={k.label} variant="outline" />
                <RowSlot w={96} align="right" className="text-sub font-number text-muted-foreground">
                  {a.activity_date}
                </RowSlot>
              </Row>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <h2 className="text-h2 mt-1">議事録</h2>
          {rows.map((m) => (
            <MinutesCard
              key={m.id}
              m={m}
              canEdit={canEdit}
              busy={save.isPending || remove.isPending}
              onSave={(patch) => save.mutate({ id: m.id, patch })}
              onDelete={async () => {
                const ok = await confirmAction({
                  title: '議事録を消しますか',
                  description: '文字起こしも一緒に消えます。元の音声は残していないので、戻せません。',
                  confirmLabel: '消す',
                  tone: 'danger',
                });
                if (ok) remove.mutate(m.id);
              }}
            />
          ))}
        </>
      )}

      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          <strong className="font-bold">録音した音声は文字にしたら保存せずに捨てます。</strong>
          残るのは文字起こしと議事録だけです。録音を残したい打合せは、BOX の社内限りフォルダに置いてください。
          <strong className="font-bold">持ち帰りからタスクを作る機能は、まだ入れていません。</strong>
        </p>
      </div>

      <RecordDialog
        open={recOpen}
        onOpenChange={setRecOpen}
        busy={start.isPending}
        onSubmit={(file, metOn) => start.mutate({ file, metOn })}
      />
    </div>
  );
}
