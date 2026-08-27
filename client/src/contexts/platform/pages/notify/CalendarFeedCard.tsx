/**
 * タスク期限をカレンダーで購読（Phase 2 ⑦）
 *
 * ── なぜ通知ページに置くか ──────────────────────────────
 * 「自分のタスクの期限を手元のカレンダーに出す」は知らせ方の設定そのもの。
 * サーバーの口は `GET/POST /dailyops/tasks/feed-token`（dailyops reader）なので、
 * **dailyops 権限が無い人にはこの節ごと出さない**（呼び出し側でゲートする —
 * 出すと押した瞬間に 403 が返るだけの節になる）。
 *
 * ── URL はトークン式・再発行で旧 URL は無効 ────────────────
 * カレンダーアプリは認証ヘッダを送れないため、推測できない長いトークンを
 * URL に埋める方式（在否を伏せるため不一致は 404）。漏れたときは再発行で
 * 無効化できるが、**そのとき購読済みのカレンダーは黙って止まる**ので、
 * 「旧 URL が無効になる」ことを押す前に必ず読ませる（confirmAction）。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';

interface FeedToken {
  token: string | null;
  feed_url: string | null;
}

export function CalendarFeedCard() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const q = useQuery<FeedToken>({
    queryKey: ['task-feed-token'],
    queryFn: async () => (await api.get('/dailyops/tasks/feed-token')).data.data,
  });

  const issue = useMutation({
    mutationFn: async () => (await api.post('/dailyops/tasks/feed-token')).data.data as FeedToken,
    onSuccess: (data) => {
      // 応答に新しい token/feed_url がそのまま入っているので、読み直さず差し替える
      qc.setQueryData(['task-feed-token'], data);
      notifySuccess('購読用の URL を発行しました', {
        description: '以前に発行した URL があった場合、その URL は無効になっています。',
      });
    },
    onError: (e) => notifyApiError('発行できませんでした', e),
  });

  /** 再発行だけは一段止める — 購読済みのカレンダーが黙って止まるため */
  const onReissue = async () => {
    const ok = await confirmAction({
      title: 'URL を作り直しますか',
      description: '作り直すと、**いまの URL はその場で無効**になります。'
        + '購読しているカレンダーには、新しい URL を登録し直してください。',
      confirmLabel: '作り直す',
      tone: 'danger',
    });
    if (ok) issue.mutate();
  };

  const copy = async () => {
    const url = q.data?.feed_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境（http など）。欄を選択させてコピーしてもらう
      notifyApiError('コピーできませんでした', new Error('URL の欄を押すと全選択されるので、そこからコピーしてください'));
    }
  };

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
        <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-primary-surface text-primary">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-cardtitle shrink-0">タスク期限をカレンダーで購読</span>
        <span className="text-note min-w-0 flex-1 text-muted-foreground">
          自分のタスクの期限を Google カレンダーなどに出します（本人専用の URL）
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3">
        {q.isError && <ErrorPanel title="購読の設定を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />}
        {q.isLoading && <Delayed><SkeletonRows rows={2} /></Delayed>}

        {q.data && (q.data.token ? (
          <>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <input
                readOnly
                value={q.data.feed_url ?? ''}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="カレンダー購読用の URL"
                className="min-h-tap rounded-control font-number text-sub w-full min-w-0 flex-1 border border-border bg-surface-subtle px-2.5 lg:min-h-[36px]"
              />
              <Button variant="outline" onClick={copy} className="shrink-0">
                {copied
                  ? <Check className="mr-1.5 h-4 w-4 text-success" aria-hidden="true" />
                  : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                {copied ? 'コピーしました' : 'URL をコピー'}
              </Button>
            </div>
            <p className="text-note text-muted-foreground">
              カレンダーアプリの「URL で追加（照会・購読）」にこの URL を貼ります。
              未完了のタスクの期限（過去30日〜未来1年・30分の枠）が出て、
              カレンダー側が数時間おきに読み直します。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={issue.isPending} onClick={onReissue}>
                {issue.isPending
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                URL を作り直す
              </Button>
              {/* 取り返しのつかない副作用は押す前から見えるところに書く */}
              <span className="text-note text-warning">作り直すと、いまの URL は無効になります。</span>
            </div>
          </>
        ) : (
          <>
            <p className="text-sub text-muted-foreground">
              まだ発行していません。発行すると、あなた専用の購読 URL ができます
              （URL を知っている人は期限の一覧を見られるので、人に渡さないでください）。
            </p>
            <Button disabled={issue.isPending} onClick={() => issue.mutate()} className="self-start">
              {issue.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              購読用の URL を発行する
            </Button>
          </>
        ))}
      </div>
    </div>
  );
}
