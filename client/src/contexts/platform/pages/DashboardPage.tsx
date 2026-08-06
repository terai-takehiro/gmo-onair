/**
 * ① 案件管理 ダッシュボード (v4)
 *
 * ── この画面が答える問い ────────────────────────────────────
 *
 * 「**いま何が動いていて、何が止まっているか**」だけです。
 * 朝いちばんに開いて、押す先が決まればそれで役目は終わりです。
 *
 *   受付          未処理が何件あるか → 受付をひらく
 *   数字 5つ      進行中 / 今週の実施 / 見積の返事待ち / 今月の売上 / 止まっている
 *   動いている案件 動きがあった順に6件。次のアクションと担当つき
 *   止まっている案件 7日以上ほったらかしのものを名指しする
 *   ステージ別    受注に近い順。棒は金額
 *   今週の現場    今日から7日ぶん
 *
 * ── 前の版から**外した**もの (意図した変更) ──────────────────
 *
 * 売上・仕入・粗利・販管費・営業利益の KPI と、月次推移のグラフを外しました。
 * **あれは案件管理ではなく財務管理の画面の中身**で、
 * [財務管理 ダッシュボード](/budget/dashboard) に同じものがあります。
 * 案件を見に来た人に決算の数字を先に見せると、探しているものに着くまでに
 * 画面を1つぶんスクロールすることになります。
 * 案件管理から見たいお金は「見積の返事待ち」と「今月の売上」の2つだけに絞り、
 * どちらも押すと元の画面へ行けるようにしました。
 *
 * ── 数字は1回の呼び出しでまとめて取る ──────────────────────
 *
 * `GET /dashboard/sales-overview` が KPI と「止まっている案件」を一緒に返します。
 * 5本に分けると、遅い1本のせいで数字が後から差し替わり、読み間違えます。
 * ステージ別・今週の現場・動いている案件は**既にある物**を使います
 * (同じ数字を2か所で数えると必ず食い違うため)。
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, SkeletonKpi, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { KpiStrip } from './salesDashboard/KpiStrip';
import { IntakePanel } from './salesDashboard/IntakePanel';
import { MovingPanel } from './salesDashboard/MovingPanel';
import { StuckPanel } from './salesDashboard/StuckPanel';
import { StagePanel } from './salesDashboard/StagePanel';
import { WeekPanel } from './salesDashboard/WeekPanel';
import type { SalesOverview, PipelineStage, WeekDay } from './salesDashboard/types';

/** 「2026年7月31日（金）時点」。**日付を出す** — 数字がいつのものか分からないと使えない */
function asOf(now: Date): string {
  return now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const overview = useQuery<SalesOverview>({
    queryKey: ['dashboard', 'sales-overview'],
    queryFn: async () => (await api.get('/dashboard/sales-overview')).data.data,
  });

  const pipeline = useQuery<PipelineStage[]>({
    queryKey: queryKeys.dashboard.pipeline(),
    queryFn: async () => (await api.get('/dashboard/pipeline')).data.data,
  });

  const week = useQuery<WeekDay[]>({
    queryKey: queryKeys.dashboard.weeklySchedule(),
    queryFn: async () => (await api.get('/dashboard/weekly-schedule')).data.data,
  });

  // A 受注済 → S 完了 の自動繰り上げ。**開いたときに1度だけ走らせる**
  // (この画面が「進行中」を数えるので、終わった案件が混ざったままだと数が合わない)
  useQuery({
    queryKey: queryKeys.dashboard.checkCompleted(),
    queryFn: async () => (await api.get('/dashboard/check-completed')).data,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <PageHeader
        title="ダッシュボード"
        sub={`${asOf(new Date())} 時点 ・ 案件はみんなで見ます。個人の持ち物にはしません`}
        primaryAction={
          <Button onClick={() => navigate('/sales/projects/new')}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />案件をつくる
          </Button>
        }
      />

      <IntakePanel />

      {overview.isError ? (
        <ErrorPanel
          title="ダッシュボードの数字を読み込めませんでした"
          error={overview.error}
          onRetry={() => overview.refetch()}
        />
      ) : overview.data ? (
        <KpiStrip overview={overview.data} />
      ) : (
        <Delayed><SkeletonKpi count={5} /></Delayed>
      )}

      {/*
        2列。左が広い (3:2) のは、左に置く2枚が**案件を名指しする枚**だからです。
        スマホでは1列になり、順番は「動いている → 止まっている → ステージ別 → 今週」。
        止まっているものを上から2番目に置くのは、**下に送ると見られないため**。
      */}
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <MovingPanel />

        {overview.data ? (
          <StuckPanel overview={overview.data} />
        ) : (
          <div className="rounded-card border border-border bg-card p-4">
            <Delayed><SkeletonRows rows={3} /></Delayed>
          </div>
        )}

        {pipeline.data ? (
          <StagePanel stages={pipeline.data} />
        ) : (
          <div className="rounded-card border border-border bg-card p-4">
            <Delayed><SkeletonRows rows={5} /></Delayed>
          </div>
        )}

        {week.data ? (
          <WeekPanel days={week.data} />
        ) : (
          <div className="rounded-card border border-border bg-card p-4">
            <Delayed><SkeletonRows rows={5} /></Delayed>
          </div>
        )}
      </div>
    </div>
  );
}
