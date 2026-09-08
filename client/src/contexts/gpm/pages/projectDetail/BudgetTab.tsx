/**
 * プロジェクト詳細 / 予算と実績タブ（コストセンター＝GMO の案件専用）
 * — 2026年10月の事業再編・P3（`docs/reorg-2026-10-plan.md` §4.7 GMOコストセンター）
 *
 * ── なぜ「請求」タブを丸ごと差し替えるのか ──────────────────────
 *
 * GMO（グループ本体・コストセンター）の案件は、そもそも**売上を持ちません**
 * （サーバー側で売上の新規登録・付け替えが 409 で拒否される設計）。普通の会社
 * （SCS/GSS）向けの「請求」タブ（`BillingTab` → `BusinessProjectView`）を
 * そのまま出すと、押しても失敗するだけの売上ボタンが並ぶことになるため、
 * このタブでは**仕入・予算対実績・月次コストだけ**を見せます。
 *
 * ── 何を表示するか ────────────────────────────────────────────
 *
 *  1. 予算・実績・残の3枚（`GET /gpm/projects/:id/budget`）
 *     - 予算 ＝ 受理済み（`status='accepted'`）の見積の最新版合計
 *     - 実績 ＝ 確定した（見込みでない）仕入の合計
 *     - 残   ＝ 予算 − 実績
 *  2. 予算に対する実績の割合（バー）
 *  3. 月次コストの推移（確定した仕入を計上月で束ねたもの）
 *  4. 仕入の一覧・登録 — **`BusinessProjectView.tsx` の仕入部分
 *     （`usePurchaseForm`/`PurchaseList`/`PurchaseDialog`）をそのまま呼ぶ**
 *     （写すと、片方だけ直した日から仕入の入力項目が食い違う）
 *
 * **売上関連の UI（売上一覧・売上の登録ボタン・月次請求管理）は一切出しません。**
 * 見積の受理（`accepted` にする）は既存の「見積」タブ（`EstimatesTab.tsx`）から——
 * ただし現状 `EstimatesTab.tsx` に見積の状態を送付済・受注（accepted）へ進める
 * ボタンが無く（サーバー側にも GPM 用の汎用 `PUT /gpm/estimates/:id` が無い）、
 * **見積を受理する手段が今のところどこにも無い**（案件管理側の
 * `EstimateActions.tsx`/`PUT /projects/:projectId/estimates/:id` に相当するものが
 * GPM 側に未整備）。したがって当面は「予算」が 0 のまま——別途の対応が要る
 * （最終報告に記載）。
 *
 * ── レスポンシブ ──────────────────────────────────────────────
 *
 * 請求タブ（`BillingTab`）と違い、**このタブはスマホでも普通に開けます**
 * （`DetailHeader.tsx`/`GpmProjectDetailPage.tsx` の `effectiveMobileTabs` 参照）。
 * KPI 3枚は 375px で1カラムに畳み、月次コストの表は横スクロールの受け皿
 * （shared `<Table>`）に入れています。
 */
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatMonth } from '@/lib/format';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import {
  Delayed, SkeletonRows, ErrorPanel, EmptyState, NoPermissionPanel,
} from '@gmo-onair/shared/src/client/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/platform/AuthContext';
/**
 * 仕入の一覧・フォーム・ダイアログは `BusinessProjectView.tsx` から
 * 切り出し済みの部品を**そのまま**呼ぶ（写さない）。月次ユニット（エピソードを
 * 「月」として流用する機能）は使わないので `monthEpisodes` は空配列で渡す。
 */
import { usePurchaseForm } from '@/contexts/production/components/episodes/businessProject/usePurchaseForm';
import { PurchaseList } from '@/contexts/production/components/episodes/businessProject/PurchaseList';
import { PurchaseDialog } from '@/contexts/production/components/episodes/businessProject/PurchaseDialog';

interface ProjectBudget {
  project_id: string;
  budget: number;
  budget_estimate_groups: number;
  actual: number;
  remaining: number;
  monthly_cost: { month: string; total: number }[];
}

