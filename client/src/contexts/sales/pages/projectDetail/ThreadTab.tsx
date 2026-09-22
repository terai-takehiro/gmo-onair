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
 * 保存時に AI が 見出し・整えた本文・要点・次のアクション を起こします。
 * **原文は必ず残る**ので、整形が的外れなときは戻せます。
 *
 * **打合せの録音から議事録を起こせます**。録音 → Whisper で文字起こし →
 * AI が決定事項と持ち帰りを下書き → 人が直して確定、の順です。
 * 確定するときに**どこを直したかがサーバーで自動記録され**、次の下書きに効きます
 * (会社方針「AI を使い捨てにしない」の条件2と4)。
 *
 * ── この回で足したこと（利用者のご指摘3・4）────────────────
 *
 * 1件ごとに**次のアクションを片づけられ**（完了 / 延期 / 編集 / 削除）、
 * **本文を手動で編集できる**ようになりました（`thread/useThreadEdit.ts`）。
 * 前は読むだけだったので、関係なくなったやることが永久に残り、
 * AI の整形が少し違っていても「整え直す」で賭け直すしかありませんでした。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Info } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import { RecordDialog } from './thread/RecordDialog';
import { MinutesCard } from './thread/MinutesCard';
import { ComposeBox, type ComposeKind } from './thread/ComposeBox';
import { ThreadCard } from './thread/ThreadCard';
import { useThreadEdit } from './thread/useThreadEdit';
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

  const minutes = useQuery<MinutesResponse>({
    queryKey: ['project-minutes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/minutes`)).data,
    // **処理中の行があるあいだだけ**見に来る。ずっと回すと無駄に叩き続ける
    refetchInterval: (q) =>
      (q.state.data?.data ?? []).some((m) => m.status === 'transcribing') ? 5_000 : false,
    // **開くたびに必ず読み直す**（ProjectDetailPage.tsx の `['project', id]` と同じ注記）
    staleTime: 0,
    refetchOnMount: 'always',
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
    onSuccess: () => { invalidate(); notifySuccess('削除しました'); },
    onError: (e) => notifyApiError('削除できませんでした', e),
  });

  /**
   * やり取りの1件を直す口（保存・完了・延期・次のアクションの削除）。
   *
   * **カードごとに `api.put` を書かないこと。** `PUT /activity-logs/:id` は
   * 全項目の置き換えなので、送り忘れた項目が黙って消えます
   * （`thread/useThreadEdit.ts` の冒頭）。
   */
  const edit = useThreadEdit(projectId);

  /**
   * 「この整形は違う」— 待ち行列に戻す。
   *
   * **その場では整え直しません。** 1件でも AI の呼び出しは10秒近くかかり、
   * 待たせているあいだに画面を閉じられると、押したのに何も起きなかったように見えます。
   * 定時実行（毎晩 3:00）に任せ、**そのことを押す前に書きます**。
   */
  const redo = useMutation({
    mutationFn: (id: string) => api.post(`/activity-logs/${id}/format-redo`),
    meta: { action: 'やり取りを整形' },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project-activities', projectId] });
      notifySuccess((r.data as { message?: string })?.message ?? 'AI が整える順番に戻しました');
    },
  });

  const onRedo = async (id: string) => {
    const ok = await confirmAction({
      title: 'この整形を取り消しますか',
      description: 'いま表示している整形を破棄し、AI が整える順番に戻します。'
        + '**原文はそのまま残ります。**\n\n'
        + 'AI が整えるのは毎晩 3:00 の自動処理なので、すぐには変わりません。'
        + 'それまでは原文のまま表示します。\n\n'
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
    mutationFn: (v: { id: string; index: number; assigned_to?: string }) =>
      api.post(`/projects/${projectId}/minutes/${v.id}/open-items/${v.index}/task`,
        // 担当（Phase 2 ⑥）。**選ばなければ送らない** = 従来どおり未割当で入る
        v.assigned_to ? { assigned_to: v.assigned_to } : undefined),
    onSuccess: (r) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task-columns', projectId] });
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      notifySuccess('タスクにしました', {
        description: `「${(r.data?.data?.title ?? '').slice(0, 40)}」をタスクタブに入れました。担当や期限はそちらで編集できます。`,
      });
    },
    onError: (e) => notifyApiError('タスクにできませんでした', e),
  });

  const { data, isLoading } = useQuery<{ data: ActivityLog[] }>({
    queryKey: ['project-activities', projectId],
    queryFn: async () =>
      (await api.get('/activity-logs', { params: { project_id: projectId, limit: 100 } })).data,
    // **開くたびに必ず読み直す**（ProjectDetailPage.tsx の `['project', id]` と同じ注記）
    staleTime: 0,
    refetchOnMount: 'always',
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
      notifySuccess(why ? '記録しました（AI が整えられませんでした）' : '記録しました（AI が整えました）',
        why ? { description: why } : undefined);
    },
    onError: (e) => notifyApiError('記録できませんでした', e),
  });

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      {/*
        ⚠️ **書く枠は `sales` の editor にだけ出す**（#727 の宿題⑤・実ブラウザで確認）。
        以前は閲覧（reader）の人にも枠ごと出し、入力欄・「記録する」「録音から起こす」を
        押せない状態（disabled）で並べていた。押せないだけで理由は書かれていないので、
        **「壊れている」と見分けがつかない**うえ、`POST /activity-logs`・
        `POST /projects/:id/minutes` はどちらも editor を要求するので、reader が記録する手段はそもそも無い。
        営業活動記録の「活動を記録」を reader に出さないのと同じ扱いにそろえる
        （`shared/tests/clickable403.test.ts` がこの形を見ている）
      */}
      {canEdit && (
        <ComposeBox
          busy={write.isPending}
          canEdit={canEdit}
          aiAvailable={aiAvailable}
          sttAvailable={sttAvailable}
          onSubmit={(kind, text) => write.mutate({ kind, text })}
          onRecord={() => setRecOpen(true)}
        />
      )}

      {isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : items.length === 0 ? (
        <EmptyState
          title="やり取りの記録はまだありません"
          // 書く枠を出さない人（reader）に「上の欄に打って」と案内しない（枠が無い）
          description={canEdit
            ? '上の欄に打って「記録する」を押してください。メールは AI が自動で取り込みます。'
            : 'メールは AI が自動で取り込みます。記録するには営業の編集権限が必要です。'}
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
              edit={edit}
              onRedo={onRedo}
              redoing={redo.isPending}
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
              onMakeTask={(index, assignedTo) => makeTask.mutate({ id: m.id, index, assigned_to: assignedTo })}
              onDelete={async () => {
                const ok = await confirmAction({
                  title: '議事録を削除しますか',
                  description: '文字起こしも一緒に削除されます。元の音声は保存していないため、元に戻せません。',
                  confirmLabel: '削除',
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
          <strong className="font-bold">録音した音声は文字にしたら保存せず破棄します。</strong>
          残るのは文字起こしと議事録だけです。録音を残したい打合せは、BOX の社内限りフォルダに置いてください。
          <strong className="font-bold">未解決事項は1件ずつタスクにできます</strong>（議事録を開くとボタンが出ます）。
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
