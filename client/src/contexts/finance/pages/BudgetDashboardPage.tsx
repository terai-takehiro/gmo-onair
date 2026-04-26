import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Loader2, AlertCircle, RefreshCw, Wallet } from "lucide-react";

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
  });
  const summary: MonthlySummary = (data?.data as MonthlySummary) ?? EMPTY_SUMMARY;
  const hasData = !!data?.data;
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
                    label: `${p.gls_number || p.name}`,
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

        {/* 損益詳細テーブル */}
        <SectionCard
          title="損益詳細"
          description="インデント式で費目の階層を表します。"
          icon={<Wallet />}
        >
          {!hasData && !isFetching && !isError ? (
            <EmptyState title="集計データがありません" description="年月を変更するか、条件を見直してください。" />
          ) : (
            <div className="max-w-md rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <caption className="sr-only">月次損益計算表</caption>
                <tbody>
                  {[
                    { label: "売上合計", value: summary.revenue_total, bold: false },
                    { label: "仕入合計", value: summary.purchase_total, bold: false, indent: true },
                    { label: "粗利", value: summary.gross_profit, bold: true, divider: true, highlight: true },
                    { label: "販管費", value: summary.sga_total, bold: false, indent: true },
                    { label: "営業利益", value: summary.operating_profit, bold: true, divider: true, highlight: true },
                  ].map(({ label, value, bold, indent, divider, highlight }, i) => (
                    <tr key={i} className={divider ? "border-t-2 border-border" : ""}>
                      <th
                        scope="row"
                        className={`px-4 py-2 text-left text-muted-foreground font-normal ${indent ? "pl-8" : ""} ${bold ? "font-semibold text-foreground" : ""}`}
                      >
                        {label}
                      </th>
                      <td
                        className={`px-4 py-2 text-right font-number tabular-nums ${bold ? "font-bold" : ""} ${highlight ? (value >= 0 ? "text-success" : "text-destructive") : "text-foreground"}`}
                      >
                        {formatCurrency(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PageTransition>
  );
}
