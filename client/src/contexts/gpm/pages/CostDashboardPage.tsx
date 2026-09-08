/**
 * コストダッシュボード（GPM・プロジェクト管理）
 * — 2026年10月の事業再編・P3（`docs/reorg-2026-10-plan.md` §4.7）
 *
 * ── 何のための画面か ────────────────────────────────────────
 *
 * GMO（グループ本体・コストセンター）に計上された案件の**予算 vs 実績**を
 * 横断で見る画面。**財務ダッシュボード**（`finance/pages/BudgetDashboardPage.tsx`）
 * とは完全に別の画面——あちらは売上を持つ会社（SCS/GSS）の損益フローで、
 * こちらは売上を持たないコストセンターの「使ったお金」だけを見る
 * （§4.7: コストセンターは新規の売上登録・請求・入金・営業見通しを閉じ、
 * 仕入・予算対実績・月次コスト集計だけを残す）。部品（`KpiCard`・`EmptyState`
 * 等）は使い回すが、ページとしては新規。
 *
 * ── 数え方は1か所（サーバー） ──────────────────────────────
 *
 * `GET /gpm/cost-dashboard` が返す `projects`（案件ごとの予算・実績・残）・
 * `monthly_trend`（月次のコスト合計）をそのまま使う。KPI 3枚の合計も
 * この同じ `projects` 配列を画面で足すだけ（`costDashboard/CostKpiCards.tsx`
 * 冒頭コメント参照）。
 *
 * ── 0件は「壊れている」ではない（`shared/CLAUDE.md`「0件の理由を分ける」）──
 *
 * `org_transition.state` が `off`／未改番のあいだ、コストセンターの案件は
 * **常に0件**（`legal_entities.kind='cost_center'` へ改番された案件だけが
 * 対象のため）。空状態はこの理由が伝わるよう、切替状態を添えて説明する。
 * `org-transition` の問い合わせは**0件と分かってから**（`enabled`）——
 * 通常時（案件がある日）に余計な1本を叩かないため。鍵は `ReorgPage.tsx` と
 * 同じ `['org-transition']` にして、直前にそちらを開いていればキャッシュを使う。
 *
 * ── スマホ対応 ──────────────────────────────────────────────
 *
 * 読むだけの画面（入力欄が無い）なので `pcOnlyScreens.ts` の
 * `CLIENT_MOBILE_OK` に入れてある。内訳は `Row`/`RowSlot`（`hideOnMobile`）が
 * 幅で自動的に畳むので、この画面自体は `useIsMobile()` を1つも書いていない。
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import {
  Delayed, SkeletonKpi, SkeletonRows, ErrorPanel, EmptyState,
} from '@gmo-onair/shared/src/client/states';
import {
  ORG_TRANSITION_STATE_LABELS, type OrgTransition,
} from '@/contexts/platform/pages/reorg/types';
import { useCostDashboard } from '../queries';
import { CostKpiCards } from './costDashboard/CostKpiCards';
import { MonthlyTrendPanel } from './costDashboard/MonthlyTrendPanel';
import { ProjectBreakdownPanel } from './costDashboard/ProjectBreakdownPanel';

export default function CostDashboardPage() {
  const navigate = useNavigate();
  const cost = useCostDashboard();
  const isEmpty = cost.data?.projects.length === 0;

  // 0件のときだけ、理由を添えるために切替状態を読む。失敗しても致命的ではない
  // ——空状態の説明が一般的な1文に留まるだけで、画面自体は出す
  const transition = useQuery<OrgTransition>({
    queryKey: ['org-transition'],
    queryFn: async () => (await api.get('/org-transition')).data.data,
    enabled: isEmpty,
  });

  const emptyDescription = transition.data
    ? `10月の事業再編（設定「会社と切替」）はいま「${ORG_TRANSITION_STATE_LABELS[transition.data.state]}」です。`
      + '案件がグループ本体（GMO）へ改番されると、ここに表示されます。'
    : '案件がグループ本体（GMO）へ改番されると、ここに表示されます。';

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="コストダッシュボード"
        sub="財務ダッシュボードとは別の画面（グループ本体＝GMOの予算 vs 実績・月次コスト集計。コストセンターは売上を持ちません）"
      />

      {cost.isError ? (
        <ErrorPanel
          title="コストダッシュボードを読み込めませんでした"
          error={cost.error}
          onRetry={() => cost.refetch()}
        />
      ) : cost.isLoading || !cost.data ? (
        <Delayed>
          <div className="space-y-3.5">
            <SkeletonKpi count={3} />
            <SkeletonRows rows={4} />
          </div>
        </Delayed>
      ) : isEmpty ? (
        <EmptyState
          icon={<Building2 />}
          title="まだコストセンターの案件がありません"
          description={emptyDescription}
          action={<Button variant="outline" onClick={() => navigate('/settings/reorg')}>会社と切替を見る</Button>}
        />
      ) : (
        <>
          <CostKpiCards projects={cost.data.projects} />
          <MonthlyTrendPanel trend={cost.data.monthly_trend} />
          <ProjectBreakdownPanel projects={cost.data.projects} />
        </>
      )}
    </div>
  );
}
