/**
 * 「やり取りの本文を整える」（システムの情報・migration 187）
 *
 * ── なぜ作ったか ────────────────────────────────────────────
 *
 * やり取りの整形器（`activity-ai.service`）は**画面から書いたときだけ**通ります。
 * メール取込（MCP `create_activity_log`）は通らないので、**毎日 sales@ から
 * 取り込まれる記録は素のテキストのまま**溜まっていました。
 *
 * ここは**溜まっている分を人が流す場所**です。毎晩ぶんは定時実行（03:00）が
 * 40 件ずつ整えるので、この画面は主に**過去ぶんの取り返し**に使います。
 *
 * ── 押す前に件数と費用を出す ────────────────────────────────
 *
 * **1行あたり1コールで課金されます。** 何件あるか・いくらかかりそうかを
 * 知らないまま押させないこと。金額は**実績（過去90日の1件あたり）から**出し、
 * 実績が無いか単価未設定なら**件数だけ**を出します（`AI_PRICING_JSON` の方針と同じ）。
 *
 * ── 一度整えたものは触らない ────────────────────────────────
 *
 * 待ち行列は行の状態（`body_html` が空か）で決まるので、整え終わった行は
 * 二度と対象になりません。**原文（`description`）は1バイトも触りません**
 * — 整形が的外れなときは、やり取りの「打った文をみる」から戻せます。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wand2, RotateCcw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Num } from '@gmo-onair/shared/src/client/ui/numbers';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/contexts/platform/AuthContext';
import api from '@/lib/api';

interface Status {
  pending: number;
  failed: number;
  formatted: number;
  total: number;
  usdPerRow: number | null;
  usdEstimate: number | null;
  configured: boolean;
}

/** 1回で流す件数。**既定は控えめ** — 落ちたときに課金だけ進むのを避ける */
const BATCH = 20;

export function ActivityFormatCard() {
  const { hasPermission } = useAuth();
  const canRun = hasPermission('sales', 'manager');
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const q = useQuery({
    queryKey: ['activity-format-status'],
    queryFn: async () => (await api.get('/activities/format-status')).data.data as Status,
    // 流している間は減りを見たいので短く。**止まっているときは読み直さない**
    refetchInterval: running ? 5_000 : false,
  });

  const run = useMutation({
    mutationFn: async () => (await api.post('/activities/format-run', { limit: BATCH })).data,
    meta: { action: 'やり取りの整形' },
    onSuccess: (res) => {
      setRunning(true);
      notifySuccess(res?.message ?? '裏で整えています');
      // 5秒ごとの読み直しを一定時間だけ回す（整形は1件5〜10秒）
      window.setTimeout(() => setRunning(false), BATCH * 12_000);
      qc.invalidateQueries({ queryKey: ['activity-format-status'] });
    },
  });

  const reset = useMutation({
    mutationFn: async () => (await api.post('/activities/format-reset-failed')).data,
    meta: { action: '失敗した記録の戻し' },
    onSuccess: (res) => {
      notifySuccess(res?.message ?? '対象に戻しました');
      qc.invalidateQueries({ queryKey: ['activity-format-status'] });
    },
    onError: (e) => notifyApiError('失敗した記録の戻し', e),
  });

  const s = q.data;

  const onRun = async () => {
    if (!s) return;
    const taking = Math.min(BATCH, s.pending);
    const cost = s.usdPerRow === null
      ? '費用の目安は出せません（単価が未設定です）'
      : `費用の目安は約 $${(s.usdPerRow * taking).toFixed(2)}（1件あたり $${s.usdPerRow.toFixed(3)}）`;
    const ok = await confirmAction({
      title: `${taking} 件を整えますか`,
      // **何が起きて何が起きないかを両方書く**（原文が消えないことが一番の不安になる）
      description: `AI が本文を読みやすく整えて「要点」を付けます。${cost}。\n\n`
        + '打った文（原文）はそのまま残るので、整形が的外れなときは各記録の「打った文をみる」から確かめられます。'
        + '件名と「次にやること」は書き換えません。\n\n'
        + `残りは ${s.pending - taking} 件です（何回かに分けて流せます）。`,
      confirmLabel: '整える',
      tone: 'default',
    });
    if (ok) run.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-ai" aria-hidden="true" />
          やり取りの本文を整える
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Delayed><SkeletonRows rows={2} /></Delayed>
        ) : q.isError ? (
          <ErrorPanel title="整形の状況を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        ) : s ? (
          <div className="flex flex-col gap-3">
            <p className="text-note text-muted-foreground">
              メールから取り込んだ記録は素の文のまま入ります。ここで整えると、見出し・箇条書き・強調のある本文になります。
              毎晩 3:00 に 40 件ずつ自動で整えるので、急がなければそのまま置いても構いません。
            </p>

            <dl className="grid grid-cols-3 gap-3">
              {[
                { label: 'まだ整えていない', value: s.pending },
                { label: '整え終わった', value: s.formatted },
                { label: '整えられなかった', value: s.failed },
              ].map((it) => (
                <div key={it.label} className="rounded-note border border-border-subtle bg-surface-subtle px-3 py-2">
                  <dt className="text-note text-muted-foreground">{it.label}</dt>
                  <dd className="text-list"><Num value={it.value} unit="件" /></dd>
                </div>
              ))}
            </dl>

            {/* **金額は実績があるときだけ。** 無い状態で「約$0」と出すと嘘になる */}
            {s.pending > 0 && (
              <p className="text-note text-muted-foreground">
                {s.usdPerRow === null
                  ? '費用の目安は出せません（単価が未設定です）。1件あたり1回 AI を呼びます'
                  : `残り全部を整えると約 $${(s.usdEstimate ?? 0).toFixed(2)}（実績の1件あたり $${s.usdPerRow.toFixed(3)} × ${s.pending} 件）`}
              </p>
            )}

            {!s.configured && (
              <p className="text-sub-sm rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-warning">
                この環境は AI につないでいないので整えられません（`OPENAI_API_KEY` などが未設定）。
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={onRun}
                disabled={!canRun || !s.configured || s.pending === 0 || run.isPending || running}
                title={canRun ? undefined : '整えるには案件管理の manager 以上の権限が必要です'}
              >
                <Wand2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {running ? '整えています…' : `${Math.min(BATCH, s.pending)} 件を整える`}
              </Button>
              {s.failed > 0 && (
                <Button
                  variant="outline"
                  onClick={() => reset.mutate()}
                  disabled={!canRun || reset.isPending}
                  title={canRun ? '整えられなかった記録をもう一度対象に戻します' : '案件管理の manager 以上の権限が必要です'}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  失敗した {s.failed} 件を戻す
                </Button>
              )}
            </div>

            {!canRun && (
              <p className="text-note text-muted-foreground">
                実行できるのは案件管理の manager 以上です（全案件の記録に一度に効くため）。
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
