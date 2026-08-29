/**
 * ⑦ 通知とテンプレート（v4 設定・モックの7枚目）
 *
 * ── 社外メールは送らない（ご判断）──────────────────────────
 *
 * モックの 11 本のうち 6 本は**お客様に届くメール**です。差し込みが1つずれる・
 * きっかけが誤爆する・宛先が古い、のどれも取り返しがつきません。
 * v4 では**文面を貯めてコピーできるところまで**にします。
 *
 * 「作れなかった」ではなく「**作らないと決めた**」ので、画面にもそう書きます。
 * 送信ボタンを置かないだけだと「まだ出来ていない」と読まれます。
 *
 * ── 社内通知はアプリの中のベル（ご判断）────────────────────
 *
 * 上辺バーのベルに出ます。5 本のうち 3 本は社内向けそのもの、
 * 残り 2 本は**社外メールの代わりに「送る時期が来ました」を社内に出す**分です。
 *
 * ── 送った数はサンプル値を出さない ──────────────────────────
 *
 * モックには「86 通」のような数字がありますが、あれはサンプルです。
 * ここでは**実際に出した社内通知の実数**だけを出し、送っていないものは
 * 「送っていません」と書きます。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, BellRing, Info, Lock, Copy, Play, Loader2, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { TemplateDialog } from './TemplateDialog';
import { CalendarFeedCard } from './CalendarFeedCard';
import type { NotifyResponse, Template } from './notifyTypes';

const AUDIENCE = {
  external: { label: '社外', tone: 'bg-warning-surface text-warning' },
  internal: { label: '社内', tone: 'bg-primary-surface text-primary' },
} as const;
const CHANNEL = {
  mail: { label: 'メール', tone: 'bg-primary-surface text-primary', icon: Mail },
  inapp: { label: '社内通知', tone: 'bg-ai-surface text-ai', icon: BellRing },
} as const;
/**
 * ひな形に紐づかない定時ジョブ（`templateId: null`）の表示名。
 * 通知を出さない裏方の仕事なのでひな形が無く、名前もここでしか持てない
 * （キーの意味はサーバーの `scheduler.service.ts` の各ジョブ実装が正）。
 */
const JOB_LABELS: Record<string, string> = {
  activity_format: 'やり取り記録の本文をAIで整える（メール取込ぶんの後追い）',
  next_action_short: '「次にやること」をAIで帯の1行に収める',
  qsheet_ai_expire: '制作技術支援のAI提案：放置された提案を期限切れにする',
  qsheet_ai_settle: '制作技術支援のAI提案：期限が来た提案の成果を締める',
};

