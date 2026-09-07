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
 * ── タブ（隔週キープ・keep-report.md §3）────────────────────
 *
 * `/weekly/:id` にタブを2つ足した（「隔週キープの数字」`/keep`・「資料をつくる」`/deck`）。
 * 左メニューは増やさない。この画面は `tab` を受けて **この週の報告 ／ 隔週キープの数字**
 * を描き分ける（「資料をつくる」は別のルート `weekly/deck/DeckPage.tsx`）。
 * **隔週キープの数字のタブでは PC の週のレールを出さない** — 数値報告の表を2枚
 * 並べるのに幅が要る（モックも同じ）。週の切り替えはそのタブでは「この週の報告」に戻ってから。
 *
 * ── モックにあるが実装しないもの ────────────────────────────
 *
 * ・**「ニュース由来」のバッジ** — DB に由来を記録する列が無い
 *   (`TopicsSection.tsx` に理由を書いてある)
 * ・**「AI作成」の印に「指示した人」を出さない** — `requested_by` は AI が名簿と
 *   突き合わせずに自由記述で書く値で、実在しない人名が入っていたことがある
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  BarChart3, Bot, CheckCircle2, ListChecks, Loader2, Pencil, Sparkles, Undo2,
} from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  Delayed, EmptyState, ErrorPanel, NotFoundPanel, SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useDraftWeeklyReport, usePublishReport, useReopenReport, useReport, useReports,
  useReviewReport, useUpdateReportContent,
} from '@/lib/reportsApi';
import { formatWeekJa, type OpsReport } from '@/lib/types';
import { StatsSection, type StatsShape } from './weekly/StatsSection';
import { TopicsSection } from './weekly/TopicsSection';
import { WeekPickerSheet } from './weekly/WeekPickerSheet';
import { WeekRail } from './weekly/WeekRail';
import { WeeklyTabs, type WeeklyTab } from './weekly/WeeklyTabs';
import { KeepSection } from './weekly/keep/KeepSection';

