/**
 * ⑦ 標準工程テンプレート (v4 GPM)
 *
 * ── 中身を畳んで見せる ──────────────────────────────────────
 *
 * 1つのひな形が 工程10 × タスク4 = 40 行あるので、開いたまま並べると
 * 2つで画面が終わります。**畳んでおいて、開いたものだけ中身を出します。**
 *
 * ── 消せるのは manager、既定のひな形は消せない ──────────────
 *
 * 権限が無い人にはボタンを出しません（出しても押せば 403 になるだけ）。
 * 既定のひな形（`is_system`）はサーバーが弾くので、**押せない形にして
 * 理由をその場に出します** — 消してから「消せません」と言われるより早い。
 *
 * ── 消す前に何が起きるかを出す ──────────────────────────────
 *
 * 消しても**適用済みのプロジェクトは変わりません**（写して使うため）。
 * ただし次に同じ工程を組む人は一から作ることになるので、
 * 適用件数を確認に出します。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useGpmTemplates, useInvalidateGpm } from '../queries';
import type { GpmTemplate } from '../types';
import { TemplateDialog } from './templates/TemplateDialog';

export default function GpmTemplateListPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const canManage = hasPermission('sales', 'manager');
  const invalidate = useInvalidateGpm();

  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<GpmTemplate | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading, isError, refetch } = useGpmTemplates();
  const templates = useMemo(() => data ?? [], [data]);

  const remove = useMutation({
    mutationFn: (t: GpmTemplate) => api.delete(`/gpm/templates/${t.id}`),
    onSuccess: () => { invalidate(); notifySuccess('工程テンプレートを削除しました'); },
    onError: (err) => notifyApiError('工程テンプレートを削除できませんでした', err),
  });

  const onDelete = async (t: GpmTemplate) => {
    const ok = await confirmAction({
      title: `「${t.name}」を削除しますか？`,
      description: [
        t.used_count > 0
          ? `この工程テンプレートから作った ${t.used_count} 件のプロジェクトは変わりません（作るときに写しているため）。`
          : 'この工程テンプレートから作ったプロジェクトはまだありません。',
        '消すと、次に同じ工程を組む人は一から作ることになります。',
      ].join('\n'),
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) remove.mutate(t);
  };

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="工程テンプレート"
        sub={
          data
            ? `${templates.length}件 ・ プロジェクトを作成するときに複製して使用します（あとで直しても適用済みには影響しません）`
            : 'プロジェクトを作成するときに複製して使用します'
        }
        primaryAction={
          canEdit ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />工程テンプレートを作成
            </Button>
          ) : undefined
        }
      />

      {isError ? (
        <ErrorPanel title="工程テンプレートを読み込めませんでした" onRetry={() => refetch()} />
      ) : isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" aria-hidden="true" />}
          title="工程テンプレートがまだありません"
          description="よく作る工程の並びを登録しておくと、プロジェクトを作成ときに日付付きで一気に入ります。"
          action={canEdit ? <Button onClick={() => setAdding(true)}>工程テンプレートを作成</Button> : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              open={open === t.id}
              onToggle={() => setOpen(open === t.id ? null : t.id)}
              canEdit={canEdit}
              canManage={canManage}
              onEdit={() => setEditing(t)}
              onDelete={() => onDelete(t)}
            />
          ))}
        </div>
      )}

      {(adding || editing) && (
        <TemplateDialog template={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </div>
  );
}

function TemplateCard({
  t, open, onToggle, canEdit, canManage, onEdit, onDelete,
}: {
  t: GpmTemplate;
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tasks = t.phases.reduce((n, p) => n + p.tasks.length, 0);
  const days = t.phases.reduce((n, p) => n + (Number(p.days) || 0), 0);

  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-3 lg:px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-h-tap flex min-w-0 flex-1 items-center gap-2.5 text-left lg:min-h-[40px]"
        >
          {open
            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="text-cardtitle flex items-center gap-2">
              <span className="truncate">{t.name}</span>
              {t.is_system && (
                <span className="text-badge shrink-0 rounded-badge-xs bg-info-surface px-1.5 py-0.5 text-info">
                  最初から入っているもの
                </span>
              )}
            </span>
            {t.description && <span className="text-sub block text-muted-foreground">{t.description}</span>}
          </span>
        </button>

        {/* **`shrink-0` を付けない。** 4つの数字と2つのボタンを縮まない塊にすると、
            375px で親の折り返しより先に幅が確定して**44px はみ出す**（実測）。
            折り返せる形にしておけば、狭いときは数字が2段になるだけで済む */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Stat label="工程" value={t.phases.length} />
          <Stat label="タスク" value={tasks} />
          <Stat label="目安" value={days} unit="日" />
          <Stat label="適用中" value={t.used_count} unit="件" tone={t.used_count > 0 ? 'info' : 'muted'} />
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />編集
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={t.is_system}
              title={t.is_system ? '最初から入っている工程テンプレートは削除できません' : 'この工程テンプレートを削除'}
            >
              <Trash2 className={cn('h-3.5 w-3.5', !t.is_system && 'text-destructive')} aria-hidden="true" />
              <span className="sr-only">削除</span>
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border-subtle bg-surface-subtle p-3 lg:px-4">
          {t.phases.length === 0 ? (
            <p className="text-sub text-muted-foreground">工程がまだ入っていません。「編集」から追加できます。</p>
          ) : (
            t.phases.map((p, i) => (
              <div key={p.id} className="rounded-control-lg border border-border bg-card p-2.5">
                <p className="text-list flex flex-wrap items-baseline gap-2">
                  <span className="text-sub-sm font-number text-muted-foreground">{i + 1}</span>
                  {p.label}
                  <span className="text-sub-sm font-number text-muted-foreground">{p.days}日</span>
                  {p.role && <span className="text-sub-sm text-muted-foreground">{p.role}</span>}
                </p>
                {p.tasks.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 border-l-2 border-border-faint pl-3">
                    {p.tasks.map((k) => (
                      <li key={k.id} className="text-sub flex flex-wrap items-baseline gap-2 text-muted-foreground">
                        <span className="text-foreground">{k.label}</span>
                        <span className="font-number">{k.days}日</span>
                        {k.role && <span>{k.role}</span>}
                        {k.is_required && (
                          <span className="text-badge rounded-badge-xs bg-warning-surface px-1.5 py-0.5 text-warning">
                            必須
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function Stat({
  label, value, unit, tone = 'muted',
}: {
  label: string;
  value: number;
  unit?: string;
  tone?: 'muted' | 'info';
}) {
  return (
    <span
      className={cn(
        'text-badge rounded-badge px-2 py-1',
        tone === 'info' ? 'bg-info-surface text-info' : 'bg-muted text-muted-foreground',
      )}
    >
      {label} <span className="font-number">{value}</span>{unit}
    </span>
  );
}
