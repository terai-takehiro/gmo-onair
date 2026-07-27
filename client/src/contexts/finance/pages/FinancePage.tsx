/**
 * FinancePage — お金 (§4.11 / デザイン 14a / 15a)
 *
 * KPI 7 枚を並べるのをやめ、**損益の流れ** (売上 −変動原価 = 粗利 −固定原価 = 売上総利益 −販管費 = 営業利益)
 * として関係が読める形にした。数字はクリックで明細へ。
 *
 * `?view=review3col` で **3列レビュー表示** (売上 ｜ 仕入(変動原価)+固定原価 ｜ 販管費) に切り替わる。
 * 財務MTGはこの表示でレビューする。上部は損益の流れを1行帯に圧縮し、「MTG用に出す」で印刷できる。
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { DashboardHeader, SectionCard } from "@gmo-onair/shared/src/client/dashboard";
import { cn } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, ExternalLink, Receipt, ShoppingCart, DollarSign,
  Printer, LayoutGrid, Columns3, Upload, CalendarCheck, FileText, Users,
} from "lucide-react";
import { EmptyState } from '@gmo-onair/shared/src/client/states';

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

type ViewMode = "flow" | "review3col";

export default function FinancePage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const view: ViewMode = sp.get("view") === "review3col" ? "review3col" : "flow";
  const setView = (v: ViewMode) => {
    const next = new URLSearchParams(sp);
    if (v === "flow") next.delete("view");
    else next.set("view", v);
    setSp(next, { replace: true });
  };
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

  const marginalPct = summary.revenue_total > 0 ? (summary.marginal_profit / summary.revenue_total * 100) : 0;
  const grossMarginPct = summary.revenue_total > 0 ? (summary.gross_profit / summary.revenue_total * 100) : 0;
  const operatingMarginPct = summary.revenue_total > 0 ? (summary.operating_profit / summary.revenue_total * 100) : 0;

  const headerControls = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {/* 表示切替 — 同じ画面の切り替え (別ページを作らない) */}
      <div className="inline-flex rounded-control border border-border p-0.5">
        {([["flow", "損益の流れ", LayoutGrid], ["review3col", "3列レビュー", Columns3]] as const).map(([v, label, Icon]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v as ViewMode)}
            aria-pressed={view === v}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[13px] transition-colors",
              view === v ? "bg-secondary font-bold text-foreground" : "text-secondary-foreground hover:bg-secondary"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {view === "review3col" && (
        <Button variant="outline" size="sm" className="gap-1" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          MTG用に出す
        </Button>
      )}
      {/* 請求のしごと (31章)。締めの日にここから始める */}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/finance/billing")}>
        <FileText className="h-4 w-4" aria-hidden="true" />
        請求のしごと
      </Button>
      {/* 合同案件 (32章)。1回のイベントを複数社で開いて各社に請求するとき */}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/finance/joint")}>
        <Users className="h-4 w-4" aria-hidden="true" />
        合同案件
      </Button>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/finance/import")}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        取り込む
      </Button>
      {/* ふりかえりはレールに出さないので、ここから行けるようにしておく (§4.18) */}
      <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/review")}>
        <CalendarCheck className="h-4 w-4" aria-hidden="true" />
        ふりかえり
      </Button>
      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="データ更新">
        {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
        更新
      </Button>
    </div>
  );

  /** 損益の流れ 1 段 */
  const flowSteps: Array<{ label: string; value: number; sub?: string; op?: string; tone?: "profit"; pct?: number; to?: string }> = [
    { label: "売上", value: summary.revenue_total, sub: `確定売上 ${revenueRows.length}件`, op: "−", to: "/finance?tab=revenue" },
    { label: "仕入（変動原価）", value: summary.variable_cost_total, sub: `案件に紐づく ${variablePurchaseRows.length}件`, op: "=", to: "/finance?tab=purchase" },
    { label: "粗利（限界利益）", value: summary.marginal_profit, tone: "profit", pct: marginalPct, op: "−" },
    { label: "固定原価", value: summary.fixed_cost_total, sub: `償却負担額など ${fixedPurchaseRows.length}件`, op: "=", to: "/finance?tab=purchase" },
    { label: "売上総利益", value: summary.gross_profit, tone: "profit", pct: grossMarginPct, op: "−" },
    { label: "販管費", value: summary.sga_total, sub: projectId ? "案件絞り込み中は対象外" : `案件に紐づかない ${sgaRows.length}件`, op: "=", to: "/finance?tab=sga" },
    { label: "営業利益", value: summary.operating_profit, tone: "profit", pct: operatingMarginPct },
  ];

  return (
    <PageTransition>
      <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <DashboardHeader
          title="お金"
          description={
            view === "review3col"
              ? "売上 ｜ 仕入（変動原価）＋固定原価 ｜ 販管費 を横並びでレビューします。行をクリックすると編集が開きます。"
              : "左から順に引いていくと営業利益になります。数字はクリックで明細へ。"
          }
          period={`${period.label} ・ 確定売上ベース ・ ${projectId ? "案件で絞り込み中（販管費は対象外）" : "全案件（販管費含む）"}`}
          controls={headerControls}
        />

        {/* 絞り込みフィルタ */}
        <SectionCard title="集計条件" description="集計期間（月／四半期／年／期間指定）と案件で絞り込みます。" padding="compact" className="print:hidden">
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

        {/* 損益の流れ (14a) — 関係が読める形にする。KPI を7枚並べるのをやめた */}
        <section aria-labelledby="pl-flow-heading">
          <h2 id="pl-flow-heading" className="sr-only">損益の流れ</h2>
          {view === "review3col" ? (
            /* 3列レビュー: 1行帯に圧縮 */
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
              {flowSteps.map((f, i) => (
                <span key={f.label} className="flex items-center gap-3">
                  <span className="whitespace-nowrap">
                    <span className="mr-1.5 text-[12px] text-secondary-foreground">{f.label}</span>
                    <span
                      className={cn(
                        "text-[15px] font-bold tabular-nums",
                        f.tone === "profit" ? (f.value >= 0 ? "text-success" : "text-destructive") : "text-foreground"
                      )}
                    >
                      {formatCurrency(f.value)}
                    </span>
                    {f.pct !== undefined && hasData && summary.revenue_total > 0 && (
                      <span className="ml-1 text-[11px] text-muted-foreground">{f.pct.toFixed(1)}%</span>
                    )}
                  </span>
                  {f.op && <span aria-hidden="true" className="text-[15px] font-bold text-muted-foreground">{f.op}</span>}
                  {i === flowSteps.length - 1 && null}
                </span>
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-stretch gap-2">
                {flowSteps.map((f) => (
                  <span key={f.label} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      disabled={!f.to}
                      onClick={() => f.to && navigate(f.to)}
                      className={cn(
                        "min-w-[160px] flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        f.tone === "profit" ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card",
                        f.to ? "hover:border-primary/40 hover:bg-secondary cursor-pointer" : "cursor-default"
                      )}
                      title={f.to ? "クリックで明細へ" : undefined}
                    >
                      <span className="block text-[12px] text-secondary-foreground">{f.label}</span>
                      <span
                        className={cn(
                          "mt-0.5 block whitespace-nowrap text-lg font-bold tabular-nums",
                          f.tone === "profit" ? (f.value >= 0 ? "text-success" : "text-destructive") : "text-foreground"
                        )}
                      >
                        {formatCurrency(f.value)}
                        {f.pct !== undefined && hasData && summary.revenue_total > 0 && (
                          <span className="ml-1 text-[11px] font-medium text-muted-foreground">{f.pct.toFixed(1)}%</span>
                        )}
                      </span>
                      {f.sub && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{f.sub}</span>}
                    </button>
                    {f.op && (
                      <span aria-hidden="true" className="flex items-center text-lg font-bold text-muted-foreground">
                        {f.op}
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                左から順に引いていくと営業利益になります。
                {projectId && "案件で絞り込むと販管費は集計から外れます（販管費は案件に紐づかないため）。"}
              </p>
            </>
          )}
        </section>

        {/* 内訳 (明細) — 3列。レビュー表示では印刷でも3列を維持する */}
        <div
          className={cn(
            "grid gap-5 lg:gap-6",
            view === "review3col" ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 lg:grid-cols-3"
          )}
        >
          {/* 売上 内訳 */}
          <SectionCard
            title="売上"
            description={
              view === "review3col"
                ? `${formatCurrency(summary.revenue_total)} ／ 確定売上 ${revenueRows.length}件 ・ 計上月 ${period.label}`
                : "選択期間の売上明細です。"
            }
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
                      className="h-ctl-3 flex w-full items-center justify-between gap-2 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
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
              title="仕入（変動原価）"
              description={
                view === "review3col"
                  ? `${formatCurrency(summary.variable_cost_total)} ／ 案件に紐づく ${variablePurchaseRows.length}件 ・ 申請URLから精算へ`
                  : "案件に紐づく変動原価の明細です。申請URLボタンで精算ページを開けます。"
              }
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
              title="固定原価"
              description={
                view === "review3col"
                  ? `${formatCurrency(summary.fixed_cost_total)} ／ スタジオ償却負担額など ${fixedPurchaseRows.length}件`
                  : "固定原価プロジェクト（スタジオ償却負担額等）に計上された原価です。"
              }
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
              title="販管費"
              description={
                view === "review3col"
                  ? `${formatCurrency(summary.sga_total)} ／ 案件に紐づかない ${sgaRows.length}件`
                  : "選択期間の販管費明細です。申請URLボタンで精算ページを開けます。"
              }
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

        <p className="text-[12px] text-muted-foreground">
          案件で絞り込むと販管費は集計から外れます（販管費は案件に紐づかないため）。3列表示のときも同じ挙動です。
          金額はすべて税抜です。
        </p>
      </div>
    </PageTransition>
  );
}
