/**
 * ③「月次レビュー」— 毎月の AI 成績レビュー（下書きは夜間ジョブが自動生成）。
 *
 * ── 「確認した」は manager だけに出す ──────────────────────
 *
 * サーバー（POST /ai-activity/reviews/:id/reviewed）は sales:manager で守られている。
 * ボタンは権限で出し分ける — **押せるのに 403 を作らない**（client/CLAUDE.md）。
 *
 * ── 打刻は最初の1回が残る ──────────────────────────────────
 *
 * サーバーが COALESCE で書くため、2人目が押しても最初の確認の記録は消えない。
 * だから確認済みの行にボタンを出し直す必要は無い（押しても何も変わらない）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { formatDate } from '@gmo-onair/shared/src/client/format';
import api from '@/lib/api';
import { type ReviewRow, periodLabel } from './types';

/** レビューの系統。**知らない kind は接頭辞を落として素で出す**（黙って隠さない） */
const REVIEW_LABEL: Record<string, string> = {
  ai_review_sales: '営業',
  ai_review_production: '制作',
};

export function ReviewSection({ canReview }: { canReview: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['ai-activity', 'reviews'],
    queryFn: async () => (await api.get('/ai-activity/reviews')).data.data as { reviews: ReviewRow[] },
    staleTime: 60_000,
  });

  const mark = useMutation({
    mutationFn: async (id: string) => (await api.post(`/ai-activity/reviews/${id}/reviewed`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-activity', 'reviews'] });
      notifySuccess('確認を記録しました');
    },
    onError: (e) => notifyApiError('記録できませんでした', e),
  });

  const reviews = q.data?.reviews ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base lg:text-lg">
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          月次レビュー
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-note text-muted-foreground">
          毎月、前月ぶんの AI 成績レビューの下書きが自動で作られます。
          {canReview
            ? ' 内容を読んだら「確認した」を押してください（最初の確認が記録として残ります）。'
            : ' 「確認した」を押せるのは案件管理の管理職です。'}
        </p>

        {q.isError ? (
          <ErrorPanel title="月次レビューを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Delayed><SkeletonRows rows={3} /></Delayed>
        ) : reviews.length === 0 ? (
          <p className="text-sub text-muted-foreground">
            月次レビューはまだ作られていません（月が変わると自動で下書きが出ます）。
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="text-sub block font-bold">
                    {periodLabel(r.period_key)}（{REVIEW_LABEL[r.kind] ?? r.kind.replace(/^ai_review_/, '')}）
                  </span>
                  <span className="text-note block text-muted-foreground">
                    作成 {formatDate(r.created_at)}
                  </span>
                </span>
                {r.reviewed_at ? (
                  <span className="text-note inline-flex shrink-0 items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    確認済み（{formatDate(r.reviewed_at)}）
                  </span>
                ) : canReview ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={mark.isPending}
                    onClick={() => mark.mutate(r.id)}
                  >
                    {mark.isPending && mark.variables === r.id
                      ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      : null}
                    確認した
                  </Button>
                ) : (
                  <span className="text-note shrink-0 text-muted-foreground">未確認</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
