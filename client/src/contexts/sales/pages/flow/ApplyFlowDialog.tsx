/**
 * 標準工程を案件に入れる前の一覧（⑦）
 *
 * ── 黙って入れない（ご判断）────────────────────────────────
 *
 * 種類を選んだら 26 件のタスクが勝手に立つ、にはしません。小さい案件でも
 * 26 行並び、**使わないタスクの山でタスクタブが読めなくなります**。
 * 入る物を先に見せ、**チェックを外してから**入れます。
 *
 * ── 期限が出せない工程も隠さない ────────────────────────────
 *
 * 実施日が未定の案件では「実施日から逆算する」工程の期限が出せません。
 * **落とすと「入るはずの工程が入っていない」ことに誰も気づけない**ので、
 * 期限なしで入れます（実施日を入れたあとに手で入れ直す形）。
 * 何件が期限なしになるかは押す前に出します。
 *
 * ── 一度入れたら二度入れられない ────────────────────────────
 *
 * サーバーが `projects.flow_applied_at` で止めます。押し直しで**同じタスクが
 * 2 組**できると、どちらを消せばよいのか分からなくなるためです。
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, CalendarOff, Lock } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Delayed, SkeletonRows, ErrorPanel, EmptyState } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { ROLE_TONE, type FlowTemplate, type PreviewTask } from './flowTypes';
import { classificationKey, type Audience, type ProjectCategory } from '@/contexts/sales/classification';

export function ApplyFlowDialog({
  open, onOpenChange, projectId, audience, projectCategory, eventDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /**
   * 案件の2段分類（migration 182）。合う型を上に出すためだけに使う
   * （合う型が無くても全部出す）。**どちらか欠けていたら絞らない** —
   * 「有観客」だけでは型を選べないので、中途半端に絞ると
   * 使うべき型が下に沈みます。
   */
  audience: string | null;
  projectCategory: string | null;
  /** 実施日。**未定なら null** — 逆算の工程は期限なしで入る */
  eventDate: string | null;
}) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  /** 役割→担当者（Phase 2 ⑥）。**選ばなくても入れられる**（従来どおり未割当） */
  const [assign, setAssign] = useState<Record<string, string>>({});

  // 担当の選択肢。**写しの一覧を作らず**既存の共通鍵を使い回す
  // （出す人の範囲が画面ごとにずれるのを防ぐ）
  const users = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['users-by-module-sales'],
    queryFn: async () => (await api.get('/users/by-module/sales')).data.data,
    enabled: open,
  });

  const classification = audience && projectCategory
    ? classificationKey(audience as Audience, projectCategory as ProjectCategory)
    : null;

  const tpls = useQuery<FlowTemplate[]>({
    queryKey: ['flow-templates', 'for', classification],
    queryFn: async () => (
      await api.get('/flow-templates', { params: classification ? { classification } : undefined })
    ).data.data,
    enabled: open,
  });

  const picked = tpls.data?.find((t) => t.id === templateId) ?? tpls.data?.[0] ?? null;

  // **日付はサーバーが案件から読む。** 画面から送ると、下見に出た期限と
  // 実際に入る期限が食い違う（時差・時刻の切り落としで1日ずれる）
  const rows = useQuery<PreviewTask[]>({
    queryKey: ['flow-templates', 'preview', picked?.id, projectId],
    queryFn: async () => (
      await api.post(`/flow-templates/${picked!.id}/preview`, { project_id: projectId })
    ).data.data,
    enabled: open && !!picked,
  });

  // 型を選び直したらチェックと担当を入れ直す（前の型で選んだものを持ち越さない）
  useEffect(() => { setOff(new Set()); setAssign({}); }, [picked?.id]);

  const chosen = useMemo(
    () => (rows.data ?? []).filter((r) => r.is_required || !off.has(r.id)),
    [rows.data, off],
  );
  const noDue = chosen.filter((r) => !r.due).length;

  // 型に出てくる職種の一覧（重複を除く・行の並び順）。担当の欄はここから作る —
  // 固定の ROLES 定数から作ると、型が使っていない職種の欄まで並ぶ
  const roles = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows.data ?? []) {
      if (r.role && !seen.includes(r.role)) seen.push(r.role);
    }
    return seen;
  }, [rows.data]);

  const apply = useMutation({
    mutationFn: () => api.post(`/flow-templates/${picked!.id}/apply`, {
      project_id: projectId,
      task_ids: chosen.map((r) => r.id),
      // 役割→担当者。**未選択の役割は送らない**（渡さなければ従来どおり未割当で入る）
      assignments: Object.fromEntries(Object.entries(assign).filter(([, v]) => v !== '')),
    }),
    onSuccess: () => {
      // **4つとも落とすこと。** 同じタスクを別の鍵で持つ画面が3つある
      // （かんばんは `task-columns`・リストとガントは `project-tasks`・
      // 全案件のタスク一覧は `task-dashboard`）。1つ落とし忘れると、
      // その見え方だけ古いまま = 「入れたのに出てこない」になる。
      // `project` は帯を消すため（`flow_applied_at` を読み直す）
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task-columns', projectId] });
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      onOpenChange(false);
      notifySuccess(`${chosen.length} 件の作業を入れました`, {
        description: noDue > 0
          ? `うち ${noDue} 件は実施日が決まっていないので期限なしです。実施日を入れたあとタスクタブで入れてください。`
          : 'タスクタブから担当と期限を編集できます。',
      });
    },
    onError: (e) => notifyApiError('入れられませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="工程テンプレートを入れる"
      // **旧幅は sm:max-w-[720px] で既定の640pxを超えていた。**
      // 工程一覧の表・役割バッジが横に並ぶ複合ダイアログなので `wide` を渡す
      wide
      footer={
        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <p className="text-note flex-1 text-muted-foreground">
            <span className="font-number">{chosen.length}</span> 件を入れます
            {noDue > 0 && <>（うち <span className="font-number">{noDue}</span> 件は期限なし）</>}。
            <strong className="font-bold">入れられるのは一度だけ</strong>です。
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button disabled={!picked || chosen.length === 0 || apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            入れる
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sub text-muted-foreground">
          入る作業を確かめて、要らないもののチェックを外してください。
          型が持っているのは<strong className="font-bold">職種</strong>で、誰がやるかは案件ごとに
          決まります — 下の「役割ごとの担当者」で選べば、その役割の作業に担当が入ります
          （<strong className="font-bold">選ばなければ未割当のまま</strong>）。
        </p>

        {tpls.isError && <ErrorPanel title="工程テンプレートを読み込めませんでした" error={tpls.error} onRetry={() => tpls.refetch()} />}
        {tpls.isLoading && <Delayed><SkeletonRows rows={5} /></Delayed>}

        {tpls.data && tpls.data.length === 0 && (
          <EmptyState
            title="使える工程テンプレートがありません"
            description="設定 → 工程テンプレート で作ってから、もう一度お試しください。"
          />
        )}

        {tpls.data && tpls.data.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {tpls.data.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
                  picked?.id === t.id
                    ? 'border-transparent bg-primary-surface text-primary'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="rounded-card border border-border">
            {rows.isError && <ErrorPanel title="作業を読み込めませんでした" error={rows.error} onRetry={() => rows.refetch()} />}
            {rows.isLoading && <div className="p-3"><Delayed><SkeletonRows rows={8} /></Delayed></div>}
            {rows.data?.map((r) => {
              const on = r.is_required || !off.has(r.id);
              return (
                <label
                  key={r.id}
                  className={cn(
                    'min-h-tap flex items-start gap-2.5 border-b border-border-faint px-3.5 py-2.5 last:border-b-0',
                    !on && 'opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={r.is_required}
                    onChange={() => setOff((s) => {
                      const next = new Set(s);
                      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                      return next;
                    })}
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-badge-xs border-border"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-list block truncate">
                      <span className="text-muted-foreground">{r.phase_name}｜</span>{r.title}
                    </span>
                    <span className="text-note flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                      {r.due ? (
                        <span className="font-number">{r.due}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-warning">
                          <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" />期限なし
                        </span>
                      )}
                      <span>{r.when}</span>
                      {r.is_required && (
                        <span className="flex items-center gap-1">
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />外せません
                        </span>
                      )}
                    </span>
                  </span>
                  {r.role && (
                    <span className={cn('text-badge rounded-badge shrink-0 px-2 py-0.5 font-bold', ROLE_TONE[r.role] ?? 'bg-surface-subtle text-muted-foreground')}>
                      {r.role}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        {/* 役割ごとの担当者（Phase 2 ⑥）。型が使っている職種の分だけ欄を出す */}
        {picked && roles.length > 0 && (
          <div className="rounded-card border border-border p-3.5">
            <p className="text-th text-muted-foreground">役割ごとの担当者（選ばなくても入れられます）</p>
            <p className="text-note mt-0.5 text-muted-foreground">
              選んだ役割の作業にだけ担当が入ります。あとからタスクタブでも編集できます。
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {roles.map((role) => (
                <label key={role} className="flex items-center gap-2">
                  <span className={cn(
                    'text-badge rounded-badge w-[72px] shrink-0 px-2 py-0.5 text-center font-bold',
                    ROLE_TONE[role] ?? 'bg-surface-subtle text-muted-foreground',
                  )}
                  >
                    {role}
                  </span>
                  <select
                    value={assign[role] ?? ''}
                    onChange={(e) => setAssign((s) => ({ ...s, [role]: e.target.value }))}
                    aria-label={`${role} の担当者`}
                    className="min-h-tap rounded-control text-sub w-full min-w-0 flex-1 border border-border bg-background px-2 lg:min-h-[36px]"
                  >
                    <option value="">選ばない（あとで決める）</option>
                    {(users.data ?? []).map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {!eventDate && (
          <p className="rounded-note text-note border border-warning-border bg-warning-surface px-3.5 py-2.5 text-secondary-foreground">
            この案件は<strong className="font-bold">実施日が決まっていません</strong>。
            実施日から逆算する作業は<strong className="font-bold">期限なし</strong>で入ります
            （推測の日付は作りません）。
          </p>
        )}
      </div>
    </FormDialog>
  );
}
