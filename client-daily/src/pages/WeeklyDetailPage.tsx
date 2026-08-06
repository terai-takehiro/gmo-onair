/**
 * ウィークリー活動報告 (`/weekly/:id`) (v4)
 *
 * **左に週のリスト・右に中身の1画面**にした (master-detail)。週報は
 * 「先週なんて書いたか」を見ながら書くものなので、行き来を無くす。
 * URL は `/weekly/:id` のままなので、ブックマークもリンクも生きている。
 *
 * 画面は3段:
 *   ① 自動集計   … 投稿時点の ONAiR のデータの写し (読むだけ)
 *   ② AI の要約   … AI が集計を文章にしたもの
 *   ③ 週次トピックス … 人が足す行 (確定すると足せなくなる)
 *
 * ── モックにあるが実装しないもの ────────────────────────────
 *
 * ・**「ニュース由来」のバッジ** — DB に由来を記録する列が無い
 *   (`TopicsSection.tsx` に理由を書いてある)
 * ・**AI 起票に「指示した人」を出さない** — `requested_by` は AI が名簿と
 *   突き合わせずに自由記述で書く値で、実在しない人名が入っていたことがある
 */
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { BarChart3, Bot, CheckCircle2, ListChecks, Sparkles } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  Delayed, EmptyState, ErrorPanel, NotFoundPanel, SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { usePublishReport, useReport, useReports } from '@/lib/reportsApi';
import { formatWeekJa } from '@/lib/types';
import { StatsSection, type StatsShape } from './weekly/StatsSection';
import { TopicsSection } from './weekly/TopicsSection';
import { WeekRail } from './weekly/WeekRail';

export default function WeeklyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const list = useReports('weekly_activity', 50);
  const detail = useReport(id);
  const { canEdit } = usePermissions();
  const publish = usePublishReport();

  const report = detail.data;
  const stats = (report?.payload as { stats?: StatsShape } | null)?.stats;
  const isPublished = report?.status === 'published';
  const editable = canEdit && !!report && !isPublished;

  const onPublish = async () => {
    if (!report) return;
    const ok = await confirmAction({
      title: 'この週の報告を確定しますか',
      description: '確定すると、この週にはトピックを足せなくなります。自動集計と AI の要約はそのまま残ります。',
      confirmLabel: '確定する',
    });
    if (!ok) return;
    publish.mutate(report.id, {
      onSuccess: () => notifySuccess('この週の報告を確定しました'),
      onError: (e) => notifyApiError('確定できませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:flex-row lg:gap-5 lg:p-6">
      {/* 左: 週のリスト (スマホでは上に畳んで横スクロール) */}
      {list.data && list.data.length > 0 && <WeekRail reports={list.data} activeId={id} />}

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-5">
        {detail.isError ? (
          <ErrorPanel title="この週の報告を読み込めませんでした" error={detail.error} onRetry={() => detail.refetch()} />
        ) : detail.isLoading ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : !report ? (
          <NotFoundPanel
            path={`/weekly/${id ?? ''}`}
            home={{ label: 'いちばん新しい週を開く', onGo: () => navigate('/weekly') }}
          />
        ) : (
          <>
            <PageHeader
              title={report.title || 'ウィークリー活動報告'}
              sub={formatWeekJa(report.period_key)}
              primaryAction={editable ? (
                <Button onClick={onPublish} disabled={publish.isPending}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />確定する
                </Button>
              ) : undefined}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {isPublished
                  ? <TableBadge label="確定済み" w={null} className="border-success-border bg-success-surface text-success" />
                  : <TableBadge label="下書き" w={null} className="border-warning-border bg-warning-surface text-warning" />}
                {(report.created_by === 'mcp-claude' || !!report.requested_by) && (
                  <TableBadge label="AIが起票" w={null} className="border-ai-border bg-ai-surface text-ai" />
                )}
              </div>
            </PageHeader>

            {isPublished && report.published_at && (
              <p className="text-note text-muted-foreground">
                {new Date(report.published_at).toLocaleString('ja-JP')} に確定しました
              </p>
            )}

            <Section icon={BarChart3} title="自動集計" sub="投稿した時点の ONAiR のデータの写しです（ここでは直せません）" />
            {stats ? <StatsSection stats={stats} /> : (
              <EmptyState
                title="集計はまだありません"
                description="AI が週報を投稿すると、その時点の案件・活動・売上がここに出ます。"
              />
            )}

            <Section icon={Bot} title="AI の要約" sub="AI が集計を文章にしたもの" />
            <Card>
              <CardContent className="p-4 sm:p-5">
                {report.body ? (
                  <div className="md-body text-sub leading-relaxed">
                    <ReactMarkdown>{report.body}</ReactMarkdown>
                  </div>
                ) : (
                  <EmptyState
                    className="border-0 bg-transparent"
                    icon={<Sparkles />}
                    title="AI の要約はまだありません"
                    description="AI が投稿するとここに出ます。急ぐときは下のトピックに人の言葉で書いてください。"
                  />
                )}
              </CardContent>
            </Card>

            <Section
              icon={ListChecks}
              title="週次トピックス"
              sub={isPublished ? '確定済みなので足せません' : '自動集計に出ない出来事を人が足すところ'}
            />
            <TopicsSection items={report.items ?? []} reportId={report.id} editable={editable} />
          </>
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 pt-1">
      <Icon className="h-4 w-4 shrink-0 self-center text-primary" aria-hidden="true" />
      <h2 className="text-h2">{title}</h2>
      {sub && <span className="text-note hidden text-muted-foreground sm:inline">— {sub}</span>}
    </div>
  );
}
