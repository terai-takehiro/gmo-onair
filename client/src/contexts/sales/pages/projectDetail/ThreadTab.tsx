/**
 * 案件詳細 / やり取りタブ (v4 ⑥ 案件記録)
 *
 * お客様とのやり取りを**時系列で1本**にします。元は活動記録 (`activity_logs`) で、
 * migration 184 から**社内の書き置き（メモ）も同じ流れ**に並びます
 * （案件の `notes` という別の入れ物をやめました）。
 *
 * ── ここから書ける ──────────────────────────────────────────
 *
 * 以前この枠にあったのは「打合せを録音」と「営業活動の画面で記録する」だけで、
 * **この画面からは1行も書けませんでした**。読むために開いた画面で
 * 書けないので、結局みんな別の画面へ移っていました。
 *
 * 書く枠は**件名を訊きません**（`thread/ComposeBox.tsx`）。打ちっぱなしで送ると、
 * 保存時に AI が 見出し・整えた本文・要点・次にやること を起こします。
 * **原文は必ず残る**ので、整形が的外れなときは戻せます。
 *
 * **打合せの録音から議事録を起こせます**。録音 → Whisper で文字起こし →
 * AI が決定事項と持ち帰りを下書き → 人が直して確定、の順です。
 * 確定するときに**どこを直したかがサーバーで自動記録され**、次の下書きに効きます
 * (会社方針「AI を使い捨てにしない」の条件2と4)。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Info } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { useAuth } from '@/contexts/platform/AuthContext';
import { RecordDialog } from './thread/RecordDialog';
import { MinutesCard } from './thread/MinutesCard';
import { ComposeBox, type ComposeKind } from './thread/ComposeBox';
import { ThreadCard } from './thread/ThreadCard';
import { useNextActionActions } from '../activityLog/useNextActionActions';
import type { MinutesResponse, MinutesPatch } from './thread/types';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { localDateStr } from '@/lib/format';
import type { ActivityLog } from './types';

export function ThreadTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  // **消すのは manager。** サーバーが `requirePermission('sales','manager')` で止めるので、
  // editor に出すと押して 403 を受け取るだけになる（Codex の指摘・PR #103）
  const canDeleteMinutes = hasPermission('sales', 'manager');
  const [recOpen, setRecOpen] = useState(false);

  /**
   * 次回アクションの完了・延期。**このタブ自身にはこれまで無かった**
   * （ユーザー指摘）。「お待たせ中」の期限超過はここ（`/sales/projects/:id/thread`）
   * に送っているのに、片づける手段が営業活動記録・お客様詳細にしか無く、
   * 新しいやり取りを書いても古い次回アクションは自動では閉じないため、
   * 実際には対応していても「期限超過」がお待たせ中に残り続けていた。
   * `useNextActionActions` は既存の口（`顧客360°ビュー`・営業活動記録と共通）を
   * そのまま使う——片づけ方を画面ごとに変えない。
   * このタブ自身の一覧（`project-activities`）・概要タブの帯（`project`）・
   * ホームの「お待たせ中」とダッシュボードの「期限が過ぎたやること」も
   * 一緒に落とす（落とし忘れると「直したのに古いまま」になる）
   */
  const nextActionActions = useNextActionActions([
    ['project-activities', projectId],
    ['project', projectId],
    [...queryKeys.dashboard.inbox()],
    [...queryKeys.dashboard.overdueActions()],
  ]);

  const minutes = useQuery<MinutesResponse>({
    queryKey: ['project-minutes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/minutes`)).data,
    // **処理中の行があるあいだだけ**見に来る。ずっと回すと無駄に叩き続ける
    refetchInterval: (q) =>
      (q.state.data?.data ?? []).some((m) => m.status === 'transcribing') ? 5_000 : false,
  });
  const rows = minutes.data?.data ?? [];
  const sttAvailable = minutes.data?.stt_available !== false;
  // **整形は文字起こしとは別の鍵で動く**（Whisper は OpenAI 固定、整形は
  // OpenAI / Anthropic のどちらでもよい）。まとめて判定すると、
  // 「文字起こしは使えないが整形はできる」環境で書く枠から AI の案内が消える
  const aiAvailable = minutes.data?.ai_available !== false;
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

  /**
   * 「この整形は違う」— 待ち行列に戻す。
   *
   * **その場では整え直しません。** 1件でも AI の呼び出しは10秒近くかかり、
   * 待たせているあいだに画面を閉じられると、押したのに何も起きなかったように見えます。
   * 定時実行（毎晩 3:00）に任せ、**そのことを押す前に書きます**。
   */
  const redo = useMutation({
    mutationFn: (id: string) => api.post(`/activity-logs/${id}/format-redo`),
    meta: { action: '整え直し' },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project-activities', projectId] });
      notifySuccess((r.data as { message?: string })?.message ?? '整え直しの順番に戻しました');
    },
  });

  const onRedo = async (id: string) => {
    const ok = await confirmAction({
      title: 'この整形をやめますか',
      description: 'いま出ている整形を消して、整え直しの順番に戻します。'
        + '**打った文（原文）はそのまま残ります。**\n\n'
        + '整え直すのは毎晩 3:00 の自動処理なので、すぐには変わりません。'
        + 'それまでは打った文のまま出ます。\n\n'
        + '「違う」と押したことは記録され、整形の精度を上げる材料になります。',
      confirmLabel: '整え直す',
      tone: 'default',
    });
    if (ok) redo.mutate(id);
  };

  /**
   * 持ち帰り → タスク。**タスクの鍵も落とす** — 落とさないと、
   * タスクタブに切り替えても新しい行が出ず「作れなかった」と見える
   */
  const makeTask = useMutation({
    mutationFn: (v: { id: string; index: number }) =>
      api.post(`/projects/${projectId}/minutes/${v.id}/open-items/${v.index}/task`),
    onSuccess: (r) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task-columns', projectId] });
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      notifySuccess('タスクにしました', {
        description: `「${(r.data?.data?.title ?? '').slice(0, 40)}」をタスクタブに入れました。担当と期限はそちらで決めてください。`,
      });
    },
    onError: (e) => notifyApiError('タスクにできませんでした', e),
  });

  const { data, isLoading } = useQuery<{ data: ActivityLog[] }>({
    queryKey: ['project-activities', projectId],
    queryFn: async () =>
      (await api.get('/activity-logs', { params: { project_id: projectId, limit: 100 } })).data,
  });

  const items = data?.data ?? [];
  const today = localDateStr(new Date());

  /**
   * 書いたものを記録する。**整形はサーバーが保存時にやります**（`format: true`）。
   *
   * 画面で整形して送る形にすると、**整形に失敗したとき打った文ごと消えます**。
   * サーバー側なら、失敗しても原文のまま記録が残ります。
   */
  const write = useMutation({
    mutationFn: (p: { kind: ComposeKind; text: string }) =>
      api.post('/activity-logs', {
        project_id: projectId,
        activity_type: p.kind,
        activity_date: localDateStr(new Date()),
        description: p.text,
        format: true,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project-activities', projectId] });
      // 概要タブの「お客様とのやり取り」と、タブの件数も読み直す
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      const why = (r.data?.data as { format_error?: string } | undefined)?.format_error;
      // **整えられなかったことを黙らない。** 黙ると「AI が効いていない」に気づけない
      notifySuccess(why ? '記録しました（整えられませんでした）' : '整えて記録しました',
        why ? { description: why } : undefined);
    },
    onError: (e) => notifyApiError('記録できませんでした', e),
  });

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <ComposeBox
        busy={write.isPending}
        canEdit={canEdit}
        aiAvailable={aiAvailable}
        sttAvailable={sttAvailable}
        onSubmit={(kind, text) => write.mutate({ kind, text })}
        onRecord={() => setRecOpen(true)}
      />

      {isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : items.length === 0 ? (
        <EmptyState
          title="やり取りの記録はまだありません"
          description="上の欄に打って「整えて記録する」を押してください。メールは AI が自動で取り込みます。"
        />
      ) : (
        // **1つの枠に行を詰めるのをやめた。** 1件ずつが会話の形を持つので、
        // 区切り線で並べると「どこまでが1件か」が読めない（カードごとに離す）
        <div className="flex flex-col gap-3">
          {items.map((a) => (
            <ThreadCard
              key={a.id}
              a={a}
              today={today}
              canEdit={canEdit}
              onRedo={onRedo}
              redoing={redo.isPending}
              nextActionActions={nextActionActions}
            />
          ))}
        </div>
      )}

      <Link
        to="/sales/activity-logs"
        className="text-sub min-h-tap inline-flex items-center self-start text-primary hover:underline lg:min-h-[36px]"
      >
        営業活動の画面で見る（案件をまたいだ一覧）
      </Link>

      {rows.length > 0 && (
        <>
          <h2 className="text-h2 mt-1">議事録</h2>
          {rows.map((m) => (
            <MinutesCard
              key={m.id}
              m={m}
              canEdit={canEdit}
              canDelete={canDeleteMinutes}
              detailPath={(id) => `/projects/${projectId}/minutes/${id}`}
              busy={save.isPending || remove.isPending || makeTask.isPending}
              onSave={(patch) => save.mutate({ id: m.id, patch })}
              onMakeTask={(index) => makeTask.mutate({ id: m.id, index })}
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
          <strong className="font-bold">持ち帰りは1件ずつタスクにできます</strong>（議事録を開くとボタンが出ます）。
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
