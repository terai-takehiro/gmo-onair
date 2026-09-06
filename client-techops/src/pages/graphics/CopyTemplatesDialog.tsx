// テロップCG — 「前の番組からコピー」ダイアログ（段E・④設定「見た目」タブ）。
// docs/design/v4/graphics-redesign.md §6「テンプレート」（前の番組からコピー）。
//
// 別の CG プロジェクト（＝別の番組・案件）のテンプレート一式を、このプロジェクトへ
// 新しい行として複製する——コピー元は一切変更せず、このプロジェクトの既存テンプレートも
// 残ったまま追加されるだけ（上書きではない）。一覧・選ぶ体裁は `QsheetImportPickStep.tsx`、
// カードの見た目は `TemplateManagerPage.tsx` を手本にした。
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Copy, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  copyGraphicsTemplatesFrom, fetchGraphicsProjectsList, type GraphicsProjectSummary,
} from '@/lib/graphicsApi';

function fmtUpdatedAt(value: unknown): string {
  if (!value) return '';
  try {
    return new Date(value as string).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function CopyTemplatesDialog({ projectId, open, onOpenChange, onCopied }: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopied: () => void;
}) {
  const listQuery = useQuery({
    queryKey: ['graphics-projects-list', projectId],
    queryFn: () => fetchGraphicsProjectsList(projectId),
    enabled: open,
  });
  const projects = listQuery.data ?? [];
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const pick = async (source: GraphicsProjectSummary) => {
    if (copyingId) return; // 二重クリック防止（連続で別の行を押した場合を含む）
    if (!(await confirmAction({
      title: `「${source.name}」からテンプレートをコピーしますか？`,
      description: 'このプロジェクトの既存テンプレートは残ったまま、コピー元のテンプレートが追加されます。',
      confirmLabel: 'コピーする',
    }))) return;
    setCopyingId(source.id);
    try {
      const created = await copyGraphicsTemplatesFrom(projectId, source.id);
      notifySuccess(`${created.length}件のテンプレートをコピーしました`);
      onCopied();
      onOpenChange(false);
    } catch {
      notifyError('テンプレートをコピーできませんでした。', { description: '少し待ってから、もう一度お試しください。' });
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border-faint px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            前の番組からコピー
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-6">
          <p className="mb-3 text-sub text-muted-foreground">
            コピー元にする番組・案件を選んでください。このプロジェクトの既存テンプレートは残ります。
          </p>

          {listQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
            </div>
          ) : listQuery.isError ? (
            <EmptyState
              icon={<AlertCircle />}
              title="一覧を取得できませんでした"
              description="少し待ってから、もう一度開き直してください。"
            />
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<Copy />}
              title="コピー元にできる番組・案件がまだありません"
              description="他の番組・案件でテロップCGを使い始めると、ここに出てきます。"
            />
          ) : (
            <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={copyingId !== null}
                  onClick={() => void pick(p)}
                  className="flex min-h-tap w-full items-center gap-2.5 rounded-control-md border border-border bg-card px-3 py-2.5 text-left hover:bg-surface-subtle disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sub font-bold">{p.name}</span>
                    <span className="block text-note text-muted-foreground">更新 {fmtUpdatedAt(p.updatedAt)}</span>
                  </span>
                  {copyingId === p.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border-faint px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" aria-hidden="true" />閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
