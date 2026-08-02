import { useState, useMemo } from "react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  fixed_cost_total: number;   // 固定原価
  variable_cost_total: number; // 変動原価 (= 仕入 − 固定原価)
  marginal_profit: number;    // 限界利益 (= 売上 − 変動原価)
  gross_profit: number;       // 売上総利益 (= 限界利益 − 固定原価)
  sga_total: number;
  operating_profit: number;   // 営業利益 (= 売上総利益 − 販管費)
}

const EMPTY_SUMMARY: MonthlySummary = {
  month: "",
  revenue_total: 0,
  purchase_total: 0,
  fixed_cost_total: 0,
  variable_cost_total: 0,
  marginal_profit: 0,
  gross_profit: 0,
  sga_total: 0,
  operating_profit: 0,
};

type PeriodMode = "month" | "quarter" | "year" | "range";
const pad2 = (n: number) => String(n).padStart(2, "0");

export default function BudgetDashboardPage() {
  const navigate = useNavigate();
  const now = new Date();
  const curYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [month, setMonth] = useState(curYm); // 月モード
  const [year, setYear] = useState(now.getFullYear()); // 四半期 / 年モード
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1); // 1〜4
  const [rangeFrom, setRangeFrom] = useState(`${now.getFullYear()}-01`); // 期間指定 (YYYY-MM)
  const [rangeTo, setRangeTo] = useState(curYm);
  const [projectId, setProjectId] = useState<string>("");

  // 集計期間を [from, to] (YYYY-MM-DD) + 表示ラベルに正規化
  const period = useMemo(() => {
    if (periodMode === "quarter") {
      const sm = (quarter - 1) * 3 + 1;
      const em = sm + 2;
      return { from: `${year}-${pad2(sm)}-01`, to: `${year}-${pad2(em)}-31`, label: `${year}年 ${quarter}Q（${sm}〜${em}月）` };
    }
    if (periodMode === "year") {
      return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}年（1〜12月 合算）` };
    }
    if (periodMode === "range") {
      const [f, t] = rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
      return { from: `${f}-01`, to: `${t}-31`, label: `${formatMonth(f + "-01")} 〜 ${formatMonth(t + "-01")}` };
    }
    return { from: `${month}-01`, to: `${month}-31`, label: formatMonth(month + "-01") };
  }, [periodMode, month, year, quarter, rangeFrom, rangeTo]);

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-budget-dashboard"],
    queryFn: async () => (await api.get("/projects?limit=500")).data,
    staleTime: 120000,
  });
  const projects: Array<{ id: string; gls_number: string | null; name: string; customer_name?: string }> =
    projectsData?.data ?? [];

  // 期間が複数月にまたがると明細が増えるため上限を引き上げる
  const breakdownLimit = periodMode === "month" ? "300" : "2000";

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["budget-monthly-summary", period.from, period.to, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { from: period.from, to: period.to };
      if (projectId) params.project_id = projectId;
      const res = await api.get("/monthly-summary", { params, timeout: 20000 });
      return res.data;
    },
    enabled: !!period.from,
    retry: 1,
    refetchOnMount: "always",
  });
  const summary: MonthlySummary = (data?.data as MonthlySummary) ?? EMPTY_SUMMARY;
  const hasData = !!data?.data;

  // 内訳 (明細) — 既存の一覧 API を期間 (+案件) で再利用
  const breakdownEnabled = !!period.from;
  const { data: revenueList } = useQuery({
    queryKey: ["budget-breakdown-revenues", period.from, period.to, projectId],
    queryFn: async () => {
      // KPI (monthly-summary) は確定売上のみ集計しているため内訳も confirmed に揃える
      const params: Record<string, string> = { recognition_from: period.from, recognition_to: period.to, limit: breakdownLimit, status: "confirmed" };
      if (projectId) params.project_id = projectId;
      return (await api.get("/revenues", { params })).data;
    },
    enabled: breakdownEnabled,
    refetchOnMount: "always",
  });
  // 仕入(変動原価) 内訳: 固定原価Pjを除外。固定原価は gls_number=NULL で
  // 既定ソート (gls ASC NULLS LAST) の末尾に来るため、limit 内に入らず消えるのを防ぐ。
  const { data: purchaseList } = useQuery({
    queryKey: ["budget-breakdown-purchases", period.from, period.to, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { recognition_from: period.from, recognition_to: period.to, limit: breakdownLimit, fixed_cost: "0" };
      if (projectId) params.project_id = projectId;
      return (await api.get("/purchases", { params })).data;
    },
    enabled: breakdownEnabled,
    refetchOnMount: "always",
  });
  // 固定原価 内訳: 固定原価Pjのみを専用クエリで取得 (件数が少ないため limit 切れの心配なし)
  const { data: fixedList } = useQuery({
    queryKey: ["budget-breakdown-fixed", period.from, period.to, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { recognition_from: period.from, recognition_to: period.to, limit: "2000", fixed_cost: "1" };
      if (projectId) params.project_id = projectId;
      return (await api.get("/purchases", { params })).data;
    },
    enabled: breakdownEnabled,
    refetchOnMount: "always",
  });
  // 販管費は案件に紐づかないため、案件絞り込み時は取得しない
  const { data: sgaList } = useQuery({
    queryKey: ["budget-breakdown-sga", period.from, period.to],
    queryFn: async () =>
      (await api.get("/sga", { params: { recognition_from: period.from, recognition_to: period.to, limit: breakdownLimit } })).data,
    enabled: breakdownEnabled && !projectId,
    refetchOnMount: "always",
  });

  const revenueRows: Array<{ id: string; gls_number?: string | null; episode_code?: string | null; project_name?: string | null; customer_name?: string | null; amount: number }> = revenueList?.data ?? [];
  type PurchaseRow = { id: string; gls_number?: string | null; episode_code?: string | null; project_name?: string | null; project_code?: string | null; vendor_name?: string | null; description?: string | null; amount: number; settlement_url?: string | null; is_provisional?: boolean };
  // 仕入(変動原価) = fixed_cost=0 で取得済 / 固定原価 = 専用クエリ (fixed_cost=1)
  const variablePurchaseRows: PurchaseRow[] = purchaseList?.data ?? [];
  const fixedPurchaseRows: PurchaseRow[] = fixedList?.data ?? [];
  const sgaRows: Array<{ id: string; vendor_name?: string | null; description?: string | null; amount: number; settlement_url?: string | null }> = sgaList?.data ?? [];
  const errorMessage =
    (error as { response?: { data?: { error?: { message?: string } } }; message?: string } | null)
      ?.response?.data?.error?.message ||
    (error as { message?: string } | null)?.message ||
    "";

  const renderPurchaseItem = (p: PurchaseRow) => (
    <li key={p.id} className="flex items-center justify-between gap-2 py-1">
      <button
        type="button"
        onClick={() => navigate(`/budget/purchases?edit=${p.id}`)}
        className="min-w-0 flex-1 py-1 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        title="クリックで仕入編集を開く"
      >
        <p className="truncate text-foreground">
          <span className="font-number text-primary">{p.episode_code || p.gls_number || "-"}</span>
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
  );

  const refreshButton = (
    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="データ更新">
      {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
      更新
    </Button>
  );

  const marginalPct = summary.revenue_total > 0 ? (summary.marginal_profit / summary.revenue_total * 100) : 0;
  const grossMarginPct = summary.revenue_total > 0 ? (summary.gross_profit / summary.revenue_total * 100) : 0;
  const operatingMarginPct = summary.revenue_total > 0 ? (summary.operating_profit / summary.revenue_total * 100) : 0;

  return (
    <PageTransition>
      <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <DashboardHeader
          title="財務ダッシュボード"
          description="売上・変動原価・限界利益・固定原価・売上総利益・販管費・営業利益を、月／四半期／年／期間指定で確認します。"
          period={period.label}
          controls={refreshButton}
        />

        {/* 絞り込みフィルタ */}
        <SectionCard title="集計条件" description="集計期間（月／四半期／年／期間指定）と案件で絞り込みます。" padding="compact">
          {/* 期間モード切替 */}
          <div className="mb-3 inline-flex flex-wrap rounded-lg border border-border p-0.5">
            {([["month", "月"], ["quarter", "四半期"], ["year", "年"], ["range", "期間指定"]] as [PeriodMode, string][]).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => setPeriodMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${periodMode === m ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted"}`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {periodMode === "month" && (
              <div>
                <Label htmlFor="budget-month">年月</Label>
                <Input id="budget-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
              </div>
            )}
            {periodMode === "quarter" && (
              <>
                <div>
                  <Label htmlFor="budget-year-q">年</Label>
                  <Input id="budget-year-q" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className="w-24" />
                </div>
                <div>
                  <Label>四半期</Label>
                  <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1Q（1〜3月）</SelectItem>
                      <SelectItem value="2">2Q（4〜6月）</SelectItem>
                      <SelectItem value="3">3Q（7〜9月）</SelectItem>
                      <SelectItem value="4">4Q（10〜12月）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {periodMode === "year" && (
              <div>
                <Label htmlFor="budget-year">年</Label>
                <Input id="budget-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className="w-28" />
              </div>
            )}
            {periodMode === "range" && (
              <>
                <div>
                  <Label htmlFor="budget-from">開始月</Label>
                  <Input id="budget-from" type="month" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label htmlFor="budget-to">終了月</Label>
                  <Input id="budget-to" type="month" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="w-40" />
                </div>
              </>
            )}
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

        {/* 主要指標 — 損益の流れ: 売上 −変動原価= 粗利(限界利益) −固定原価= 売上総利益 −販管費= 営業利益 */}
        <section aria-labelledby="budget-kpi-heading">
          <h2 id="budget-kpi-heading" className="sr-only">損益サマリー</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <KpiCard label="売上" value={formatCurrency(summary.revenue_total)} loading={isFetching && !hasData} />
            <KpiCard label="仕入（変動原価）" value={formatCurrency(summary.variable_cost_total)} loading={isFetching && !hasData} />
            <KpiCard
              label="粗利（限界利益）"
              value={formatCurrency(summary.marginal_profit)}
              emphasis={summary.marginal_profit >= 0 ? 'success' : 'negative'}
              unit={hasData && summary.revenue_total > 0 ? `${marginalPct.toFixed(1)}%` : undefined}
              loading={isFetching && !hasData}
            />
            <KpiCard label="固定原価" value={formatCurrency(summary.fixed_cost_total)} loading={isFetching && !hasData} />
            <KpiCard
              label="売上総利益"
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
          <p className="mt-2 text-xs text-muted-foreground">
            売上 −変動原価 = <span className="font-medium text-foreground">粗利（限界利益）</span> ／
            粗利 −固定原価 = <span className="font-medium text-foreground">売上総利益</span> ／
            売上総利益 −販管費 = <span className="font-medium text-foreground">営業利益</span>
          </p>
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
                          <span className="font-number text-primary">{r.episode_code || r.gls_number || "-"}</span>
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

          {/* 仕入(変動原価) 内訳 + 固定原価 内訳 を中央カラムに縦積み */}
          <div className="space-y-5 lg:space-y-6">
            <SectionCard
              title="仕入（変動原価） 内訳"
              description="案件に紐づく変動原価の明細です。申請URLボタンで精算ページを開けます。"
              icon={<ShoppingCart />}
              footnote={`${variablePurchaseRows.length} 件`}
            >
              {variablePurchaseRows.length === 0 ? (
                <EmptyState title="変動原価の明細がありません" />
              ) : (
                <ul className="divide-y divide-border">
                  {variablePurchaseRows.map(renderPurchaseItem)}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="固定原価 内訳"
              description="固定原価プロジェクト（スタジオ償却負担額等）に計上された原価です。"
              icon={<ShoppingCart />}
              footnote={`${fixedPurchaseRows.length} 件`}
            >
              {fixedPurchaseRows.length === 0 ? (
                <EmptyState title="固定原価の明細がありません" />
              ) : (
                <ul className="divide-y divide-border">
                  {fixedPurchaseRows.map(renderPurchaseItem)}
                </ul>
              )}
            </SectionCard>
          </div>

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
