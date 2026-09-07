/**
 * ウィークリー活動報告 (`/weekly/:id`) (v4 ／ 2026-09 再設計)
 *
 * ── 構成を「生成工程の順」から「読み手の順」に変えた ──────────────
 *
 * 以前の並びは **自動集計 → AI の要約 → 週次トピックス**で、これは AI が作る順序
 * （生成工程）であって、読む人の順序ではなかった。見出しにも「AI の要約」
 * 「AI下書きを作る」と AI が2回出て、画面の主語が中身ではなく生成元になっていた。
 *
 * 並びを **総括 → 主要指標 → トピックス → 詳細内訳** にし、AI の関与は
 * 総括カード下部の署名へ移した（`SummarySection`）。詳細内訳は既定で畳む。
 *
 * ── 画面の主役を「対象週」にした ────────────────────────────
 *
 * 見出しは対象週そのもの（`WeekSwitcher`）。前後移動と 今週／先週 の表示があり、
 * 一覧・追加・削除はシートに入る。左の週レール（`WeekRail` / `WeekPickerSheet`）は
 * 廃止した — 常時 240px を占めるわりに「いま何週目か」が分からなかった。
 *
 * ── 状態表示を1系統に畳んだ ────────────────────────────────
 *
 * 以前は 下書き／未確認／AI作成 の3つのバッジが同じ見た目で横並びだった。
 * ワークフローの状態（下書き・確定済み）だけをバッジにし、個人の既読は
 * 「確認した」の操作で、AI 由来は総括の署名で表す。
 *
 * ── タブ（隔週キープ・keep-report.md §3）────────────────────
 *
 * この週の報告（`/weekly/:id`）／隔週キープの数字（`/keep`）／資料をつくる（`/deck`）。
 * 「資料をつくる」は別ルート（`weekly/deck/DeckPage.tsx`）。
 */
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import {
  Delayed, EmptyState, ErrorPanel, NotFoundPanel, SkeletonRows,
} from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useDeleteReport, useDraftWeeklyReport, useEnsureReport, usePublishReport, useReopenReport,
  useReport, useReports, useReviewReport, useUpdateReportContent, useWeeklyStats,
} from '@/lib/reportsApi';
import { formatWeekRangeJa, type OpsReport } from '@/lib/types';
import { DetailsSection } from './weekly/DetailsSection';
import { StatsSection, type StatsShape } from './weekly/StatsSection';
import { SummarySection } from './weekly/SummarySection';
import { TopicsSection } from './weekly/TopicsSection';
import { WeekSwitcher } from './weekly/WeekSwitcher';
import { WeeklyTabs, type WeeklyTab } from './weekly/WeeklyTabs';
import { KeepSection } from './weekly/keep/KeepSection';