export default function NotifyPage() {
  const qc = useQueryClient();
  const { currentUser, hasPermission } = useAuth();
  const canEdit = currentUser?.role === 'system_admin';
  // カレンダー購読の口は dailyops reader（自分のタスクの期限だけ）。
  // 権限が無い人には節ごと出さない — 出すと押した瞬間 403 になるだけ
  const canFeed = currentUser?.role === 'system_admin' || hasPermission('dailyops');
  const [open, setOpen] = useState<Template | null>(null);

  const q = useQuery<NotifyResponse>({
    queryKey: ['notify-templates'],
    queryFn: async () => (await api.get('/notifications/templates')).data.data,
  });

  const run = useMutation({
    mutationFn: async () => (await api.post('/notifications/run-jobs')).data.data as { key: string; created: number }[],
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['notify-templates'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      const n = d.reduce((s, x) => s + x.created, 0);
      notifySuccess('定時実行を流しました', {
        description: n > 0
          ? `新しく ${n} 件のお知らせを出しました。`
          : '新しく出すものはありませんでした（同じお知らせは二重に出ません）。',
      });
    },
    onError: (e) => notifyApiError('流せませんでした', e),
  });

  if (q.isError) return <ErrorPanel title="ひな形を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <Delayed><SkeletonRows rows={8} /></Delayed>;

  const counts = Object.fromEntries(q.data.counts.map((c) => [c.template_id, c.n]));
  const external = q.data.templates.filter((t) => t.audience === 'external');
  const internal = q.data.templates.filter((t) => t.audience === 'internal');
  const lastRuns = q.data.runs.slice(0, 6);

  const Card = ({ t }: { t: Template }) => {
    const ch = CHANNEL[t.channel];
    const Icon = ch.icon;
    const sent = counts[t.id] ?? 0;
    return (
      <button
        type="button"
        onClick={() => setOpen(t)}
        className="rounded-card flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3 text-left last:border-b-0"
      >
        <span className={cn('rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center', ch.tone)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          <span className="text-list block truncate">{t.name}</span>
          <span className="text-note block truncate text-muted-foreground">{t.trigger} ／ {t.send_to}</span>
        </span>
        <span className={cn('rounded-note text-note shrink-0 px-2 py-0.5 font-bold', AUDIENCE[t.audience].tone)}>
          {AUDIENCE[t.audience].label}
        </span>
        <span className="text-note w-[96px] shrink-0 text-right text-muted-foreground">
          {t.enabled
            ? (sent > 0 ? `${sent} 件出した` : 'まだ0件')
            : t.audience === 'external' ? '送りません' : '止めています'}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3.5 p-3 lg:gap-4 lg:p-6">
      <PageHeader
        title="通知とテンプレート"
        sub="いつ・誰に・どんな文面で知らせるかをここで持ちます。"
        primaryAction={canEdit ? (
          <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            定時実行をいま流す
          </Button>
        ) : undefined}
      />

      {!canEdit && (
        <p className="rounded-note text-note flex items-center gap-2 border border-border bg-surface-subtle px-3.5 py-2.5 text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          直せるのは<strong className="font-bold">システム管理者</strong>だけです。文面は誰でも見られます（コピーして使うため）。
        </p>
      )}

      {/* ── 社外 ─────────────────────────────────────────── */}
      <div className="rounded-card overflow-hidden border border-warning-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint bg-warning-surface px-4 py-3">
          <span className="text-cardtitle shrink-0 text-warning">社外あて（{external.length}本）</span>
          <span className="text-note min-w-0 flex-1 text-secondary-foreground">
            <strong className="font-bold">ONAiR からは送りません。</strong>文面をコピーして、いつもの方法で送ってください
          </span>
        </div>
        {external.map((t) => <Card key={t.id} t={t} />)}
        <p className="text-note flex items-start gap-2 border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-bold">これは「まだ作っていない」ではなく「作らないと決めた」</strong>ところです。
            差し込みが1つずれる・きっかけが誤爆する・宛先が古い、のどれも
            <strong className="font-bold">お客様に届いてしまうと取り返しがつきません</strong>。
            そのぶん、<strong className="font-bold">送る時期が来たことは社内のベルで知らせます</strong>
            （利用前日のご案内・請求書の送付）。
          </span>
        </p>
      </div>

      {/* ── 社内 ─────────────────────────────────────────── */}
      <div className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
          <span className="text-cardtitle shrink-0">社内あて（{internal.length}本）</span>
          <span className="text-note min-w-0 flex-1 text-muted-foreground">
            上辺バーのベルに出ます
          </span>
        </div>
        {internal.map((t) => <Card key={t.id} t={t} />)}
      </div>

      {/* ── カレンダー購読（Phase 2 ⑦・dailyops 権限のある人だけ）── */}
      {canFeed && <CalendarFeedCard />}

      {/* ── 定時実行 ──────────────────────────────────────── */}
      <div className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
          <span className="text-cardtitle shrink-0">定時実行</span>
          <span className="text-note min-w-0 flex-1 text-muted-foreground">
            15 分ごとに起きて、その日まだ流していない仕事を流します
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border-faint px-4 py-3">
          {q.data.jobs.map((j) => (
            <span key={j.key} className="rounded-note text-note bg-surface-subtle px-2.5 py-1 text-muted-foreground">
              <strong className="font-number font-bold text-foreground">{j.at}</strong>{' '}
              {q.data.templates.find((t) => t.id === j.templateId)?.name ?? JOB_LABELS[j.key] ?? j.key}
            </span>
          ))}
        </div>

        {lastRuns.length === 0 ? (
          <p className="text-note px-4 py-4 text-muted-foreground">まだ流していません。</p>
        ) : (
          <>
            <p className="text-th border-b border-border-faint px-4 py-2 text-muted-foreground">直近の記録</p>
            {lastRuns.map((r) => (
              <div key={`${r.job_key}-${r.run_date}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-faint px-4 py-2 last:border-b-0">
                <span className="text-sub font-number w-[96px] shrink-0">{r.run_date.slice(5).replace('-', '/')}</span>
                <span className="text-sub min-w-0 flex-1 truncate">
                  {q.data.templates.find((t) => t.id === r.job_key)?.name ?? JOB_LABELS[r.job_key] ?? r.job_key}
                </span>
                {r.error ? (
                  <span className="text-note shrink-0 text-destructive">失敗：{r.error.slice(0, 60)}</span>
                ) : (
                  <span className="text-note inline-flex shrink-0 items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{r.created} 件
                  </span>
                )}
              </div>
            ))}
          </>
        )}

        <p className="text-note flex items-start gap-2 border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-bold">同じお知らせは二重に出ません。</strong>
            その日その仕事を流したかを記録し、さらに「同じ人・同じ対象・同じ日」は 1 行しか入らないようにしてあります
            （デプロイのたびに再起動しても督促が増えません）。
            「いま流す」を何度押しても増えないのはそのためです。
          </span>
        </p>
      </div>

      <p className="rounded-note text-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-secondary-foreground">
        <Copy className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          「送った数」はモックのサンプル値ではなく<strong className="font-bold">実際に出した社内通知の実数</strong>です。
          社外あては送っていないので数字を出しません。
        </span>
      </p>

      {open && (
        <TemplateDialog
          template={open}
          canEdit={canEdit}
          open
          onOpenChange={(v) => !v && setOpen(null)}
        />
      )}
    </div>
  );
}
