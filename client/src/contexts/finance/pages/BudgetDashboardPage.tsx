import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatMonth } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertCircle, RefreshCw } from "lucide-react";

interface MonthlySummary {
  month: string;
  revenue_total: number;
  purchase_total: number;
  gross_profit: number;
  sga_total: number;
  operating_profit: number;
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: "green" | "red" | "neutral" }) {
  const color = highlight === "green"
    ? value >= 0 ? "text-green-700" : "text-red-700"
    : highlight === "red"
      ? "text-red-700"
      : "";
  const bg = highlight === "green" && value >= 0 ? "bg-green-50 border-green-200" : highlight === "green" && value < 0 ? "bg-red-50 border-red-200" : "bg-card";
  return (
    <div className={`rounded-lg border p-4 text-center ${bg}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold font-number ${color}`}>{formatCurrency(value)}</p>
    </div>
  );
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

  // 案件一覧取得（絞り込み用）
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

  return (
    <PageTransition>
    <div className="space-y-6 p-3 lg:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">予算ダッシュボード</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          更新
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>年月</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" />
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
        {month && <span className="text-sm text-muted-foreground pb-2">{formatMonth(month + "-01")}</span>}
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground pb-2" />}
      </div>
      {projectId && (
        <p className="text-xs text-muted-foreground -mt-3">
          ※ 案件絞り込み時は販管費は集計に含まれません（販管費は案件紐付きなし）
        </p>
      )}

      {isError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">データの取得に失敗しました</p>
            {errorMessage && <p className="text-xs opacity-80 mt-0.5">{errorMessage}</p>}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* カード表示 — データ未取得時は 0 表示 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryCard label="売上" value={summary.revenue_total} />
          <SummaryCard label="仕入" value={summary.purchase_total} />
          <SummaryCard label="粗利" value={summary.gross_profit} highlight="green" />
          <SummaryCard label="販管費" value={summary.sga_total} />
          <SummaryCard label="営業利益" value={summary.operating_profit} highlight="green" />
        </div>

        {/* 損益テーブル */}
        <div className="max-w-sm rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: "売上合計", value: summary.revenue_total, bold: false },
                { label: "仕入合計", value: summary.purchase_total, bold: false, indent: true },
                { label: "粗利", value: summary.gross_profit, bold: true, divider: true },
                { label: "販管費", value: summary.sga_total, bold: false, indent: true },
                { label: "営業利益", value: summary.operating_profit, bold: true, divider: true, highlight: true },
              ].map(({ label, value, bold, indent, divider, highlight }, i) => (
                <tr key={i} className={divider ? "border-t border-t-2" : ""}>
                  <td className={`px-4 py-2 text-muted-foreground ${indent ? "pl-8" : ""} ${bold ? "font-semibold text-foreground" : ""}`}>{label}</td>
                  <td className={`px-4 py-2 text-right font-number ${bold ? "font-bold" : ""} ${highlight ? (value >= 0 ? "text-green-700" : "text-red-700") : ""}`}>
                    {formatCurrency(value)}
                  </td>
                  <td className="px-2 py-2 w-6">
                    {highlight && (value > 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : value < 0 ? <TrendingDown className="h-4 w-4 text-red-600" /> : <Minus className="h-4 w-4 text-muted-foreground" />)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 利益率 */}
        {hasData && summary.revenue_total > 0 && (
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p>粗利率: <span className="font-medium text-foreground">{(summary.gross_profit / summary.revenue_total * 100).toFixed(1)}%</span></p>
            <p>営業利益率: <span className={`font-medium ${summary.operating_profit >= 0 ? "text-green-700" : "text-red-700"}`}>{(summary.operating_profit / summary.revenue_total * 100).toFixed(1)}%</span></p>
          </div>
        )}

        {!hasData && !isFetching && !isError && (
          <p className="text-sm text-muted-foreground">データがありません</p>
        )}
      </div>
    </div>
    </PageTransition>
  );
}
