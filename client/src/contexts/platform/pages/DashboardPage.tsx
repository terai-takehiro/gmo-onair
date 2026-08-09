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
import { IntakeButton } from './salesDashboard/IntakeButton';
import { MovingPanel } from './salesDashboard/MovingPanel';
import { StuckPanel } from './salesDashboard/StuckPanel';
import { OverduePanel } from './salesDashboard/OverduePanel';
import { StagePanel } from './salesDashboard/StagePanel';
import { WeekPanel } from './salesDashboard/WeekPanel';
import { MobileSalesDashboard } from './salesDashboard/MobileSalesDashboard';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import type { SalesOverview, PipelineStage, WeekDay } from './salesDashboard/types';

/**
 * 幅で選ぶだけの薄い親。
 * **中で `if (mobile) return …` と書かない** — 幅が変わった瞬間に
 * フックの数が変わって React が落ちる（`docs/design/v4/mobile.md`）。
 */
export default function DashboardPage() {
  return useIsMobile() ? <MobileSalesDashboard /> : <DesktopSalesDashboard />;
}

function DesktopSalesDashboard() {
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
      {/*
        **見出しの下に説明を置かない**（モック）。モックの見出しは h2 が1行あるだけです。
        「案件はみんなで見ます。個人の持ち物にはしません」は**方針の説明**で、
        毎日開く画面で毎日読ませるものではありません（決めごとは
        `client/CLAUDE.md`・画面には「動いている案件」の副題として1行だけ残しています）。
        「◯時◯分 時点」も落としました — この画面は開くたびに引き直すので、
        **出しても常に「たった今」**にしかなりません。
      */}
      <PageHeader
        title="ダッシュボード"
        primaryAction={
          <Button onClick={() => navigate('/sales/projects/new')}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />案件をつくる
          </Button>
        }
      >
        {/*
          **届いたものは見出しの右のボタン1つ**（モック）。以前はここに
          「案件受付」の大きなカード（3タイル）を置いていましたが、
          3つとも行き先が案件作成で同じでした（`IntakeButton.tsx` に理由）。
        */}
        <IntakeButton />
      </PageHeader>

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
        スマホでは1列になり、順番は「動いている → 期限超過 → 止まっている →
        ステージ別 → 今週」。

        **「期限が過ぎたやること」は上のほうに置く。** 受付（②）を
        モックどおり引き合いだけにしたので、**相手を待たせているものを見る場所は
        ここだけ**になりました。下に送ると見られません。
      */}
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <MovingPanel />

        <OverduePanel />

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

        {/*
          **今週の現場は全幅**（モックの `grid-column: 1 / -1`）。
          7日ぶんを縦に積むので、右の 1fr に入れると日付と予定名で折り返します。
        */}
        <div className="lg:col-span-2">
          {week.data ? (
            <WeekPanel days={week.data} />
          ) : (
            <div className="rounded-card border border-border bg-card p-4">
              <Delayed><SkeletonRows rows={5} /></Delayed>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
