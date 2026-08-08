/**
 * ⑦ 標準工程テンプレート（v4 案件管理・モックの8枚目）
 *
 * ── モックの案をそのまま初期値に入れた（ご判断）──────────────
 *
 * モックの `flowSpec` は **6 段 26 タスク**で、担当の職種・実施日からの
 * 逆算日数・必須かどうかまで書かれています。文書で整理し直すより、
 * **画面で目にしながら直すほうが早い**ので、そのまま入れてあります。
 *
 * ── どの工程を外すかは書いていない ──────────────────────────
 *
 * モックは種類ごとに工程数が違います（リアルイベント 18 / ハイブリッド 26 /
 * 生放送 24 / 公開収録 22 / 収録ありイベント 20 / スタジオ収録 14）。
 * ただし**どれを外すのかは書かれていません。**
 * 推測で 8 本消すと「この種類には要らない工程」を勝手に決めることになり、
 * しかも消えたことに誰も気づけません。
 * → **26 本の型を1つ入れ、複製して削ってもらう**形にしました。画面にもそう書きます。
 *
 * ── 案件をつくったときに黙って入れない（ご判断）────────────
 *
 * 一覧を見せてチェックを外してから入れます（`ApplyFlowDialog`）。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Copy, Trash2, Plus, Info, Lock, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel, EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { ProjectTypeLabels, type ProjectType } from '@/types';
import { FlowTaskRow } from './FlowTaskRow';
import type { FlowTemplate } from './flowTypes';

export default function FlowTemplatePage() {
  const qc = useQueryClient();
  const { currentUser, permissions } = useAuth();
  const canEdit = currentUser?.role === 'system_admin'
    || ['manager', 'owner'].includes(permissions?.sales ?? '');

  const [picked, setPicked] = useState<string | null>(null);
  const [dupName, setDupName] = useState('');
  const [dupOpen, setDupOpen] = useState(false);

  const q = useQuery<FlowTemplate[]>({
    queryKey: ['flow-templates'],
    queryFn: async () => (await api.get('/flow-templates')).data.data,
  });

  const tpl = q.data?.find((t) => t.id === picked) ?? q.data?.[0] ?? null;
  const total = tpl?.phases.reduce((n, p) => n + p.tasks.length, 0) ?? 0;
  const required = tpl?.phases.reduce((n, p) => n + p.tasks.filter((k) => k.is_required).length, 0) ?? 0;

  const dup = useMutation({
    mutationFn: async () => (await api.post(`/flow-templates/${tpl!.id}/duplicate`, { name: dupName })).data.data,
    onSuccess: (d: { id: string }) => {
      qc.invalidateQueries({ queryKey: ['flow-templates'] });
      setPicked(d.id);
      setDupOpen(false);
      setDupName('');
      notifySuccess('型を複製しました', { description: '要らない工程を削ってお使いください。' });
    },
    onError: (e) => notifyApiError('複製できませんでした', e),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/flow-templates/${id}`),
    onSuccess: () => { setPicked(null); qc.invalidateQueries({ queryKey: ['flow-templates'] }); notifySuccess('型を消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const setTypes = useMutation({
    mutationFn: (types: string[]) => api.put(`/flow-templates/${tpl!.id}`, { project_types: types }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow-templates'] }),
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const addTask = useMutation({
    mutationFn: ({ phaseId, title }: { phaseId: string; title: string }) =>
      api.post(`/flow-templates/phases/${phaseId}/tasks`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow-templates'] }),
    onError: (e) => notifyApiError('足せませんでした', e),
  });

  if (q.isError) return <ErrorPanel title="工程の型を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <Delayed><SkeletonRows rows={8} /></Delayed>;

  return (
    <div className="flex flex-col gap-3.5 p-3 lg:gap-4 lg:p-6">
      <PageHeader
        title="標準工程テンプレート"
        sub="案件詳細の工程を、自社の運用に合わせて決めます。案件をつくるときに一覧を見せて、要らないものを外してから入れます。"
        primaryAction={canEdit && tpl ? (
          <Button variant="outline" onClick={() => { setDupName(`${tpl.name}（複製）`); setDupOpen(true); }}>
            <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />複製する
          </Button>
        ) : undefined}
      />

      {!canEdit && (
        <p className="rounded-note text-note flex items-center gap-2 border border-border bg-surface-subtle px-3.5 py-2.5 text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          直せるのは<strong className="font-bold">案件管理の管理者</strong>だけです。
          型を変えると<strong className="font-bold">以後すべての案件に効く</strong>ので、1件を直すより強い権限にしてあります。
        </p>
      )}

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        {/* 型のレール */}
        <div className="rounded-card w-full shrink-0 overflow-hidden border border-border bg-card lg:w-[240px]">
          <p className="text-th border-b border-border-faint px-3.5 py-2.5 text-muted-foreground">工程の型</p>
          {q.data.map((t) => {
            const n = t.phases.reduce((s, p) => s + p.tasks.length, 0);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setPicked(t.id)}
                className={cn(
                  'min-h-tap flex w-full items-center gap-2.5 border-b border-border-faint px-3.5 py-2.5 text-left last:border-b-0',
                  tpl?.id === t.id ? 'bg-primary-surface-weak' : 'bg-card',
                )}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tpl?.id === t.id ? 'bg-primary' : 'bg-border')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('text-list block truncate', tpl?.id === t.id && 'text-primary')}>{t.name}</span>
                  <span className="text-note block text-muted-foreground">
                    {n} 工程{t.project_types.length > 0 ? ` ・ ${t.project_types.length} 種類` : ' ・ すべての種類'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {!tpl ? (
            <EmptyState title="工程の型がありません" description="複製して作るか、システム管理者に入れてもらってください。" />
          ) : (
            <>
              <div className="rounded-card overflow-hidden border border-border bg-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
                  <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-info-surface">
                    <ListChecks className="h-4 w-4 text-info" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-cardtitle block">{tpl.name}</span>
                    <span className="text-note block text-muted-foreground">
                      {tpl.phases.length} 段 ・ {total} 工程（うち外せないもの {required}）
                    </span>
                  </span>
                  {canEdit && !tpl.is_system && (
                    <Button
                      variant="outline" size="sm" className="text-destructive"
                      onClick={() => confirmAction({
                        title: `${tpl.name} を消しますか`,
                        description: 'すでに案件へ入れた工程は残ります。これから案件をつくるときに選べなくなるだけです。',
                        confirmLabel: '消す', tone: 'danger',
                      }).then((ok) => ok && del.mutate(tpl.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>

                {/* どの種類で使うか */}
                <div className="border-b border-border-faint px-4 py-3">
                  <p className="text-th mb-1.5 text-muted-foreground">この型を使う案件の種類</p>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(ProjectTypeLabels) as ProjectType[]).map((pt) => {
                      const on = tpl.project_types.includes(pt);
                      return (
                        <button
                          key={pt}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setTypes.mutate(
                            on ? tpl.project_types.filter((x) => x !== pt) : [...tpl.project_types, pt],
                          )}
                          className={cn(
                            'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
                            on ? 'border-transparent bg-primary-surface text-primary' : 'border-border bg-card text-muted-foreground',
                            !canEdit && 'opacity-60',
                          )}
                        >
                          {ProjectTypeLabels[pt]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-note mt-1.5 text-muted-foreground">
                    1つも選ばないと<strong className="font-bold">すべての種類</strong>で使えます。
                  </p>
                </div>

                {tpl.description && (
                  <p className="text-note border-b border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
                    {tpl.description}
                  </p>
                )}
              </div>

              {/* 段ごとの工程 */}
              {tpl.phases.map((ph) => (
                <div key={ph.id} className="rounded-card overflow-hidden border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-2.5">
                    <span className="text-cardtitle shrink-0">{ph.name}</span>
                    <span className="text-note min-w-0 flex-1 text-muted-foreground">{ph.tasks.length} 工程</span>
                  </div>
                  {ph.tasks.map((k) => <FlowTaskRow key={k.id} task={k} canEdit={canEdit} />)}
                  {canEdit && (
                    <form
                      className="flex items-center gap-2 bg-surface-subtle px-4 py-2.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const el = (e.currentTarget.elements.namedItem('t') as HTMLInputElement);
                        if (el.value.trim()) { addTask.mutate({ phaseId: ph.id, title: el.value }); el.value = ''; }
                      }}
                    >
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <Input name="t" className="h-9 flex-1" placeholder={`${ph.name} に工程を足す`} />
                      <Button type="submit" variant="outline" size="sm" disabled={addTask.isPending}>
                        {addTask.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                        足す
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </>
          )}

          <p className="rounded-note text-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-secondary-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span>
              モックは案件の種類ごとに工程数が違います（リアルイベント 18／ハイブリッド 26／生放送 24／
              公開収録 22／収録ありイベント 20／スタジオ収録 14）。
              ただし<strong className="font-bold">どれを外すのかは書かれていません</strong>。
              推測で消すと「この種類には要らない工程」を勝手に決めることになるので、
              <strong className="font-bold">26 本の型を1つだけ入れてあります</strong>。
              種類ごとに変えたいときは<strong className="font-bold">複製して削って</strong>ください。
            </span>
          </p>
        </div>
      </div>

      {dupOpen && (
        <div className="rounded-card fixed inset-x-3 bottom-3 z-50 flex flex-wrap items-center gap-2 border border-border bg-card p-3 shadow-lg lg:inset-x-auto lg:right-6 lg:w-[420px]">
          <Input value={dupName} onChange={(e) => setDupName(e.target.value)} className="min-w-0 flex-1" placeholder="新しい型の名前" />
          <Button variant="outline" onClick={() => setDupOpen(false)}>やめる</Button>
          <Button disabled={!dupName.trim() || dup.isPending} onClick={() => dup.mutate()}>
            {dup.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            複製する
          </Button>
        </div>
      )}
    </div>
  );
}