export default function WeeklyDetailPage({ tab = 'report' }: { tab?: WeeklyTab }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const list = useReports('weekly_activity', 50);
  const detail = useReport(id);
  const { canEdit } = usePermissions();
  const publish = usePublishReport();
  const reopen = useReopenReport();
  const review = useReviewReport();
  const draftAi = useDraftWeeklyReport();
  const updateContent = useUpdateReportContent();

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

  /**
   * 確定を解く。**サーバーが確定した週報への書き込みを断る**ようになったので
   * （ニュースからの「週報へ送る」も含む）、直す道をここに置く。
   * 無いと「もう1行入れたい」で行き止まりになる。
   */
  const onReopen = async () => {
    if (!report) return;
    const ok = await confirmAction({
      title: 'この週の報告の確定を解きますか',
      description: 'トピックをまた足せるようになります。確定した日付は記録に残ります。直したら、もう一度確定してください。',
      confirmLabel: '確定を取り消す',
    });
    if (!ok) return;
    reopen.mutate(report.id, {
      onSuccess: () => notifySuccess('確定を取り消しました。直したら、もう一度確定してください'),
      onError: (e) => notifyApiError('確定を取り消せませんでした', e),
    });
  };

  /**
   * ⚠️ **確認済みにする**（UXレポート 2026-08-18 指摘で追加）。
   * `POST /dailyops/reports/:id/review` はデイリーニュース報告
   * （`DailyNewsPage.tsx`）からは前から呼ばれていたが、週報からは一度も
   * 呼ばれておらず、**「確認済みにする」唯一の手段が「確定する」（公開）**
   * になっていた。確定するまで恒久的に未確認のままになり、確認だけ先に
   * 済ませて中身は後で直したい、ができなかった。
   * サーバー側は状態を問わず打刻するだけなので、下書き・確定済みどちらでも呼べる
   */
  const onReview = () => {
    if (!report) return;
    review.mutate(report.id, {
      onSuccess: () => notifySuccess('確認済みにしました'),
      onError: (e) => notifyApiError('確認済みにできませんでした', e),
    });
  };

  /**
   * AI に本文を書かせる（下書きボタン）。**すでに本文があれば上書きの確認を挟む** —
   * 直した文章・別のAI下書きが黙って消えるのを避ける（差分そのものは確定時に
   * サーバーが自動で記録するので、ここでは「消える」ことだけ伝えればよい）。
   */
  const onDraftAi = async () => {
    if (!report) return;
    if (report.body) {
      const ok = await confirmAction({
        title: 'AI の要約を作り直しますか',
        description: 'いまの本文は上書きされます。',
        confirmLabel: '作り直す',
      });
      if (!ok) return;
    }
    draftAi.mutate(report.id, {
      onSuccess: () => notifySuccess('AI が週報の下書きを作成しました'),
      onError: (e) => notifyApiError('AI下書きを作成できませんでした', e),
    });
  };

  const onSaveBody = (body: string) => {
    if (!report) return;
    updateContent.mutate({ reportId: report.id, fields: { body } }, {
      onSuccess: () => notifySuccess('本文を保存しました'),
      onError: (e) => notifyApiError('保存できませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:flex-row lg:gap-5 lg:p-6">
      {/* 週のリスト。PC は左のレール、スマホは上端のボタン + シート（専用の週ピッカー） */}
      {list.data && list.data.length > 0 && (
        isMobile
          ? <WeekPickerSheet reports={list.data} activeId={id} />
          : tab === 'report' && <WeekRail reports={list.data} activeId={id} />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-5">
        {detail.isError ? (
          <ErrorPanel title="この週の報告を読み込めませんでした" error={detail.error} onRetry={() => detail.refetch()} />
        ) : detail.isLoading ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : !report ? (
          <NotFoundPanel
            path={`/weekly/${id ?? ''}`}
            home={{ label: '最新の週を開く', onGo: () => navigate('/weekly') }}
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
              ) : canEdit && isPublished ? (
                <Button variant="outline" onClick={onReopen} disabled={reopen.isPending}>
                  <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />確定を取り消す
                </Button>
              ) : undefined}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {isPublished
                  ? <TableBadge label="確定済み" w={null} className="border-success-border bg-success-surface text-success" />
                  : <TableBadge label="下書き" w={null} className="border-warning-border bg-warning-surface text-warning" />}
                {/* 「確定/下書き」とは別軸（内容の既読）。語は `docs/wording.md` の
                    決定どおり「確認した」に揃え、状態バッジは「確認済み」で出す */}
                {report.reviewed_at
                  ? <TableBadge label="確認済み" w={null} className="border-success-border bg-success-surface text-success" />
                  : <TableBadge label="未確認" w={null} className="border-ai-border bg-ai-surface text-ai" />}
                {(report.created_by === 'mcp-claude' || !!report.requested_by) && (
                  <TableBadge label="AI作成" w={null} className="border-ai-border bg-ai-surface text-ai" />
                )}
                {canEdit && !report.reviewed_at && (
                  <Button variant="outline" size="sm" onClick={onReview} disabled={review.isPending}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> 確認した
                  </Button>
                )}
              </div>
            </PageHeader>

            <WeeklyTabs reportId={report.id} tab={tab} isMobile={isMobile} />

            {tab === 'keep' ? (
              <KeepSection report={report} isMobile={isMobile} />
            ) : (
              <ReportBody
                report={report} stats={stats} isMobile={isMobile} editable={editable} isPublished={isPublished}
                onDraftAi={onDraftAi} draftAiPending={draftAi.isPending}
                onSaveBody={onSaveBody} saveBodyPending={updateContent.isPending}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 「この週の報告」タブの中身（自動集計 → AI の要約 → 週次トピックス） */
function ReportBody({
  report, stats, isMobile, editable, isPublished, onDraftAi, draftAiPending, onSaveBody, saveBodyPending,
}: {
  report: OpsReport; stats: StatsShape | undefined; isMobile: boolean; editable: boolean; isPublished: boolean;
  onDraftAi: () => void; draftAiPending: boolean;
  onSaveBody: (body: string) => void; saveBodyPending: boolean;
}) {
  return (
    <>
            {isPublished && report.published_at && (
              <p className="text-note text-muted-foreground">
                {new Date(report.published_at).toLocaleString('ja-JP')} に確定しました。
                追加も編集もできません（ニュースからの「ウィークリー活動報告へ送る」も入りません）。
                直すときは「確定を取り消す」を押してください。
              </p>
            )}

            <Section icon={BarChart3} title="自動集計" sub="投稿した時点の ONAiR のデータの写しです（ここでは直せません）" />
            {stats ? <StatsSection stats={stats} isMobile={isMobile} /> : (
              <EmptyState
                title="集計はまだありません"
                description="AI がウィークリー活動報告を作成すると、その時点の案件・活動・売上がここに出ます。"
              />
            )}

            <Section
              icon={Bot}
              title="AI の要約"
              sub="AI が集計を文章にしたもの"
              action={editable && report.ai_available && (
                <Button variant="outline" size="sm" onClick={onDraftAi} disabled={draftAiPending}>
                  {draftAiPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-ai" aria-hidden="true" />}
                  {report.body ? 'AI下書きを作り直す' : 'AI下書きを作る'}
                </Button>
              )}
            />
            <AiSummaryCard report={report} editable={editable} onSave={onSaveBody} savePending={saveBodyPending} />

            <Section
              icon={ListChecks}
              title="週次トピックス"
              sub={isPublished ? '確定済みなので追加できません' : '自動集計に出ない出来事を人が追加するところ'}
            />
            <TopicsSection items={report.items ?? []} reportId={report.id} editable={editable} />
    </>
  );
}

/**
 * AI の要約カード。**確定前だけ直せる**（編集トグル）。
 *
 * 直せる手段が無いと、AI下書きの確定時の差分記録
 * （会社方針「AIを使い捨てにしない」条件2）が常に「無修正」にしかならない —
 * この編集入口はその条件を実質的に満たすための必須の器（見た目の親切さだけではない）。
 */
function AiSummaryCard({ report, editable, onSave, savePending }: {
  report: OpsReport; editable: boolean; onSave: (body: string) => void; savePending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(report.body);

  if (editing) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="text-sub"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDraft(report.body); setEditing(false); }}>
              キャンセル
            </Button>
            <Button
              size="sm"
              disabled={savePending}
              onClick={() => { onSave(draft); setEditing(false); }}
            >
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        {report.body ? (
          <>
            <div className="md-body text-sub leading-relaxed">
              <ReactMarkdown>{report.body}</ReactMarkdown>
            </div>
            {editable && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setDraft(report.body); setEditing(true); }}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />直す
              </Button>
            )}
          </>
        ) : (
          <EmptyState
            className="border-0 bg-transparent"
            icon={<Sparkles />}
            title="AI の要約はまだありません"
            description="上の「AI下書きを作る」を押すか、急ぐときは下のトピックに人の言葉で書いてください。"
          />
        )}
      </CardContent>
    </Card>
  );
}

function Section({ icon: Icon, title, sub, action }: {
  icon: React.ElementType; title: string; sub?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <div className="flex items-baseline gap-2">
        <Icon className="h-4 w-4 shrink-0 self-center text-primary" aria-hidden="true" />
        <h2 className="text-h2">{title}</h2>
        {sub && <span className="text-note hidden text-muted-foreground sm:inline">— {sub}</span>}
      </div>
      {action}
    </div>
  );
}
