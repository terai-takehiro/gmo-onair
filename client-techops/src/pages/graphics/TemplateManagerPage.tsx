// テロップCG — テンプレート管理画面（`/techops/graphics/:ownerKey/templates`・段6-2）。
//
// docs/design/v4/graphics.md §2「部品→**テンプレート**→ページ→送出リスト」の第2層。
// 部品ライブラリ（`PartLibraryPage.tsx`）の「組み合わせてテンプレートを作る」から来る。
// フルの「複数部品を1画面にレイアウトするキャンバス」は対象外 — ここは
// テンプレート（部品1つ＋初期値＋公開フィールド）の一覧・作成・編集・削除だけ。
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, Blocks, ChevronLeft, Loader2, Pencil, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  PART_LABELS, deleteGraphicsTemplate, fetchGraphicsTemplates,
  type GraphicsTemplateRow,
} from '@/lib/graphicsApi';
import type { OwnerContext } from '@/lib/deviceSettingsApi';
import { useGraphicsProject } from './useGraphicsProject';
import { SlotBadge } from './badges';
import { PART_LIBRARY_CARDS } from './partLibraryData';
import TemplateFormDialog from './TemplateFormDialog';

const PART_ICON = new Map(PART_LIBRARY_CARDS.map((c) => [c.partKey, c.icon]));

export function graphicsTemplatesQueryKey(projectId: string) {
  return ['graphics-templates', projectId] as const;
}

export default function TemplateManagerPage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const { state } = useGraphicsProject(ownerKey);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<Blocks />} title="見つかりませんでした" description="GLS番号・案件ID・番組IDを確認してください。" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={state.message} />
      </div>
    );
  }

  return (
    <TemplateManagerContent
      ownerKey={ownerKey ?? ''}
      owner={state.owner}
      projectId={state.bundle.project.id}
    />
  );
}

function partsPath(ownerKey: string): string {
  return `/techops/graphics/${encodeURIComponent(ownerKey)}/parts`;
}

function TemplateManagerContent({ ownerKey, owner, projectId }: {
  ownerKey: string;
  owner: OwnerContext;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = graphicsTemplatesQueryKey(projectId);
  const listQuery = useQuery({ queryKey, queryFn: () => fetchGraphicsTemplates(projectId) });
  const templates = listQuery.data ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GraphicsTemplateRow | null>(null);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: GraphicsTemplateRow) => { setEditing(t); setFormOpen(true); };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGraphicsTemplate(id),
    onSuccess: () => {
      notifySuccess('テンプレートを削除しました');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => notifyError('テンプレートを削除できませんでした'),
  });

  const removeTemplate = async (t: GraphicsTemplateRow) => {
    if (!(await confirmAction({
      title: `テンプレート「${t.name}」を削除しますか？`,
      description: 'このテンプレートから作られた既存のページは、削除後も通常のページとしてそのまま残ります。',
      confirmLabel: '削除する',
      tone: 'danger',
    }))) return;
    deleteMutation.mutate(t.id);
  };

  const handleSaved = () => { void queryClient.invalidateQueries({ queryKey }); };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={partsPath(ownerKey)}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        部品ライブラリへ戻る
      </Link>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-h1">テンプレート ／ {owner.name}</h1>
          <p className="mt-1 text-sub text-muted-foreground">
            部品を選んで初期値を入れ、<strong className="font-bold text-foreground">オペレーターが編集できる欄だけ</strong>を絞り込みます。ゼロから描く場所ではありません。
          </p>
        </div>
        <div className="flex-1" />
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />テンプレートを作る
        </Button>
      </div>

      {listQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : templates.length === 0 ? (
        <div className="mt-4 rounded-card border border-border bg-card">
          <EmptyState
            icon={<Blocks />}
            title="テンプレートがまだありません"
            description="「テンプレートを作る」から、部品を選んで最初のテンプレートを作れます。"
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => openEdit(t)}
              onDelete={() => void removeTemplate(t)}
            />
          ))}
        </div>
      )}

      <TemplateFormDialog
        projectId={projectId}
        template={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={handleSaved}
      />
    </div>
  );
}

function TemplateCard({ template, onEdit, onDelete }: {
  template: GraphicsTemplateRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = PART_ICON.get(template.partKey) ?? Blocks;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-3.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-list font-bold">{template.name}</span>
      </div>
      {template.layers && template.layers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-5 items-center whitespace-nowrap rounded-control bg-info-surface px-1.5 text-[10px] font-bold text-info">
            複数部品（{template.layers.length}個）
          </span>
          <span className="min-w-0 truncate text-note text-muted-foreground">
            {template.layers.map((l) => PART_LABELS[l.partKey]).join('・')}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <SlotBadge slot={template.slot} />
          <span className="inline-flex h-5 items-center whitespace-nowrap rounded-control bg-surface-subtle px-1.5 text-[10px] font-bold text-muted-foreground">
            {PART_LABELS[template.partKey]}
          </span>
          <span className="inline-flex h-5 items-center whitespace-nowrap rounded-control bg-info-surface px-1.5 text-[10px] font-bold text-info">
            公開 {template.publicFields.length}件
          </span>
        </div>
      )}
      {template.description && (
        <p className="line-clamp-2 text-note leading-relaxed text-muted-foreground">{template.description}</p>
      )}
      <div className="mt-auto flex justify-end gap-1 pt-1">
        <Button type="button" variant="ghost" size="icon" aria-label={`テンプレート「${template.name}」を編集`} onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={`テンプレート「${template.name}」を削除`} onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
