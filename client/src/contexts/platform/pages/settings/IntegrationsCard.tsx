/**
 * 「外部サービスにつながっているか」（システムの情報）
 *
 * ── なぜ作ったか ────────────────────────────────────────────
 *
 * 「録音が動かない」「AI が行き先を決めてくれない」の原因の大半は
 * **その環境に鍵が入っていない**ことです。ところが確かめる手段が
 * **VPS に入って `.env` を読む**しかありませんでした。
 * `docker-compose.yml` は検証側に `OPENAI_API_KEY_DEV` → `OPENAI_API_KEY` の
 * 順で渡しますが、**どちらの名前で入っているかは外から見えません**。
 *
 * この画面は**いま開いている環境**の答えを出します。検証を開けば検証の、
 * 本番を開けば本番の答えが出るので、**「本番だけに入っているのでは」を
 * その場で確かめられます**。
 *
 * ── 値は出さない ────────────────────────────────────────────
 *
 * 出すのは「入っているか」と、**秘密でない名前**（モデル名・プロバイダ名）だけ。
 * 鍵の先頭数文字も出しません — 一度出すと、スクリーンショットや
 * 問い合わせのコピペに残ります。
 *
 * ── つながっていないときは「何ができなくなるか」を書く ──────────
 *
 * 「未設定」とだけ出しても、押した人には**それが自分の困りごとと
 * 同じ話なのか分かりません**。だから影響を1文で添えます。
 */
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Plug, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import api from '@/lib/api';

interface Item {
  key: string;
  label: string;
  ok: boolean;
  impact: string;
  envs: string[];
  detail?: string;
}

interface Payload {
  env: 'production' | 'development';
  client_url: string | null;
  items: Item[];
}

export function IntegrationsCard() {
  const q = useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: async () => (await api.get('/admin/integrations')).data.data as Payload,
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base lg:text-lg">
          <Plug className="h-4 w-4" aria-hidden="true" />
          外部サービスにつながっているか
          {/* **どの環境を見ているかを出す。** これが無いと、本番と検証の
              どちらの答えなのかが画面から分からない */}
          {q.data && (
            <Badge variant="secondary" className="text-badge">
              {q.data.env === 'production' ? '本番' : '検証'}
              {q.data.client_url ? ` ・ ${q.data.client_url.replace(/^https?:\/\//, '')}` : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-note text-muted-foreground">
          <strong className="font-bold">いま開いている環境</strong>の状態です。
          鍵そのものは出しません（入っているかどうかだけ）。
          検証と本番は別々に入れる必要があり、検証は
          <code className="mx-1">〜_DEV</code>が無ければ本番のものを使います。
        </p>

        {q.isError ? (
          <ErrorPanel title="状態を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <Delayed><SkeletonRows rows={4} /></Delayed>
        ) : (
          <ul className="flex flex-col gap-2">
            {(q.data?.items ?? []).map((it) => (
              <li
                key={it.key}
                className="rounded-card flex items-start gap-2.5 border border-border p-3"
              >
                {it.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className="text-list flex flex-wrap items-center gap-2">
                    {it.label}
                    <span className={it.ok ? 'text-note text-success' : 'text-note text-warning'}>
                      {it.ok ? 'つながっています' : 'つないでいません'}
                    </span>
                    {it.detail && (
                      <span className="text-note text-muted-foreground">{it.detail}</span>
                    )}
                  </p>
                  {/* **つながっていないときだけ**、何ができなくなるかと入れる名前を出す */}
                  {!it.ok && (
                    <p className="text-note mt-0.5 text-secondary-foreground">
                      {it.impact}
                      <span className="ml-1 text-muted-foreground">
                        （.env に {it.envs.join(' か ')} を入れてください）
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
