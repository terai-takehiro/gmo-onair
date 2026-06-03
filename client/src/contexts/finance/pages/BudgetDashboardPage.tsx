import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatMonth } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DashboardHeader,
  KpiCard,
  SectionCard,
  EmptyState,
} from "@gmo-onair/shared/src/client/dashboard";
import { Loader2, AlertCircle, RefreshCw, ExternalLink, Receipt, ShoppingCart, DollarSign } from "lucide-react";

interface MonthlySummary {
  month: string;
  revenue_total: number;
  purchase_total: number;
  gross_profit: number;
  sga_total: number;
  operating_profit: number;
}

const EMPTY_SUMMARY: MonthlySummary = {
  month: "",
  revenue_total: 0,
  purchase_total: 0,
  gross_profit: 0,
  sga_total: 0,
  operating_profit: 0,
};

export default function BudgetDashboardPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [projectId, setProjectId] = useState<string>("");

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-budget-dashboard"],
    queryFn: async () => (await api.get("/projects?limit=500")).data,
    staleTime: 120000,
  });
  const projects: Array<{ id: string; gls_number: string | null; name: string; customer_name?: string }> =
    projectsData?.data ?? [];

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["budget-monthly-summary", month, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { month };
      if (projectId) params.project_id = projectId;
      const res = await api.get("/monthly-summary", { params, timeout: 15000 });
      return res.data;
    },
    enabled: !!month,
    retry: 1,
    refetchOnMount: "always",
  });
  const summary: MonthlySummary = (data?.data as MonthlySummary) ?? EMPTY_SUMMARY;
  const hasData = !!data?.data;

  // 内訳 (明細) — 既存の一覧 API を月 (+案件) で再利用
  const breakdownEnabled = !!month;
  const { data: revenueList } = useQuery({
    queryKey: ["budget-breakdown-revenues", month, projectId],
    queryFn: async () => {
      // KPI (monthly-summary) は確定売上のみ集計しているため内訳も confirmed に揃える
      const params: Record<string, string> = { recognition_month: month, limit: "300", status: "confirmed" };
      if (projectId) params.project_id = projectId;
      return (await api.get("/revenues", { params })).data;
    },
    enabled: breakdownEnabled,
    refetchOnMount: "always",
  });
  const { data: purchaseList } = useQuery({
    queryKey: ["budget-breakdown-purchases", month, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { recognition_month: month, limit: "300" };
      if (projectId) params.project_id = projectId;
      return (await api.get("/purchases", { params })).data;
    },
    enabled: breakdownEnabled,
    refetchOnMount: "always",
  });
  // 販管費は案件に紐づかないため、案件絞り込み時は取得しない
  const { data: sgaList } = useQuery({
    queryKey: ["budget-breakdown-sga", month],
    queryFn: async () =>
      (await api.get("/sga", { params: { recognition_month: month, limit: "300" } })).data,
    enabled: breakdownEnabled && !projectId,
    refetchOnMount: "always",
  });

  const revenueRows: Array<{ id: string; gls_number?: string | null; project_name?: string | null; customer_name?: string | null; amount: number }> = revenueList?.data ?? [];
  const purchaseRows: Array<{ id: string; gls_number?: string | null; project_name?: string | null; vendor_name?: string | null; description?: string | null; amount: number; settlement_url?: string | null; is_provisional?: boolean }> = purchaseList?.data ?? [];
  const sgaRows: Array<{ id: string; vendor_name?: string | null; description?: string | null; amount: number; settlement_url?: string | null }> = sgaList?.data ?? [];
  const errorMessage =
    (error as { response?: { data?: { error?: { message?: string } } }; message?: string } | null)
      ?.response?.data?.error?.message ||
    (error as { message?: string } | null)?.message ||
    "";

  const refreshButton = (
    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="データ更新">
      {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
      更新
    </Button>
  );

  const grossMarginPct = summary.revenue_total > 0 ? (summary.gross_profit / summary.revenue_total * 100) : 0;
  const operatingMarginPct = summary.revenue_total > 0 ? (summary.operating_profit / summary.revenue_total * 100) : 0;

  return (
    <PageTransition>
      <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <DashboardHeader
          title="予算ダッシュボード"
          description="月次の売上・仕入・粗利・販管費・営業利益を単一画面で確認します。"
          period={month ? formatMonth(month + "-01") : undefined}
          controls={refreshButton}
        />

        {/* 絞り込みフィルタ */}
        <SectionCard title="集計条件" description="年月と案件で絞り込みます。" padding="compact">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="budget-month">年月</Label>
              <Input
                id="budget-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex-1 min-w-[240px] max-w-md">
              <Label>案件（任意）</Label>
              <SearchableSelect
                options={[
                  { value: "", label: "— 全案件（販管費含む） —" },
                  ...projects.map((p) => ({
                    value: p.id,
                    label: [p.gls_number, p.name].filter(Boolean).join("　") || p.name,
                    subLabel: p.customer_name || "",
                  })),
                ]}
                value={projectId}
                onChange={(v) => setProjectId(v)}
                placeholder="GLS番号・案件名で絞り込み..."
              />
            </div>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground pb-2" aria-label="読み込み中" />}
          </div>
          {projectId && (
            <p className="mt-3 text-xs text-muted-foreground">
              ※ 案件絞り込み時は販管費は集計に含まれません (販管費は案件紐付きなし)
            </p>
          )}
        </SectionCard>

        {isError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">データの取得に失敗しました</p>
              {errorMessage && <p className="text-xs opacity-80 mt-0.5">{errorMessage}</p>}
            </div>
          </div>
        )}

        {/* 主要指標 */}
        <section aria-labelledby="budget-kpi-heading">
          <h2 id="budget-kpi-heading" className="sr-only">損益サマリー</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="売上" value={formatCurrency(summary.revenue_total)} loading={isFetching && !hasData} />
            <KpiCard label="仕入" value={formatCurrency(summary.purchase_total)} loading={isFetching && !hasData} />
            <KpiCard
              label="粗利"
              value={formatCurrency(summary.gross_profit)}
              emphasis={summary.gross_profit >= 0 ? 'success' : 'negative'}
              unit={hasData && summary.revenue_total > 0 ? `${grossMarginPct.toFixed(1)}%` : undefined}
              loading={isFetching && !hasData}
            />
            <KpiCard label="販管費" value={formatCurrency(summary.sga_total)} loading={isFetching && !hasData} />
            <KpiCard
              label="営業利益"
              value={formatCurrency(summary.operating_profit)}
              emphasis={summary.operating_profit >= 0 ? 'success' : 'negative'}
              unit={hasData && summary.revenue_total > 0 ? `${operatingMarginPct.toFixed(1)}%` : undefined}
              loading={isFetching && !hasData}
            />
          </div>
        </section>

        {/* 内訳 (明細) — PC は横並び 3 カラム */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
          {/* 売上 内訳 */}
          <SectionCard
            title="売上 内訳"
            description="選択月の売上明細です。"
            icon={<DollarSign />}
            footnote={`${revenueRows.length} 件`}
          >
            {revenueRows.length === 0 ? (
              <EmptyState title="売上明細がありません" />
            ) : (
              <ul className="divide-y divide-border">
                {revenueRows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/budget/revenues?edit=${r.id}`)}
                      className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      title="クリックで売上詳細を開く"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground">
                          <span className="font-number text-primary">{r.gls_number || "-"}</span>
                          {r.project_name && <span className="ml-2">{r.project_name}</span>}
                        </p>
                        {r.customer_name && (
                          <p className="truncate text-xs text-muted-foreground">{r.customer_name}</p>
                        )}
                      </div>
                      <span className="shrink-0 font-number tabular-nums">{formatCurrency(r.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* 仕入 内訳 */}
          <SectionCard
            title="仕入 内訳"
            description="選択月の仕入明細です。申請URLボタンで精算ページを開けます。"
            icon={<ShoppingCart />}
            footnote={`${purchaseRows.length} 件`}
          >
            {purchaseRows.length === 0 ? (
              <EmptyState title="仕入明細がありません" />
            ) : (
              <ul className="divide-y divide-border">
                {purchaseRows.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/budget/purchases?edit=${p.id}`)}
                      className="min-w-0 flex-1 py-1 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      title="クリックで仕入編集を開く"
                    >
                      <p className="truncate text-foreground">
                        <span className="font-number text-primary">{p.gls_number || "-"}</span>
                        {p.project_name && <span className="ml-2">{p.project_name}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.vendor_name, p.description].filter(Boolean).join("／") || "-"}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="min-w-[96px] text-right font-number tabular-nums text-sm">
                        {p.is_provisional && (
                          <span className="mr-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700 align-middle">
                            仮
                          </span>
                        )}
                        {formatCurrency(p.amount)}
                      </span>
                      {/* URL の有無に関わらず金額の縦列を揃えるため固定幅スロットを確保 */}
                      <span className="inline-flex w-5 shrink-0 justify-center">
                        {p.settlement_url && (
                          <a
                            href={p.settlement_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-primary hover:text-primary/80"
                            title="申請URLを開く"
                            aria-label="申請URLを開く"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* 販管費 内訳 (案件絞り込み時は非表示) */}
          {!projectId && (
            <SectionCard
              title="販管費 内訳"
              description="選択月の販管費明細です。申請URLボタンで精算ページを開けます。"
              icon={<Receipt />}
              footnote={`${sgaRows.length} 件`}
            >
              {sgaRows.length === 0 ? (
                <EmptyState title="販管費明細がありません" />
              ) : (
                <ul className="divide-y divide-border">
                  {sgaRows.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/budget/sga?edit=${s.id}`)}
                        className="min-w-0 flex-1 py-1 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        title="クリックで販管費編集を開く"
                      >
                        <p className="truncate text-foreground">{s.vendor_name || "-"}</p>
                        {s.description && (
                          <p className="truncate text-xs text-muted-foreground">{s.description}</p>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="min-w-[96px] text-right font-number tabular-nums">{formatCurrency(s.amount)}</span>
                        {/* URL の有無に関わらず金額の縦列を揃えるため固定幅スロットを確保 */}
                        <span className="inline-flex w-5 shrink-0 justify-center">
                          {s.settlement_url && (
                            <a
                              href={s.settlement_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-primary hover:text-primary/80"
                              title="申請URLを開く"
                              aria-label="申請URLを開く"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
