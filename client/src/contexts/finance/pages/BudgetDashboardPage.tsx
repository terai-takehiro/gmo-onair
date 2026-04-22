import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatMonth } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

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

export default function BudgetDashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["budget-monthly-summary", month],
    queryFn: async () => (await api.get("/monthly-summary", { params: { month } })).data,
    enabled: !!month,
  });
  const summary: MonthlySummary | null = data?.data ?? null;

  return (
    <PageTransition>
    <div className="space-y-6 p-3 lg:p-6">
      <h1 className="text-xl lg:text-2xl font-bold">予算ダッシュボード</h1>

      <div className="flex items-end gap-3">
        <div>
          <Label>年月</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" />
        </div>
        {month && <span className="text-sm text-muted-foreground pb-1">{formatMonth(month + "-01")}</span>}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
      {isError && <p className="text-center text-destructive py-8">データの取得に失敗しました</p>}

      {summary && (
        <div className="space-y-6">
          {/* カード表示 */}
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
          {summary.revenue_total > 0 && (
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>粗利率: <span className="font-medium text-foreground">{(summary.gross_profit / summary.revenue_total * 100).toFixed(1)}%</span></p>
              <p>営業利益率: <span className={`font-medium ${summary.operating_profit >= 0 ? "text-green-700" : "text-red-700"}`}>{(summary.operating_profit / summary.revenue_total * 100).toFixed(1)}%</span></p>
            </div>
          )}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
