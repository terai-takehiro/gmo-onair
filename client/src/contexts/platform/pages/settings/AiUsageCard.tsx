/**
 * 「AI の使用量」（システムの情報）
 *
 * ── なぜ作ったか ────────────────────────────────────────────
 *
 * 費用を下げる作業は、**削るところを選べないと始まりません**。
 * 「たぶん録音が重い」で止めると、効かない我慢だけが残ります。
 * **種類ごと・モデルごと**に、呼び出し回数・トークン・録音の分数を出します。
 *
 * ── 金額は単価が入っているときだけ ──────────────────────────
 *
 * 公開価格をコードに焼き込んでいません（変わるうえ、焼き込むと
 * 「いつの値段か」が分からないまま金額が独り歩きする）。
 * `.env` の `AI_PRICING_JSON` が入っている環境でだけ金額を出し、
 * 入っていなければ**トークンと分数だけ**を出します。
 *
 * **単価の分からないモデルは合計に足しません** — 0 として混ぜると総額が嘘になるので、
 * 「一部は金額が出せない」と画面に書きます。
 *
 * ── 失敗した回も数える ──────────────────────────────────────
 *
 * 失敗しても課金されることがあるので、外すと総額が合いません。
 * 回数の横に「うち失敗 N」を出します。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Num } from '@gmo-onair/shared/src/client/ui/numbers';
import api from '@/lib/api';

interface Row {
  kind: string;
  model: string | null;
  calls: number;
  failed: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  audio_seconds: number;
  cost_usd: number | null;
}

interface Payload {
  days: number;
  has_pricing: boolean;
  rows: Row[];
  total_cost_usd: number | null;
}

/** 種類の名前。**サーバーの `kind` と対**（増やすときは両方直す） */
const KIND_LABEL: Record<string, string> = {
  intake: '投入口の行き先判断',
  minutes: '議事録の整形',
  activity: 'やり取りの整形',
  activity_short: '次にやることを1行に',
  kpt: 'ふりかえりの下書き',
  stt: '文字起こし（本番）',
  stt_preview: '下読み（録音中）',
};

const PERIODS = [7, 30, 90];

/**
 * 録音の長さ。**1分未満を「0分」と出さない** —
 * 下読みは 20 秒の切れ端なので、丸めると「録音していない」と読めてしまう
 * （実際に画面で「0 分」と出て気づいた）。
 */
function audioLabel(sec: number) {
  if (sec <= 0) return <span className="text-muted-foreground">—</span>;
  if (sec < 60) return <Num value={sec} unit="秒" />;
  return <Num value={Math.round(sec / 60)} unit="分" />;
}

export function AiUsageCard() {
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ['admin', 'ai-usage', days],
    queryFn: async () => (await api.get('/admin/ai-usage', { params: { days } })).data.data as Payload,
    staleTime: 60_000,
  });

  const rows = q.data?.rows ?? [];
  const unknownPrice = rows.some((r) => r.cost_usd === null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base lg:text-lg">
          <Coins className="h-4 w-4" aria-hidden="true" />
          AI の使用量
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-note text-muted-foreground">
          <strong className="font-bold">いま開いている環境</strong>の呼び出しです。
          投入した文も AI の出力もここには出しません（回数と量だけ）。
          <strong className="font-bold">失敗した回も数えます</strong>
          — 失敗しても課金されることがあるためです。
        </p>

        {/* 期間の切り替え。**先月と比べたい**ことがあるので 90 日まで持つ */}
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
          <ErrorPanel title="使用量を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Delayed><SkeletonRows rows={4} /></Delayed>
        ) : rows.length === 0 ? (
          <p className="text-sub text-muted-foreground">
            直近 {days} 日に AI の呼び出しはありません。
          </p>
        ) : (
          <>
            {/* 横スクロールで囲う（スマホで表がはみ出さない） */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="text-th pb-2 pr-4">種類 / モデル</th>
                    <th className="text-th pb-2 pr-4 text-right">回数</th>
                    <th className="text-th pb-2 pr-4 text-right">入力</th>
                    <th className="text-th pb-2 pr-4 text-right">出力</th>
                    <th className="text-th pb-2 pr-4 text-right">録音</th>
                    <th className="text-th pb-2 text-right">概算</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.kind}:${r.model ?? '-'}`} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-4">
                        <span className="block">{KIND_LABEL[r.kind] ?? r.kind}</span>
                        <span className="text-sub block text-muted-foreground">{r.model ?? 'モデル不明'}</span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <Num value={r.calls} />
                        {r.failed > 0 && (
                          <span className="text-sub block text-warning">うち失敗 {r.failed}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <Num value={r.input_tokens} />
                        {/* **キャッシュで読めたぶんを別に出す。** 並べ替えの効果はここに出る */}
                        {r.cached_input_tokens > 0 && (
                          <span className="text-sub block text-success">
                            うち再利用 {Math.round((r.cached_input_tokens / Math.max(r.input_tokens, 1)) * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right"><Num value={r.output_tokens} /></td>
                      <td className="py-2 pr-4 text-right">{audioLabel(r.audio_seconds)}</td>
                      <td className="py-2 text-right">
                        {r.cost_usd === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="font-number">${r.cost_usd.toFixed(2)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-note text-muted-foreground">
              {q.data?.total_cost_usd !== null && q.data?.total_cost_usd !== undefined ? (
                <>
                  直近 {days} 日の概算は
                  <strong className="font-number font-bold"> ${q.data.total_cost_usd.toFixed(2)}</strong> です。
                  {unknownPrice && '（単価を入れていないモデルは合計に含めていません）'}
                </>
              ) : (
                <>
                  金額は出していません。
                  <code className="mx-1">AI_PRICING_JSON</code>
                  を .env に入れると概算が出ます（入れなくてもトークンと分数で重さは分かります）。
                </>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
