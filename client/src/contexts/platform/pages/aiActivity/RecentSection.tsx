/**
 * ①「AIの活動（直近）」— AI が出したものを新しい順に 50 件。
 *
 * ── 一覧に本文は出さない ────────────────────────────────────
 *
 * API（/ai-activity/recent）が payload 全文を返さないのは意図で、
 * 取込メールの本文などを一覧に載せない。中身を読みたいときは
 * 対象レコード側の画面（案件・議事録・受領書類）で見る。
 *
 * ── 表ではなく行のカードで組む ──────────────────────────────
 *
 * 375px で6列の表は必ずはみ出す。1件を「1行目: 種類＋状態バッジ /
 * 2行目: 時刻・対象・モデル」の2段に畳み、PC でもそのまま使う
 * （読む頻度の高い「何を・どうなった」が先頭に来る）。
 */
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import api from '@/lib/api';
import {
  type RecentOutput, KIND_LABEL, TARGET_LABEL, STATE_BADGE, outputState, timeLabel,
} from './types';

interface Payload { total: number; outputs: RecentOutput[] }

export function RecentSection() {
  const q = useQuery({
    queryKey: ['ai-activity', 'recent'],
    queryFn: async () => (await api.get('/ai-activity/recent', { params: { limit: 50 } })).data.data as Payload,
    staleTime: 60_000,
  });

  const outputs = q.data?.outputs ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base lg:text-lg">
          <Activity className="h-4 w-4" aria-hidden="true" />
          AI の活動（直近）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-note text-muted-foreground">
          AI が出したものを新しい順に並べています（最大 50 件）。
          <strong className="font-bold">「未確認」は人がまだ見ていない</strong>という意味で、
          「直すところが無かった」ではありません。中身は対象の画面で確認してください。
        </p>

        {q.isError ? (
          <ErrorPanel title="AI の活動を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Delayed><SkeletonRows rows={5} /></Delayed>
        ) : outputs.length === 0 ? (
          // 空 = 「まだ動いていない」。読めない（エラー）とは上で分けている
          <p className="text-sub text-muted-foreground">まだ AI の活動がありません。</p>
        ) : (
          <ul className="divide-y divide-border">
            {outputs.map((o) => {
              const badge = STATE_BADGE[outputState(o)];
              const target = o.target_table
                ? (TARGET_LABEL[o.target_table] ?? o.target_table)
                : null;
              return (
                <li key={o.id} className="flex flex-col gap-0.5 py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sub font-bold">{KIND_LABEL[o.kind] ?? o.kind}</span>
                    <span className={`rounded-badge-xs px-1.5 py-0.5 text-badge font-bold ${badge.tone}`}>
                      {badge.label}
                    </span>
                    {/* 修正の内訳（fix/enrich…）。'none' は「無修正」の記録なので出さない */}
                    {o.correction_types.filter((t) => t !== 'none').length > 0 && (
                      <span className="text-note text-muted-foreground">
                        {o.correction_types.filter((t) => t !== 'none').join(' / ')}
                      </span>
                    )}
                  </span>
                  <span className="text-note flex flex-wrap items-center gap-x-2 text-muted-foreground">
                    <span className="font-number">{timeLabel(o.created_at)}</span>
                    {target && <span>対象: {target}</span>}
                    {o.model && <span>{o.model}</span>}
                    {o.prompt_version && <span>prompt {o.prompt_version}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
