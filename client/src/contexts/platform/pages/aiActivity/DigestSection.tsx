/**
 * ②「成績」— kind ごとの無修正採用率・件数・よく直される項目 top3。
 *
 * ── 分母は「人が確認した件数」──────────────────────────────
 *
 * サーバーの digest は `ai_corrections` の記録がある出力だけを分母にする
 * （未確認を混ぜると、確認しない運用ほど採用率が上がって見える）。
 * だから**分母が小さい種類は率だけで判断しない** — 件数を必ず横に出す。
 *
 * ── 数字はサーバーの digest をそのまま出す ──────────────────
 *
 * MCP の `get_ai_feedback_digest`（メール取込スキルが生成前に読む）と
 * 同じ集計（`getFeedbackDigest`）なので、AI が見ている成績と
 * この画面の成績が食い違わない（同じ数字を2か所で数えない）。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Num } from '@gmo-onair/shared/src/client/ui/numbers';
import api from '@/lib/api';
import { type KindDigest, KIND_LABEL } from './types';

interface Payload { window_days: number; digests: KindDigest[] }

const PERIODS = [7, 30, 90];

/** 率の見せ方。**null（分母0）は「—」** — 0% と出すと「全部直された」と読める */
function rateLabel(rate: number | null) {
  if (rate === null) return <span className="text-muted-foreground">—</span>;
  return <span className="font-number text-lg font-bold">{Math.round(rate * 100)}%</span>;
}

export function DigestSection() {
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ['ai-activity', 'digest', days],
    queryFn: async () => (await api.get('/ai-activity/digest', { params: { days } })).data.data as Payload,
    staleTime: 60_000,
  });

  const digests = q.data?.digests ?? [];
  // 1件も確認されていない種類は畳んで最後にまとめる（カード10枚のうち
  // 8枚が「—」だと、動いている2枚が埋もれる）
  const active = digests.filter((d) => d.reviewed_outputs > 0);
  const idle = digests.filter((d) => d.reviewed_outputs === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base lg:text-lg">
          <Gauge className="h-4 w-4" aria-hidden="true" />
          成績
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-note text-muted-foreground">
          <strong className="font-bold">人が確認した件数だけ</strong>が分母です
          （未確認を混ぜると、確認しない運用ほど良く見えてしまうため）。
          メール取込の AI も同じ数字を読んで自分の出し方を直します。
        </p>

        <div className="flex flex-wrap gap-2">
          {PERIODS.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={d === days ? 'default' : 'outline'}
              onClick={() => setDays(d)}
            >
              直近 {d} 日
            </Button>
          ))}
        </div>

        {q.isError ? (
          <ErrorPanel title="成績を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Delayed><SkeletonRows rows={4} /></Delayed>
        ) : active.length === 0 ? (
          <p className="text-sub text-muted-foreground">
            直近 {days} 日に、人が確認した AI の出力はありません。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((d) => (
              <div key={d.kind} className="rounded-card border border-border p-3.5">
                <p className="text-sub font-bold">{KIND_LABEL[d.kind] ?? d.kind}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  {rateLabel(d.as_is_rate)}
                  <span className="text-note text-muted-foreground">
                    無修正採用（確認 <Num value={d.reviewed_outputs} /> 件中 <Num value={d.accepted_as_is} /> 件）
                  </span>
                </p>
                {d.top_corrected_field_types.length > 0 && (
                  <div className="mt-2">
                    <p className="text-note text-muted-foreground">よく直される項目</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {d.top_corrected_field_types.slice(0, 3).map((f) => (
                        <li key={f.field_path} className="text-note flex items-baseline justify-between gap-2">
                          <code className="min-w-0 break-all">{f.field_path}</code>
                          <span className="shrink-0 text-muted-foreground"><Num value={f.corrections} /> 件</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 動いていない種類も名前は出す — 「そもそも回っていない」ことが分かるように */}
        {!q.isError && !q.isLoading && idle.length > 0 && (
          <p className="text-note text-muted-foreground">
            この期間に確認の記録が無い種類:{' '}
            {idle.map((d) => KIND_LABEL[d.kind] ?? d.kind).join('・')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
