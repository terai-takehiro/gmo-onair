/**
 * AI が作った案件の「確認した」(v4 ⑥ 概要タブ)
 *
 * ── これは会社方針の記録面です（「AI を使い捨てにしない」）──────────
 *
 * AI がメールから起票した案件を、**人が見たかどうか**を残す唯一の場所です。
 * `POST /projects/:id/ai-review` が押した人と時刻を書き込み、
 * ダッシュボードの「AI が作ったもの」の待ち行列から外れます。
 * 押さないと、その案件はいつまでも「まだ誰も見ていない」ままになります。
 *
 * ── どこから来たか ──────────────────────────────────────────
 *
 * 元は案件フォーム（`/sales/projects/:id/edit`）の中だけにありました。
 * v4 で「読む画面」と「直す画面」を分けたので、**内容が合っているかを見る場所**
 * ＝概要タブへ移しました。フォームに置いたままだと、確認するために
 * 編集画面を開くことになります（直す気が無いのに直せる画面を開かせない）。
 *
 * ── 指示した人の名前は出しません ────────────────────────────
 *
 * `ai_requested_by` は **AI が名簿と突き合わせず自由記述で書く値**で、実在する方の
 * 名前が別の字で記録されていたことがあります（`docs/wording.md`）。
 * 「AI が作った」という事実だけを出します。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Check, CheckCircle2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';

export function AiReviewBanner({
  projectId, reviewedAt,
}: {
  projectId: string;
  reviewedAt: string | null | undefined;
}) {
  const qc = useQueryClient();

  const review = useMutation({
    mutationFn: async () => api.post(`/projects/${projectId}/ai-review`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.aiInbox() });
      notifySuccess('確認したことを記録しました');
    },
    onError: (err) => notifyApiError('確認したことを記録できませんでした', err),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-ai-border bg-ai-surface p-3">
      <Sparkles className="h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
      {/* 文言はモック（`v4-live-sales.dc.html` の案件詳細）のまま */}
      <span className="min-w-0 flex-1">
        <span className="text-list block text-foreground">この案件は AI が起票しました</span>
        <span className="text-note block text-muted-foreground">
          まだ誰も内容を確かめていません。確認するまで「未確認」として残ります。
        </span>
      </span>
      {reviewedAt ? (
        <span className="text-sub font-number flex shrink-0 items-center gap-1.5 text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          確認済み（{new Date(reviewedAt).toLocaleString('ja-JP', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
          })}）
        </span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1"
          disabled={review.isPending}
          onClick={() => review.mutate()}
        >
          {review.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          確認した
        </Button>
      )}
    </div>
  );
}
