/**
 * ⑦-② 足りないページ（`docs/design/v4/wiki.md` §6-⑦・§7-2・モック `Review.dc.html`）
 *
 * AI が出典を出せずに答えられなかった質問が、**聞かれた回数の多い順**に並びます。
 * ここでページを書き起こすのが「使うほど賢くなる」経路の本体です（§7-2）。
 *
 * ⚠️ **却下しても行は消えません**（サーバーが `dismissed` にするだけ）。消すと、
 * 一度「書かない」と決めた質問が次に来たときまた先頭に並びます。
 *
 * ⚠️ **聞いた人の名前は出しません。** 誰が知らなかったかは、この場で要る情報では
 * ありません（要るのは「何が書かれていないか」だけ）。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileQuestion, Plus, X } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import {
  Delayed, EmptyState, ErrorPanel, NoPermissionPanel, SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { shortDayLabel } from './reviewLabels';
import { postGapResolve, reviewKeys, type ReviewGap } from './reviewApi';
import ReviewGapSheet from './ReviewGapSheet';

export interface ReviewGapsTabProps {
  gaps: ReviewGap[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** 足りないページは manager だけが読めます（§8） */
  canManage: boolean;
  /** スペースで絞っているか（0件のときの案内を変える） */
  filtered: boolean;
}

export default function ReviewGapsTab({
  gaps, loading, error, onRetry, canManage, filtered,
}: ReviewGapsTabProps) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<ReviewGap | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dismiss = useMutation({
    meta: { action: '「書かない」の記録' },
    mutationFn: (gap: ReviewGap) => postGapResolve(gap.id, 'dismissed'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.all });
      notifySuccess('一覧から外しました', {
        description: '同じ質問がまた来ても、この一覧の先頭には並びません。記録は残ります。',
      });
    },
    onSettled: () => setBusyId(null),
  });

  const askAndDismiss = async (gap: ReviewGap) => {
    const ok = await confirmAction({
      title: 'この質問はページにしませんか？',
      description: `「${gap.question}」を一覧から外します。記録は残るので、あとから数えられます。`,
      confirmLabel: '却下',
    });
    if (!ok) return;
    setBusyId(gap.id);
    dismiss.mutate(gap);
  };

  if (!canManage) {
    return (
      <NoPermissionPanel modules={['wiki']} level="manager" target="足りないページの一覧" />
    );
  }
  if (error) {
    return <ErrorPanel title="足りないページを読み込めませんでした" error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return <Delayed><SkeletonRows rows={5} /></Delayed>;
  }
  if (!gaps || gaps.length === 0) {
    return (
      <EmptyState
        icon={<FileQuestion className="h-6 w-6" aria-hidden />}
        title={filtered ? 'このスペースで答えられなかった質問はありません' : '答えられなかった質問はありません'}
        description={
          filtered
            ? 'ほかのスペースを選ぶか、「すべてのスペース」に戻すと全部が出ます。'
            : '「AI に聞く」で出典を出せなかった質問が、ここに回数つきでたまります。'
        }
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
      <div className="text-th hidden items-center gap-3 border-b border-border-subtle bg-surface-subtle px-4 py-2 text-muted-foreground lg:flex">
        <span className="w-[56px] shrink-0 text-right">回数</span>
        <span className="min-w-0 flex-1">AI が答えられなかった質問</span>
        <span className="w-[112px] shrink-0">スペース</span>
        <span className="w-[96px] shrink-0">最後に聞かれた</span>
        <span className="w-[196px] shrink-0" />
      </div>

      <ul className="flex flex-col">
        {gaps.map((gap) => {
          const busy = busyId === gap.id;
          return (
            <li key={gap.id} className="border-b border-border-faint last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 lg:flex-nowrap lg:py-2">
                <span className="w-[56px] shrink-0 text-right text-h2 tabular-nums text-foreground">
                  {gap.count}
                </span>

                <div className="min-w-0 flex-1 basis-[55%]">
                  <p className="text-list leading-snug text-foreground [overflow-wrap:anywhere]">
                    {gap.question}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sub-sm text-muted-foreground lg:hidden">
                    <span>{gap.space_name ?? 'スペース未定'}</span>
                    <span>最後に聞かれた {shortDayLabel(gap.last_asked_at)}</span>
                  </p>
                </div>

                <span className="hidden w-[112px] shrink-0 truncate text-sub text-muted-foreground lg:block">
                  {gap.space_name ?? '未定'}
                </span>
                <span className="hidden w-[96px] shrink-0 truncate text-sub tabular-nums text-muted-foreground lg:block">
                  {shortDayLabel(gap.last_asked_at)}
                </span>

                <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto lg:w-[196px] lg:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-tap flex-1 sm:flex-none lg:min-h-0"
                    onClick={() => setPicked(gap)}
                  >
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                    ページを作成
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    className="min-h-tap flex-1 text-muted-foreground sm:flex-none lg:min-h-0"
                    onClick={() => void askAndDismiss(gap)}
                  >
                    <X className="mr-1.5 h-4 w-4" aria-hidden />
                    却下
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-border-faint px-4 py-3 text-sub-sm text-muted-foreground">
        同じ質問は空白と記号を落として1件にまとめ、回数を数えています。
        「ページを作成」では、AI に下書きを書かせるか、題だけの空のページを作るかを選べます。
        どちらも下書きなので、読んで直してから公開してください（公開すると次から出典つきで答えられます）。
      </p>

      <ReviewGapSheet open={picked !== null} onOpenChange={(v) => !v && setPicked(null)} gap={picked} />
    </div>
  );
}
