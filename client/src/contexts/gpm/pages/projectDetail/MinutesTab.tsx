/**
 * ③ プロジェクト詳細「議事録」— 打合せを録音 → 文字起こし → AI が下書き
 *
 * ── 案件と同じ表・同じ部品・同じプロンプト ──────────────────
 *
 * `project_minutes` は `projects` にぶら下がる表で、プロジェクトは GLS-B の案件です。
 * だから**中身は1つも作り直していません** — 表・サービス・Whisper の投げ方・
 * 整形のプロンプト・差分の記録（`ai_corrections`）は案件と同じものを呼びます。
 * 写すと、片方だけ直した日から**同じ打合せが画面によって違う整形になります**。
 *
 * 分けたのは**口（URL）だけ**です。案件側のルートは `sales` を要求するので、
 * `gpm` だけの人は自分のプロジェクトの議事録を開けません。
 *
 * ── 持ち帰りの行き先だけが違う ──────────────────────────────
 *
 * 案件は**タスク**、プロジェクトは**未確認事項**にします（`ASK_TRACK`）。
 * 工事・構築で打合せから出る持ち帰りはほとんどが「先方の判断待ち」で、
 * タスクにすると「自分がやること」に相手待ちが混ざり、**プロジェクトをまたいで
 * 「いま何件止まっているか」を数えられません**（それが `gpm_open_items` を作った理由）。
 *
 * ── AI が書いたことを隠さない ────────────────────────────────
 *
 * 下書きのあいだは印を出し、**確定するまで「下書き」と書きます**（`MinutesCard`）。
 * 議事録は取引先との合意の記録なので、AI が書いたものを決まったことのように見せない。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { Delayed, SkeletonRows, ErrorPanel, EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { ASK_TRACK, MinutesCard } from '@/contexts/sales/pages/projectDetail/thread/MinutesCard';
import { RecordDialog } from '@/contexts/sales/pages/projectDetail/thread/RecordDialog';
import type { MinutesPatch, MinutesResponse } from '@/contexts/sales/pages/projectDetail/thread/types';
import { useInvalidateGpm } from '../../queries';

export function MinutesTab({ projectId, canEdit, canManage }: {
  projectId: string;
  canEdit: boolean;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const invalidateGpm = useInvalidateGpm();
  const { hasPermission } = useAuth();
  // 表示だけなら reader で足りる（押せるボタンは canEdit で出し分ける）
  const canRead = hasPermission('gpm', 'reader');
  const [recOpen, setRecOpen] = useState(false);

  const key = ['gpm-minutes', projectId];
  const minutes = useQuery<MinutesResponse>({
    queryKey: key,
    queryFn: async () => (await api.get(`/gpm/projects/${projectId}/minutes`)).data,
    enabled: !!projectId && canRead,
    // **処理中の行があるあいだだけ**見に来る。ずっと回すと無駄に叩き続ける
    refetchInterval: (q) =>
      (q.state.data?.data ?? []).some((m) => m.status === 'transcribing') ? 5_000 : false,
  });
  const rows = minutes.data?.data ?? [];
  const sttAvailable = minutes.data?.stt_available !== false;
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const start = useMutation({
    mutationFn: async (p: { file: File; metOn: string }) => {
      const fd = new FormData();
      fd.append('audio', p.file);
      fd.append('met_on', p.metOn);
      return api.post(`/gpm/projects/${projectId}/minutes`, fd);
    },
    onSuccess: () => {
      setRecOpen(false);
      invalidate();
      notifySuccess('文字起こしをはじめました。できたらこのタブに出ます');
    },
    onError: (e) => notifyApiError('文字起こしをはじめられませんでした', e),
  });

  const save = useMutation({
    mutationFn: (p: { id: string; patch: MinutesPatch }) => api.put(`/gpm/minutes/${p.id}`, p.patch),
    onSuccess: (_r, p) => { invalidate(); notifySuccess(p.patch.confirm ? '確定しました' : '保存しました'); },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/gpm/minutes/${id}`),
    onSuccess: () => { invalidate(); notifySuccess('消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  /**
   * 持ち帰り → 未確認事項。**GPM の鍵も落とす** — 落とさないと、
   * 未確認事項タブに切り替えても新しい行が出ず「作れなかった」と見える
   * （ダッシュボードと全プロジェクトの件数も同時に変わる）。
   */
  const makeAsk = useMutation({
    mutationFn: (v: { id: string; index: number }) =>
      api.post(`/gpm/minutes/${v.id}/open-items/${v.index}/ask`),
    onSuccess: (r) => {
      invalidate();
      invalidateGpm(projectId);
      notifySuccess('未確認事項にしました', {
        description: `「${String((r.data as { data?: { question?: string } })?.data?.question ?? '').slice(0, 40)}」`
          + 'を未確認事項タブに入れました。誰に訊くか・期限はそちらで直せます。',
      });
    },
    onError: (e) => notifyApiError('未確認事項にできませんでした', e),
  });

  const onDelete = async (id: string, title: string) => {
    const ok = await confirmAction({
      title: 'この議事録を消しますか？',
      description: `「${title || '（表題なし）'}」\n`
        + '文字起こしの全文も一緒に見えなくなります。'
        + '取引先との打合せの記録なので、**間違って作ったものだけ**消してください。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) remove.mutate(id);
  };

  if (minutes.isError) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorPanel title="議事録を読み込めませんでした" onRetry={() => minutes.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub min-w-0 flex-1 text-muted-foreground">
          打合せを録音すると、文字起こしから<strong className="font-bold">下書き</strong>を作ります。
          決定事項には<strong className="font-bold">文字起こしからの引用</strong>が付きます（根拠が出せないものは持ち帰りに落ちます）。
        </p>
        {canEdit && sttAvailable && (
          <Button onClick={() => setRecOpen(true)}>
            <Mic className="mr-2 h-4 w-4" aria-hidden="true" />打合せを録音する
          </Button>
        )}
      </div>

      {/* **押してから「使えません」を出さない。** 設定の話だと分かるように書く */}
      {!sttAvailable && (
        <div className="rounded-card border border-warning-border bg-warning-surface p-4 lg:px-5">
          <p className="text-list text-warning">この環境は文字起こしにつないでいません</p>
          <p className="text-sub mt-1 text-foreground">
            録音から議事録を起こすには OpenAI の鍵が要ります（管理者にご連絡ください）。
            すでにある議事録は読めます。
          </p>
        </div>
      )}

      {minutes.isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title="議事録はまだありません"
          description="打合せを録音すると、文字起こし → 下書き（要約・決定事項・持ち帰り）まで作ります。音声は文字にしたら捨てるので残りません。"
          action={canEdit && sttAvailable
            ? <Button onClick={() => setRecOpen(true)}>打合せを録音する</Button>
            : undefined}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <MinutesCard
              key={m.id}
              m={m}
              canEdit={canEdit}
              busy={save.isPending || remove.isPending || makeAsk.isPending}
              track={ASK_TRACK}
              onSave={(patch) => save.mutate({ id: m.id, patch })}
              onDelete={() => { if (canManage) onDelete(m.id, m.title); }}
              onMakeTask={(index) => makeAsk.mutate({ id: m.id, index })}
            />
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">音声は保存しません</strong>（文字にしたら捨てます）。残るのは文字起こしと議事録だけです。
        持ち帰りは<strong className="font-bold">未確認事項</strong>にできます — 案件（スタジオ）ではタスクになりますが、
        工事・構築の持ち帰りはほとんどが先方の判断待ちなので、止まっている件数として数えられるほうに入れます。
      </p>

      {recOpen && (
        <RecordDialog
          open
          busy={start.isPending}
          onOpenChange={(v) => { if (!v) setRecOpen(false); }}
          onSubmit={(file, metOn) => start.mutate({ file, metOn })}
        />
      )}
    </div>
  );
}
