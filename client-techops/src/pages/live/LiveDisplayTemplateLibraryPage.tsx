// 計時・視聴者（liveops）— 表示レイアウト テンプレートライブラリ（v4.1・PR3・
// TemplateLibrary.dc.html 相当）。
//
// `/techops/live-display-templates`。`:ownerKey` を取らない全案件横断の画面
// （既存の `/techops/live-org-settings` と同じ非ownerKeyパターン）。
// `?fromTimer=<timerId>` 付きで開いたときだけ「現在のレイアウトを保存」タイルを出す
// （設計 §6-1）。スマホ対応の対象（`TECHOPS_PC_ONLY` には登録しない。設計 §6-3・§9-3）。
//
// 権限: 一覧・検索の閲覧は qsheet reader。作成・削除・適用のボタンは qsheet manager
// のときだけ描画する（サーバー側も `canWrite` で二重防御済み — 設計 §6-4）。
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LayoutTemplate, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import type { DisplayLayout } from '@gmo-onair/shared/src/client/live/displayLayout';
import { DisplayLayoutMiniPreview } from './DisplayLayoutMiniPreview';
import { SaveCurrentTemplateDialog, ApplyTemplateDialog, DeleteTemplateDialog } from './DisplayTemplateDialogs';
import { notifyError, notifySuccess } from '@/lib/notify';
import type { TemplateRow } from './displayTemplateTypes';

function TemplateCard({ template, canManage, onApply, onDelete }: {
  template: TemplateRow;
  canManage: boolean;
  onApply: () => void;
  onDelete: () => void;
}) {
  const usageCount = Number(template.usage_count) || 0;
  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <DisplayLayoutMiniPreview layout={template.layout} />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{template.name}</p>
            <p className="text-xs text-muted-foreground">使用中 {usageCount}件</p>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <Button variant="outline" size="icon-sm" className="min-h-tap min-w-tap" onClick={onApply} aria-label="適用">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="min-h-tap min-w-tap text-destructive hover:text-destructive" onClick={onDelete} aria-label="削除">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SaveCurrentTemplateTile({ disabled, onOpen }: { disabled: boolean; onOpen: () => void }) {
  return (
    <Card>
      <CardContent className="p-3">
        <button
          type="button" disabled={disabled} onClick={onOpen}
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
          <span className="px-4 text-center">{disabled ? 'このタイマーのレイアウトは未設定です' : '現在のレイアウトを保存'}</span>
        </button>
      </CardContent>
    </Card>
  );
}

export default function LiveDisplayTemplateLibraryPage() {
  const [searchParams] = useSearchParams();
  const fromTimer = searchParams.get('fromTimer');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [applyTarget, setApplyTarget] = useState<TemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ['display-templates', q],
    queryFn: () => api.get('/liveops/display-templates', { params: q ? { q } : undefined }).then((r) => r.data.data as TemplateRow[]),
  });

  const fromTimerLayoutQuery = useQuery({
    queryKey: ['timer-layout', fromTimer],
    queryFn: () => api.get(`/liveops/timers/${fromTimer}/layout`).then((r) => r.data.data as DisplayLayout | null),
    enabled: !!fromTimer,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/liveops/display-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['display-templates'] });
      notifySuccess('テンプレートを削除しました');
      setDeleteTarget(null);
    },
    onError: () => notifyError('削除に失敗しました'),
  });

  const templates = templatesQuery.data ?? [];
  const showSaveTile = !!fromTimer && canManage;
  const invalidateTemplates = () => qc.invalidateQueries({ queryKey: ['display-templates'] });

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mb-4">
        <h1 className="text-lg font-bold">表示レイアウト テンプレート</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          全案件横断で使える、表示画面レイアウトのひな形です。適用すると選んだタイマーへコピーされ、以後テンプレート側を変えても適用済みのタイマーの表示には影響しません。
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input className="pl-8" placeholder="名前で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {templatesQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : templates.length === 0 && !showSaveTile ? (
        <EmptyState
          icon={<LayoutTemplate />}
          title={q ? '該当するテンプレートがありません' : 'テンプレートがありません'}
          description={q ? '検索条件を変えてお試しください。' : 'タイマー管理からレイアウトを編集し、「テンプレート」→「現在のレイアウトを保存」で最初のテンプレートを作れます。'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {showSaveTile && (
            <SaveCurrentTemplateTile disabled={!fromTimerLayoutQuery.data} onOpen={() => setSaveDialogOpen(true)} />
          )}
          {templates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              canManage={canManage}
              onApply={() => setApplyTarget(tpl)}
              onDelete={() => setDeleteTarget(tpl)}
            />
          ))}
        </div>
      )}

      {showSaveTile && (
        <SaveCurrentTemplateDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          layout={fromTimerLayoutQuery.data ?? null}
          onSaved={invalidateTemplates}
        />
      )}

      <ApplyTemplateDialog
        template={applyTarget}
        defaultTimerId={fromTimer}
        onOpenChange={(open) => { if (!open) setApplyTarget(null); }}
        onApplied={invalidateTemplates}
      />

      <DeleteTemplateDialog
        template={deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        pending={deleteMutation.isPending}
      />
    </div>
  );
}
