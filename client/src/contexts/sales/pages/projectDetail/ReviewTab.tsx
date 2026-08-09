/**
 * 案件詳細 / ふりかえりタブ (v4 ⑥ 案件記録)
 *
 * ── 実施記録がメイン、お金と進み方がサブ ────────────────────
 *
 * 前の版は お金 → 進み方 → 実施の記録 の縦一列でした。開くと**数字が先に3枚**あり、
 * 書く場所（実施の記録）に着くまでスクロールが要ります。ふりかえりは
 * **書く画面**なので、書くところを先頭に置きます（指示書 2-1）。
 * PC は左に実施記録（`minmax(0,1fr)`）・右 340px に お金 → 進み方、
 * スマホは実施記録が先頭です。
 *
 * ── 実施記録は KPT ────────────────────────────────────────
 *
 * 「よかったこと・次に活かすこと」の自由行をやめ、K / P / T の3枠にしました
 * （`review/KptPanel.tsx`・migration 185）。**書いた人と日付を1件ずつ残します**。
 *
 * ── 当日の写真 ──────────────────────────────────────────────
 *
 * BOX の「社外と共有するフォルダ／08_写真」に貯めます（`review/PhotoGrid.tsx`）。
 * **報告資料の生成そのものはこの回では作りません** — 貯めるところまでです。
 *
 * ── 作り話をしない ──────────────────────────────────────────
 *
 * 「見積より N% 高く売れた」のような気の利いた文は出しません。
 * **数字を並べるだけ**にして、どう読むかは人が決めます。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, NotebookPen, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useProjectTasks } from '@/contexts/tasks/hooks/useProjectTasks';
import { useAuth } from '@/contexts/platform/AuthContext';
import { localDateStr } from '@/lib/format';
// **姓の取り出しは1か所**（トップの挨拶と同じ関数）。写すと、空白の扱いを
// 片方だけ直したときに「寺井さん」と「寺井 隆宏 さん」が画面によって混ざる
import { familyName } from '@/contexts/platform/pages/home/Greeting';
import { KptPanel, type KptItem } from './review/KptPanel';
import { ReviewSide } from './review/ReviewSide';
import { PhotoGrid, type PhotoItem, MAX_PHOTOS } from './review/PhotoGrid';
import type { ProjectDetail } from './types';
import type { ReviewSummary } from './review/ReviewSide';

interface Report {
  headline: string | null;
  attendees_onsite: number | null;
  attendees_online: number | null;
  attendees_note: string | null;
  report_status: 'draft' | 'confirmed';
  reported_at: string | null;
}
interface ReportPayload {
  found: boolean;
  report?: Report;
  summary?: ReviewSummary;
  kpt?: KptItem[];
}
interface EstimateRow { status: string; version: number; subtotal: number; discount: number }

const num = (v: unknown): number => Number(v) || 0;

export function ReviewTab({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient();
  const { currentUser, permissions } = useAuth();
  const isMobile = useIsMobile();
  const canEdit = currentUser?.role === 'system_admin'
    || ['editor', 'manager', 'owner'].includes(permissions?.sales ?? '');

  const q = useQuery<ReportPayload>({
    queryKey: ['event-report', project.id],
    queryFn: async () => (await api.get(`/keep/event-reports/${project.id}`)).data.data,
  });

  const estimates = useQuery<EstimateRow[]>({
    queryKey: ['estimates', project.id],
    queryFn: async () => (await api.get(`/projects/${project.id}/estimates`)).data.data,
  });

  /**
   * 当日の写真。**BOX が落ちていてもふりかえりは開ける** — サーバーは
   * 失敗しても 200 で返し、`reason` に理由を入れます（書類タブと同じ決め）。
   */
  const photos = useQuery<{ data: PhotoItem[]; reason?: string }>({
    queryKey: ['project-photos', project.id],
    queryFn: async () =>
      (await api.get(`/projects/${project.id}/box-files`, { params: { scope: 'external', subfolder: 'photos' } })).data,
    staleTime: 60_000,
  });

  const { data: tasks = [] } = useProjectTasks(project.id, null);

  const [draft, setDraft] = useState<Partial<Report> | null>(null);
  const cur = { ...(q.data?.report ?? {}), ...(draft ?? {}) } as Partial<Report>;
  const dirty = draft !== null && Object.keys(draft).length > 0;
  const set = (patch: Partial<Report>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));

  const invalidateReport = () => {
    qc.invalidateQueries({ queryKey: ['event-report', project.id] });
    // 隔週キープの一覧も読み直す（同じ表を出しているので、片方だけ古いと食い違う）
    qc.invalidateQueries({ queryKey: ['keep-event-reports'] });
  };

  const save = useMutation({
    mutationFn: () => api.put(`/keep/event-reports/${project.id}`, {
      headline: cur.headline ?? null,
      attendees_onsite: cur.attendees_onsite ?? null,
      attendees_online: cur.attendees_online ?? null,
      attendees_note: cur.attendees_note ?? null,
      report_status: cur.report_status ?? 'draft',
    }),
    onSuccess: () => { setDraft(null); invalidateReport(); notifySuccess('ふりかえりを保存しました'); },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  // KPT の書き込みは4つとも同じ鍵を落とす。**1つ忘れると、その操作だけ画面が古いまま**
  const kptAdd = useMutation({
    mutationFn: (v: { kind: KptItem['kind']; body: string }) =>
      api.post(`/keep/event-reports/${project.id}/kpt`, v),
    onSuccess: invalidateReport,
    onError: (e) => notifyApiError('足せませんでした', e),
  });
  const kptUpdate = useMutation({
    mutationFn: (v: { id: string; body: string }) => api.put(`/keep/kpt/${v.id}`, { body: v.body }),
    onSuccess: invalidateReport,
    onError: (e) => notifyApiError('直せませんでした', e),
  });
  const kptConfirm = useMutation({
    mutationFn: (id: string) => api.post(`/keep/kpt/${id}/confirm`),
    onSuccess: invalidateReport,
    onError: (e) => notifyApiError('確かめられませんでした', e),
  });
  const kptDelete = useMutation({
    mutationFn: (id: string) => api.delete(`/keep/kpt/${id}`),
    onSuccess: invalidateReport,
    onError: (e) => notifyApiError('消せませんでした', e),
  });
  const kptDraft = useMutation({
    mutationFn: () => api.post(`/keep/event-reports/${project.id}/kpt/draft`),
    onSuccess: (r) => {
      invalidateReport();
      const d = r.data?.data as { created: number; skipped?: string };
      // **起こせなかった理由を黙らない。** 押しても何も起きないのが一番困る
      notifySuccess(
        d.created > 0 ? `下書きを ${d.created} 件つくりました` : '下書きは作りませんでした',
        d.skipped ? { description: d.skipped } : { description: '確かめてから確定にしてください。' },
      );
    },
    onError: (e) => notifyApiError('下書きを作れませんでした', e),
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      for (const f of files.slice(0, MAX_PHOTOS)) fd.append('files', f);
      return api.post(`/projects/${project.id}/box-files`, fd, { params: { scope: 'external', subfolder: 'photos' } });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['project-photos', project.id] });
      const failed = (r.data?.data?.failed ?? []) as string[];
      notifySuccess('写真を BOX に置きました',
        failed.length > 0 ? { description: `入らなかったもの: ${failed.join(' / ')}` } : undefined);
    },
    onError: (e) => notifyApiError('写真を置けませんでした', e),
  });

  if (q.isError) return <ErrorPanel title="ふりかえりを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={6} /></Delayed></div>;

  const s = q.data?.summary;
  // **出した見積のうち最新のもの。** 作成中の版は「出した金額」ではない
  const sent = (estimates.data ?? [])
    .filter((e) => e.status === 'accepted' || e.status === 'sent' || e.status === 'superseded')
    .sort((a, b) => b.version - a.version)[0];
  const quoted = sent ? num(sent.subtotal) - num(sent.discount) : null;

  const total = tasks.length;
  const done = tasks.filter((t) => t.is_completed).length;
  const today = localDateStr(new Date());
  const late = tasks.filter((t) => t.due_date && !t.is_completed && t.due_date < today).length;

  const kptBusy = kptAdd.isPending || kptUpdate.isPending || kptConfirm.isPending
    || kptDelete.isPending || kptDraft.isPending;

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <LineChart className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <h2 className="text-h2 min-w-0 flex-1">ふりかえり</h2>
        {cur.report_status === 'confirmed' && (
          <span className="text-note rounded-badge bg-success-surface px-2 py-1 font-bold text-success">確定</span>
        )}
      </div>

      {/*
        **実施記録が主・お金と進み方が従。** スマホは1列なので、
        この並びのまま上から積まれます（実施記録が先頭に来る）
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ① 実施記録（メイン） */}
        <section className="rounded-card overflow-hidden border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border-faint px-4 py-2.5">
            <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-cardtitle min-w-0 flex-1">実施記録</h3>
          </div>

          <div className="flex flex-col gap-3.5 p-4">
            <div>
              <Label htmlFor="rv-headline">ひとことで言うと</Label>
              <Input
                id="rv-headline"
                value={cur.headline ?? ''}
                disabled={!canEdit}
                maxLength={120}
                placeholder="例）ハイブリッド配信で現地 120 名・オンライン 480 名。機材トラブルなし。"
                onChange={(e) => set({ headline: e.target.value })}
              />
            </div>

            <KptPanel
              items={q.data?.kpt ?? []}
              myName={familyName(currentUser?.name) || 'わたし'}
              canEdit={canEdit}
              busy={kptBusy}
              aiAvailable
              onAdd={(kind, body) => kptAdd.mutate({ kind, body })}
              onUpdate={(id, body) => kptUpdate.mutate({ id, body })}
              onConfirm={(id) => kptConfirm.mutate(id)}
              onDelete={async (id) => {
                const ok = await confirmAction({
                  title: 'この行を消しますか',
                  description: '戻せません。AI が起こした行を消した記録は、次の下書きに効きます。',
                  confirmLabel: '消す',
                  tone: 'danger',
                });
                if (ok) kptDelete.mutate(id);
              }}
              onDraft={() => kptDraft.mutate()}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="rv-onsite">来場（現地）</Label>
                <Input id="rv-onsite" type="number" className="font-number" disabled={!canEdit}
                  value={cur.attendees_onsite ?? ''}
                  onChange={(e) => set({ attendees_onsite: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="rv-online">視聴（オンライン）</Label>
                <Input id="rv-online" type="number" className="font-number" disabled={!canEdit}
                  value={cur.attendees_online ?? ''}
                  onChange={(e) => set({ attendees_online: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="rv-note">数え方のメモ</Label>
                <Input id="rv-note" disabled={!canEdit} value={cur.attendees_note ?? ''}
                  placeholder="例）同時接続の最大値"
                  onChange={(e) => set({ attendees_note: e.target.value })} />
              </div>
            </div>
            <p className="text-note text-muted-foreground">
              <strong className="font-bold">空欄は「数えていない」</strong>として扱います（0 と区別します）。
            </p>

            <PhotoGrid
              projectId={project.id}
              photos={photos.data?.data ?? []}
              canEdit={canEdit}
              busy={upload.isPending}
              mobile={isMobile}
              reason={photoReason(photos.data?.reason)}
              onUpload={(files) => upload.mutate(files)}
            />

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                  保存する
                </Button>
                {cur.report_status !== 'confirmed' ? (
                  <Button variant="outline" disabled={save.isPending} onClick={() => set({ report_status: 'confirmed' })}>
                    確定にする
                  </Button>
                ) : (
                  <Button variant="outline" disabled={save.isPending} onClick={() => set({ report_status: 'draft' })}>
                    下書きに戻す
                  </Button>
                )}
                {dirty && <span className="text-note text-muted-foreground">保存していない直しがあります</span>}
              </div>
            )}
          </div>
        </section>

        <ReviewSide
          expectedAmount={project.expected_amount}
          quoted={quoted}
          sentVersion={sent ? sent.version : null}
          summary={s}
          taskTotal={total}
          taskDone={done}
          taskLate={late}
          eventStart={project.event_start}
        />
      </div>
    </div>
  );
}

/**
 * 写真が出せない理由。**「まだ1枚もありません」とは書きません** —
 * BOX につながっていないのか、本当に0枚なのかは別のことです
 * （書類タブと同じ言い分け）。
 */
function photoReason(reason: string | undefined): string | null {
  if (!reason) return null;
  if (reason === 'NO_FOLDER') return 'この案件の BOX フォルダがまだ作られていません（GLS を発番すると作られます）。';
  if (reason === 'NOT_CONFIGURED') return 'この環境は BOX につないでいないので、写真は置けません。';
  return 'BOX につながりませんでした。あとでもう一度見てください。';
}