export function BudgetTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  /*
   * ⚠️ **`BillingTab.tsx` と同じ理由で権限を確かめます**（レビューでの指摘 #67）。
   * 読むもの（予算対実績・仕入・仕入先）はどれも `sales` の口なので、
   * `gpm` だけの人が開くと 403 になりえます。**押せるのに403を作らない**
   * という v4 の決めごとに合わせ、何の権限が要るかを名前で出して止めます。
   */
  const { hasPermission } = useAuth();
  const canRead = hasPermission('sales');

  const query = useQuery<ProjectBudget>({
    queryKey: ['gpm-project-budget', projectId],
    queryFn: async () => (await api.get(`/gpm/projects/${projectId}/budget`)).data.data,
    enabled: !!projectId && canRead,
  });

  // 仕入は BusinessProjectView と同じ hook・部品をそのまま呼ぶ（写さない）
  const purchaseForm = usePurchaseForm({ projectId, qc });
  const {
    purchases, purchasesLoading, deletePurMutation, openNewPurchase, openEditPurchase,
  } = purchaseForm;

  if (!canRead) {
    return (
      <div className="p-4 lg:p-6">
        <NoPermissionPanel modules={['sales']} target="このプロジェクトの予算と実績" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorPanel title="予算と実績を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }
  if (query.isLoading || !query.data) {
    return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={5} /></Delayed></div>;
  }

  const {
    budget, actual, remaining, budget_estimate_groups: budgetGroups, monthly_cost: monthlyCost,
  } = query.data;
  const pct = budget > 0 ? Math.round((actual / budget) * 100) : null;
  const over = remaining < 0;
  const maxMonthly = monthlyCost.reduce((n, m) => Math.max(n, m.total), 0);

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      {/* 予算・実績・残の3枚 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-card p-4">
          <p className="text-th text-muted-foreground">予算</p>
          <StatValue size="lg" className="mt-1 block">{formatCurrency(budget)}</StatValue>
          <p className="text-note mt-1 text-muted-foreground">
            {budgetGroups > 0
              ? '見積の状態が「受注」の最新版の合計'
              : '受理済み（状態が「受注」）の見積がまだありません'}
          </p>
        </div>
        <div className="rounded-card border border-border bg-card p-4">
          <p className="text-th text-muted-foreground">実績</p>
          <StatValue size="lg" className="mt-1 block">{formatCurrency(actual)}</StatValue>
          <p className="text-note mt-1 text-muted-foreground">確定した（見込みでない）仕入の合計</p>
        </div>
        <div className="rounded-card border border-border bg-card p-4">
          <p className="text-th text-muted-foreground">残</p>
          <StatValue size="lg" className={cn('mt-1 block', over && 'text-destructive')}>
            {formatCurrency(remaining)}
          </StatValue>
          <p className="text-note mt-1 text-muted-foreground">予算 − 実績</p>
        </div>
      </div>

      {/* 予算に対する実績の割合（バー）。予算が無ければ割合が意味を持たないので出さない */}
      {budget > 0 && pct !== null && (
        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sub text-muted-foreground">予算に対する実績</p>
            <p className={cn('text-sub font-number font-bold', over && 'text-destructive')}>{pct}%</p>
          </div>
          <div className="mt-2 block h-2 overflow-hidden rounded-chip bg-muted">
            <div
              className={cn('v4-bar block h-2 rounded-chip', over ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          {over && (
            <p className="text-note mt-1.5 text-destructive">
              予算を{formatCurrency(actual - budget)}超えています。
            </p>
          )}
        </div>
      )}

      {/* 月次コストの推移 */}
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-cardtitle">月次コストの推移</h2>
          <p className="text-note mt-0.5 text-muted-foreground">
            確定した（見込みでない）仕入を計上月で束ねたものです。
          </p>
        </div>
        {monthlyCost.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="まだ確定した仕入がありません"
              description="仕入を登録して計上月を入れると、ここに月ごとの合計が出ます。"
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月</TableHead>
                <TableHead className="w-40">割合</TableHead>
                <TableHead className="text-right">金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyCost.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="whitespace-nowrap">{formatMonth(m.month)}</TableCell>
                  <TableCell>
                    <span className="block h-1.5 overflow-hidden rounded-chip bg-muted">
                      <span
                        className="v4-bar block h-1.5 rounded-chip bg-primary"
                        style={{ width: `${maxMonthly > 0 ? Math.round((m.total / maxMonthly) * 100) : 0}%` }}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-number">{formatCurrency(m.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/*
        仕入一覧・登録。**`BusinessProjectView` の仕入部分をそのまま呼ぶ**
        （`monthlyMode`＝false・月次ユニットは使わない）。**売上一覧・売上の登録・
        月次請求管理は一切出さない**——GMO の案件は売上を持たないため。
      */}
      <PurchaseList
        monthlyMode={false}
        purchasesLoading={purchasesLoading}
        flatPurchases={purchases}
        openNewPurchase={openNewPurchase}
        openEditPurchase={openEditPurchase}
        deletePurMutation={deletePurMutation}
      />
      <PurchaseDialog form={purchaseForm} monthEpisodes={[]} />

      <p className="text-note flex items-start gap-1.5 text-muted-foreground">
        <ShoppingCart className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        予算は「見積」タブで受理済み（状態が「受注」）にした見積の最新版から決まります。
        売上の登録・月次請求はこの案件では行いません。
      </p>
    </div>
  );
}