export default function WeeklyDetailPage({ tab = 'report' }: { tab?: WeeklyTab }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const list = useReports('weekly_activity', 50);
  const ensureWeek = useEnsureReport();
  const deleteReport = useDeleteReport();
  const detail = useReport(id);
  const { canEdit } = usePermissions();
  const publish = usePublishReport();
  const reopen = useReopenReport();
  const review = useReviewReport();
  const draftAi = useDraftWeeklyReport();
  const updateContent = useUpdateReportContent();

  const report = detail.data;
  const isPublished = report?.status === 'published';
  const editable = canEdit && !!report && !isPublished;

  /*
   * 数字の出どころは2つある。
   * ・確定済み … `payload.stats`（確定した時点のスナップショット。以後動かさない）
   * ・下書き   … スナップショットが**まだ無いことがある**（AI下書きを一度も作っていない週）。
   *              そのときだけ引き直す。以前はここが「集計はまだありません」の空欄になり、
   *              総括を書こうとする人が材料を見られなかった。
   */
  const snapshot = (report?.payload as { stats?: StatsShape } | null)?.stats;
  const live = useWeeklyStats(report?.period_key, !!report && !snapshot && !isPublished);
  const stats = snapshot ?? (live.data as StatsShape | undefined);

  const onPublish = async () => {
    if (!report) return;
    const ok = await confirmAction({
      title: 'この週の報告を確定しますか',
      description: '確定すると、この週にはトピックを追加できなくなります。総括と主要指標はそのまま残ります。',
      confirmLabel: '確定する',
    });
    if (!ok) return;
    publish.mutate(report.id, {
      onSuccess: () => notifySuccess('この週の報告を確定しました'),
      onError: (e) => notifyApiError('確定できませんでした', e),
    });
  };

  /**
   * 確定を取り消す。**サーバーが確定済みの週報への書き込みを断る**ので
   * （デイリーニュースからの送信も含む）、編集する道をここに置く。
   */
  const onReopen = async () => {
    if (!report) return;
    const ok = await confirmAction({
      title: 'この週の報告の確定を取り消しますか',
      description: 'トピックを再び追加できるようになります。確定した日時は記録に残ります。編集後、もう一度確定してください。',
      confirmLabel: '確定を取り消す',
    });
    if (!ok) return;
    reopen.mutate(report.id, {
      onSuccess: () => notifySuccess('確定を取り消しました。編集後、もう一度確定してください'),
      onError: (e) => notifyApiError('確定を取り消せませんでした', e),
    });
  };

  const onReview = () => {
    if (!report) return;
    review.mutate(report.id, {
      onSuccess: () => notifySuccess('確認済みにしました'),
      onError: (e) => notifyApiError('確認済みにできませんでした', e),
    });
  };

  /** AI に総括を書かせる。**本文があるときは上書きの確認を挟む** */
  const onDraftAi = async () => {
    if (!report) return;
    if (report.body) {
      const ok = await confirmAction({
        title: '総括を AI で作り直しますか',
        description: '現在の本文は上書きされます。',
        confirmLabel: '作り直す',
      });
      if (!ok) return;
    }
    draftAi.mutate(report.id, {
      onSuccess: () => notifySuccess('AI が総括の下書きを作成しました'),
      onError: (e) => notifyApiError('AI下書きを作成できませんでした', e),
    });
  };

  const onSaveBody = (body: string) => {
    if (!report) return;
    updateContent.mutate({ reportId: report.id, fields: { body } }, {
      onSuccess: () => notifySuccess('総括を保存しました'),
      onError: (e) => notifyApiError('保存できませんでした', e),
    });
  };

  /** 任意の開始日で週を作成する（サーバーがその週の月曜へ丸める） */
  const onAddWeek = (weekStart: string) => {
    ensureWeek.mutate({ kind: 'weekly_activity', period_key: weekStart }, {
      onSuccess: (created) => navigate(`/weekly/${created.id}`),
      onError: (e) => notifyApiError('週を作成できませんでした', e),
    });
  };

  /** 週を削除する（論理削除）。確定済みはサーバーが断る */
  const onDeleteReport = async (target: OpsReport) => {
    const ok = await confirmAction({
      title: `${formatWeekRangeJa(target.period_key)} の週を削除しますか`,
      description: 'この週の総括とトピックスが削除されます。この操作は取り消せません。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (!ok) return;
    deleteReport.mutate(target.id, {
      onSuccess: () => {
        notifySuccess('削除しました');
        if (target.id === id) navigate('/weekly');
      },
      onError: (e) => notifyApiError('削除できませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
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
          {/*
            **スマホだけ画面の名前を足す。** 見出しを対象週にしたので、上辺バーに
            パンくずが無いスマホでは「どの画面か」がどこにも出なくなる（PC は
            上辺バーのパンくずが出す）。
          */}
          <p className="text-th text-muted-foreground sm:hidden">ウィークリー活動報告</p>
          <PageHeader
            title={(
              <WeekSwitcher
                reports={list.data ?? []}
                activeId={id}
                canEdit={canEdit}
                onAddWeek={onAddWeek}
                addingWeek={ensureWeek.isPending}
                onDeleteReport={onDeleteReport}
                deletingId={deleteReport.isPending ? deleteReport.variables : undefined}
              />
            )}
            sub={<StatusSub report={report} isPublished={!!isPublished} />}
            primaryAction={editable ? (
              <Button onClick={onPublish} disabled={publish.isPending}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />確定する
              </Button>
            ) : canEdit && !report.reviewed_at ? (
              <Button onClick={onReview} disabled={review.isPending}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />確認した
              </Button>
            ) : undefined}
          >
            {canEdit && isPublished && (
              <Button variant="outline" onClick={onReopen} disabled={reopen.isPending}>
                <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />確定を取り消す
              </Button>
            )}
          </PageHeader>

          <WeeklyTabs reportId={report.id} tab={tab} isMobile={isMobile} />

          {tab === 'keep' ? (
            <KeepSection report={report} isMobile={isMobile} />
          ) : (
            <>
              <Section title="総括" sub="全社共有する週次の活動総括" />
              <SummarySection
                report={report}
                editable={editable}
                onSave={onSaveBody}
                savePending={updateContent.isPending}
                onDraftAi={onDraftAi}
                draftAiPending={draftAi.isPending}
              />

              <Section
                title="主要指標"
                sub={isPublished ? '確定時点の ONAiR データです（以後は変動しません）' : '確定すると、この時点の数値で固定されます'}
              />
              {stats ? <StatsSection stats={stats} /> : live.isLoading ? (
                <Delayed><SkeletonRows rows={2} /></Delayed>
              ) : (
                <EmptyState
                  title="まだ集計がありません"
                  description={isPublished
                    ? 'この週は集計を取り込まずに確定しました。'
                    : '集計を取得できませんでした。時間をおいて画面を開き直してください。'}
                />
              )}

              <Section
                title="トピックス"
                sub={isPublished ? '確定済みのため追加できません' : '指標に表れない事象を記録します'}
              />
              <TopicsSection items={report.items ?? []} reportId={report.id} editable={editable} />

              {stats && <DetailsSection stats={stats} isMobile={isMobile} defaultOpen={!isPublished} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 見出しの下に出す状態。**バッジは1つだけ**（下書き／確定済み）。
 * 個人の既読は「確認した」の操作で表すので、未確認をバッジにはしない。
 */
function StatusSub({ report, isPublished }: { report: OpsReport; isPublished: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {/*
        ⚠️ **ここで `TableBadge` は使えない。** `PageHeader` の `sub` は `<p>` の中に
        描かれるが、`TableBadge`（`Badge`）は `<div>` を出すので
        `<div> cannot appear as a descendant of <p>` になる（実ブラウザで確認）。
        同じ見た目を `<span>` で作る。
      */}
      <span
        className={`text-badge inline-flex items-center rounded-badge-xs border px-2 py-0.5 ${
          isPublished
            ? 'border-success-border bg-success-surface text-success'
            : 'border-warning-border bg-warning-surface text-warning'
        }`}
      >
        {isPublished ? '確定済み' : '下書き'}
      </span>
      {/* **スマホでは出さない。** `PageHeader` の副題はスマホで1行に切り詰めるので
          （`tokens-v4.css`）、この長さだと文の途中で切れる。状態はバッジで伝わる */}
      <span className="hidden sm:inline">
        {isPublished ? '追加・編集はできません。編集するには確定を取り消してください。' : '確定するまで編集できます。'}
      </span>
      {report.reviewed_at && (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />確認済み
        </span>
      )}
    </span>
  );
}

function Section({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
      <div className="flex items-baseline gap-2">
        <h2 className="text-h2">{title}</h2>
        {sub && <span className="text-note hidden text-muted-foreground sm:inline">{sub}</span>}
      </div>
      {action}
    </div>
  );
}
