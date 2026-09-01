// テロップCG — ハブ画面の「未作画」列（`GraphicsHubPage.tsx` から切り出し。
// ファイルサイズ規律・400行 — `node scripts/check-file-size.mjs`）。
//
// docs/design/v4/graphics.md §3「発注 → 作画」— デザイナーがここから発注を拾って
// `PageFormDialog` に事前入力した状態で開く（「ページにする」）。0件なら何も描かない
// （常設の空欄で圧迫しない）。5件を超える分は「すべて見る」で発注一覧（`RequestFormPage.tsx`）へ。
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  PART_LABELS,
  fetchGraphicsRequests, updateGraphicsRequest,
  type GraphicsRequestRow,
} from '@/lib/graphicsApi';

const VISIBLE_LIMIT = 5;

export function graphicsRequestsQueryKey(projectId: string) {
  return ['graphics-requests', projectId, 'requested'] as const;
}

export default function RequestQueueSection({ projectId, ownerKey, onConvert }: {
  projectId: string;
  ownerKey: string;
  /** 「ページにする」を押したときに、その発注の内容で `PageFormDialog` を開いてもらう */
  onConvert: (request: GraphicsRequestRow) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = graphicsRequestsQueryKey(projectId);

  const listQuery = useQuery({
    queryKey,
    queryFn: () => fetchGraphicsRequests(projectId, 'requested'),
  });
  const requests = listQuery.data ?? [];

  const dismissMutation = useMutation({
    mutationFn: (id: string) => updateGraphicsRequest(id, { status: 'dismissed' }),
    onSuccess: () => {
      notifySuccess('却下しました');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => notifyError('却下できませんでした'),
  });

  const dismiss = async (req: GraphicsRequestRow) => {
    if (!(await confirmAction({
      title: `発注「${req.title}」を却下しますか？`,
      description: '一覧からは消えますが、発注自体は残ります（発注者側で状態が確認できます）。',
      confirmLabel: '却下する',
      tone: 'danger',
    }))) return;
    dismissMutation.mutate(req.id);
  };

  if (listQuery.isLoading) {
    return (
      <div className="mt-4 flex justify-center rounded-card border border-border bg-card py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (requests.length === 0) return null;

  const visible = requests.slice(0, VISIBLE_LIMIT);
  const restCount = requests.length - visible.length;

  return (
    <section className="mt-4 overflow-hidden rounded-card border border-warning/40 bg-warning/5">
      <div className="flex items-center justify-between gap-3 border-b border-warning/30 px-4 py-2">
        <h2 className="text-th font-bold">未作画の発注（{requests.length}件）</h2>
        <Link
          to={`/techops/graphics/${encodeURIComponent(ownerKey)}/request`}
          className="text-sub font-bold text-primary hover:underline"
        >
          すべて見る
        </Link>
      </div>
      {visible.map((req) => (
        <div key={req.id} className="flex items-center gap-3 border-b border-warning/20 px-4 py-2 last:border-b-0">
          <div className="min-w-0 flex-1">
            <p className="truncate text-list font-bold">{req.title}</p>
            <p className="truncate text-note text-muted-foreground">
              {[
                req.desiredPartKey ? PART_LABELS[req.desiredPartKey] : null,
                req.desiredTiming,
                req.requestedBy ? `依頼: ${req.requestedBy}` : null,
              ].filter(Boolean).join(' ／ ') || '（詳細なし）'}
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => onConvert(req)}>
            ページにする
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`発注「${req.title}」を却下`}
            onClick={() => void dismiss(req)}
          >
            <X className="h-4 w-4 text-destructive" aria-hidden="true" />
          </Button>
        </div>
      ))}
      {restCount > 0 && (
        <div className="px-4 py-2 text-note text-muted-foreground">
          ほか {restCount} 件 —{' '}
          <Link
            to={`/techops/graphics/${encodeURIComponent(ownerKey)}/request`}
            className="font-bold text-primary hover:underline"
          >
            すべて見る
          </Link>
        </div>
      )}
    </section>
  );
}
