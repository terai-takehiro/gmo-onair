import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate, formatShortDate } from "@/lib/format";
import { ProjectStageLabels, ProjectStageColors, ProjectTypeLabels, type ProjectStage } from "@/types";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, Loader2, ExternalLink, Building2, User, Calendar, Tag, Sparkles, Info,
} from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

type SortKey = 'default' | 'created_at' | 'name' | 'customer' | 'stage' | 'expected_amount' | 'event_start';
type SortDir = 'asc' | 'desc';
type TabFilter = 'all' | 'yomi' | 'active' | 'completed' | 'lost';
type EventPeriodMode = 'half' | 'month' | 'quarter' | 'year' | 'all';

const tabs: { value: TabFilter; label: string }[] = [
  { value: 'all', label: '全て' },
  { value: 'yomi', label: 'ヨミ' },
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '完了' },
  { value: 'lost', label: '失注' },
];

// v2.9.203+: デフォルトは「ネタ → 提案中 (B→D) → 受注済 (完了→A) → 失注」(ネタを先頭に)
const sortOptions: { value: `${SortKey}:${SortDir}`; label: string }[] = [
  { value: 'default:asc', label: 'おすすめ (ネタ → 提案中 → 受注済)' },
  { value: 'event_start:asc', label: 'イベント日 (近い順)' },
  { value: 'event_start:desc', label: 'イベント日 (遠い順)' },
  { value: 'created_at:desc', label: '作成日 (新しい順)' },
  { value: 'created_at:asc', label: '作成日 (古い順)' },
  { value: 'expected_amount:desc', label: '金額 (高い順)' },
  { value: 'expected_amount:asc', label: '金額 (安い順)' },
  { value: 'name:asc', label: '案件名 (50音)' },
  { value: 'customer:asc', label: '顧客名 (50音)' },
];

export default function ProjectListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [termHintOpen, setTermHintOpen] = useState(false);
  const [page, setPage] = useState(1);
  // AI 起票フィルタ (確認操作は受信箱 /sales/inbox に一本化 — ここはバッジ+絞り込みのみ)
  const [aiOnly, setAiOnly] = useState(false);
  const [aiUnreviewedOnly, setAiUnreviewedOnly] = useState(true);
  const [sort, setSort] = useState<`${SortKey}:${SortDir}`>("default:asc");
  const [sortKey, sortDir] = sort.split(":") as [SortKey, SortDir];
  // 開催期間 絞り込み。既定は「今月〜半年先」、月/四半期/年/全件 も選択可
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const curYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const [eventMode, setEventMode] = useState<EventPeriodMode>("half");
  const [eventMonth, setEventMonth] = useState(curYm);
  const [eventYear, setEventYear] = useState(now.getFullYear());
  const [eventQuarter, setEventQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  // 開催期間レンジ (YYYY-MM-DD)。'all' は null (絞り込みなし)
  const eventRange = useMemo(() => {
    if (eventMode === "all") return null;
    if (eventMode === "month") return { from: `${eventMonth}-01`, to: `${eventMonth}-31` };
    if (eventMode === "quarter") {
      const sm = (eventQuarter - 1) * 3 + 1;
      return { from: `${eventYear}-${pad2(sm)}-01`, to: `${eventYear}-${pad2(sm + 2)}-31` };
    }
    if (eventMode === "year") return { from: `${eventYear}-01-01`, to: `${eventYear}-12-31` };
    // half: 今月〜半年先 (今月初日 〜 6ヶ月先の月末)
    const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    const end = new Date(now.getFullYear(), now.getMonth() + 7, 0); // (今月+6) の月末
    const to = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
    return { from, to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventMode, eventMonth, eventYear, eventQuarter]);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", page, search, tab, sortKey, sortDir, eventRange?.from, eventRange?.to, aiOnly, aiUnreviewedOnly],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (tab !== 'all') params.tab = tab;
      if (eventRange) { params.event_from = eventRange.from; params.event_to = eventRange.to; }
      if (aiOnly) {
        params.ai_created = 1;
        if (aiUnreviewedOnly) params.ai_reviewed = "unreviewed";
      }
      params.sort_by = sortKey;
      params.sort_dir = sortDir;
      return (await api.get("/projects", { params })).data;
    },
  });

  const projects = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <PageTransition>
    <div className="space-y-4 p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">案件管理</h1>
        <div className="flex flex-wrap gap-2">
          <ExcelToolbar resource="/projects" name="案件" queryKey={["projects"]} />
          <Button onClick={() => navigate("/sales/projects/new")}>
            <Plus className="mr-2 h-4 w-4" />
            新規作成
          </Button>
        </div>
      </div>

      {/* Tab filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as TabFilter); setPage(1); }}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <button
          type="button"
          onClick={() => setTermHintOpen((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
            termHintOpen ? "border-primary/40 bg-primary/5 text-primary" : "border-input bg-background text-muted-foreground hover:bg-muted"
          }`}
          title="ヨミ・ネタ・GLS などの用語の説明"
          aria-expanded={termHintOpen}
        >
          <Info className="h-3.5 w-3.5" />
          用語
        </button>
        {/* AI 起票フィルタ */}
        <button
          type="button"
          onClick={() => { setAiOnly((v) => !v); setPage(1); }}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            aiOnly ? "border-violet-300 bg-violet-50 text-violet-700" : "border-input bg-background text-muted-foreground hover:bg-muted"
          }`}
          title="AI（メール取込等）が起票した案件だけを表示"
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI起票のみ
        </button>
        {aiOnly && (
          <button
            type="button"
            onClick={() => { setAiUnreviewedOnly((v) => !v); setPage(1); }}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              aiUnreviewedOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-input bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {aiUnreviewedOnly ? "未確認のみ" : "確認済みも表示"}
          </button>
        )}
      </div>

      {/* 用語ヒント (「用語」ボタンで開閉) */}
      {termHintOpen && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2.5 text-xs text-muted-foreground space-y-1">
          <p><span className="font-semibold text-foreground">ネタ</span> … 最初の見込み段階。まだ提案前の「案件のタネ」。</p>
          <p><span className="font-semibold text-foreground">ヨミ</span> … GLS 発番前の見込み案件全般（ネタ → 提案 → 口頭決定 の各段階）。受注確度を「読む」フェーズ。</p>
          <p><span className="font-semibold text-foreground">GLS 番号</span> … 受注が固まった案件に発番される正式な案件番号（GLS-A… / GLS-B…）。発番後は「進行中」タブに移ります。</p>
        </div>
      )}

      {/* AI 起票の確認操作は受信箱 (/sales/inbox) に一本化 */}
      {aiOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2">
          <span className="text-xs text-violet-800">
            AI 起票の「確認済み」操作は受信箱から行えます。
          </span>
          <Button
            type="button" variant="outline" size="sm" className="ml-auto h-8 gap-1 text-xs text-violet-700"
            onClick={() => navigate("/sales/inbox")}
          >
            受信箱を開く
          </Button>
        </div>
      )}

      {/* Search + month filter + sort */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="案件名・コード・顧客名で検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
          {search && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              検索中は開催期間の絞り込みを無視して全期間から探します
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 開催期間モード切替 */}
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {([["half", "半年"], ["month", "月"], ["quarter", "四半期"], ["year", "年"], ["all", "全件"]] as [EventPeriodMode, string][]).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => { setEventMode(m); setPage(1); }}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${eventMode === m ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted"}`}
              >
                {lbl}
              </button>
            ))}
          </div>
          {eventMode === "month" && (
            <Input
              type="month"
              value={eventMonth}
              onChange={(e) => { setEventMonth(e.target.value); setPage(1); }}
              className="w-36"
              aria-label="開催月で絞り込み"
            />
          )}
          {eventMode === "quarter" && (
            <>
              <Input type="number" value={eventYear} onChange={(e) => { setEventYear(Number(e.target.value) || eventYear); setPage(1); }} className="w-20" aria-label="年" />
              <Select value={String(eventQuarter)} onValueChange={(v) => { setEventQuarter(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1Q（1〜3月）</SelectItem>
                  <SelectItem value="2">2Q（4〜6月）</SelectItem>
                  <SelectItem value="3">3Q（7〜9月）</SelectItem>
                  <SelectItem value="4">4Q（10〜12月）</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          {eventMode === "year" && (
            <Input type="number" value={eventYear} onChange={(e) => { setEventYear(Number(e.target.value) || eventYear); setPage(1); }} className="w-24" aria-label="年" />
          )}
          {eventMode === "half" && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">今月〜半年先を表示</span>
          )}
        </div>
        <Select value={sort} onValueChange={(v) => { setSort(v as typeof sort); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState title="該当する案件がありません" description="検索条件を変えるか、新しい案件を作成してください。" />
      ) : (
        <>
          {/* v2.9.203+: ネタ → 提案中 (B→D) → 受注済 (完了→A) → 失注 の 4 区分で表示 (ネタを先頭に) */}
          {(() => {
            const groupOf = (p: Record<string, unknown>) => {
              const s = p.stage as string;
              if (s === 'neta') return 0;
              if (s === 'b_verbal' || s === 'c_proposal' || s === 'd_hold') return 1;
              if (s === 's_completed' || s === 'a_won') return 2;
              return 3; // e_lost
            };
            const groups = [
              { label: 'ネタ', items: projects.filter((p: Record<string, unknown>) => groupOf(p) === 0) },
              { label: '提案中', items: projects.filter((p: Record<string, unknown>) => groupOf(p) === 1) },
              { label: '受注済・完了', items: projects.filter((p: Record<string, unknown>) => groupOf(p) === 2) },
              { label: '失注', items: projects.filter((p: Record<string, unknown>) => groupOf(p) === 3) },
            ].filter((g) => g.items.length > 0);
            return groups.map((g, gi) => (
              <div key={g.label} className="space-y-3">
                <div className={`flex items-center gap-3 ${gi > 0 ? 'pt-2' : ''}`}>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground tracking-wider">
                    {g.label}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
                  {g.items.map((p: Record<string, unknown>) => (
                    <ProjectCard
                      key={p.id as string}
                      project={p}
                      terminal={p.stage === 'e_lost'}
                      onClick={() => navigate(`/sales/projects/${p.id}`)}
                    />
                  ))}
                </div>
              </div>
            ));
          })()}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                全{pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}件
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  前へ
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </PageTransition>
  );
}

/**
 * 案件カード — v2.7.15+ で導入したモダンカードデザイン (Pattern A)。
 * 全画面幅で読みやすく、テーブルの「列が潰れる」問題を解消。
 * v2.8.1+: terminal=true で完了・失注案件向けの薄い表示に切替。
 */
function ProjectCard({
  project: p,
  onClick,
  terminal = false,
}: {
  project: Record<string, unknown>;
  onClick: () => void;
  terminal?: boolean;
}) {
  const totalRevenue = Number(p.total_revenue) || 0;
  const totalPurchase = Number(p.total_purchase) || 0;
  const expectedAmount = Number(p.expected_amount) || 0;
  const grossProfit = totalRevenue - totalPurchase;
  const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : null;
  const hasActuals = totalRevenue > 0 || totalPurchase > 0;
  const code = (p.gls_number as string) || (p.code as string) || "";
  const stage = p.stage as ProjectStage;
  const stageLabel = ProjectStageLabels[stage] || (p.stage as string);
  const stageColor = ProjectStageColors[stage];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`group cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        terminal ? 'bg-muted/40 opacity-75 hover:opacity-100' : 'bg-card'
      }`}
    >
      {/* Top row: code + stage + amount */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <span className=" text-xs text-muted-foreground">{code || "—"}</span>
          <Badge className="shrink-0 text-[11px]" style={{ backgroundColor: stageColor, color: '#fff' }}>
            {stageLabel}
          </Badge>
          {!!p.is_ai_created && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700"
              title={p.ai_requested_by ? `AI起票 (指示: ${p.ai_requested_by})` : "AI（メール取込等）により起票された案件"}
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              AI起票
              {!p.ai_reviewed_at ? <span className="text-amber-600 font-medium">·未確認</span> : null}
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          {totalRevenue > 0 ? (
            <span className="font-number text-base font-semibold">{formatCurrency(totalRevenue)}</span>
          ) : expectedAmount > 0 ? (
            <span className="font-number text-base font-semibold text-muted-foreground">
              <span className="text-[10px] mr-0.5">(想定)</span>{formatCurrency(expectedAmount)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-base leading-snug mb-2 group-hover:text-primary transition-colors [word-break:keep-all] [overflow-wrap:anywhere]">
        {p.name as string}
        {(p.event_end as string) && (
          <span className="text-xs font-normal text-muted-foreground ml-1.5">
            ({formatShortDate(p.event_end as string)})
          </span>
        )}
      </h3>

      {/* Meta: customer / assigned / event date */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
        <span className="inline-flex items-center gap-1 min-w-0">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{(p.customer_name as string) || "-"}</span>
        </span>
        {(p.assigned_to_name as string) && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            {p.assigned_to_name as string}
          </span>
        )}
        {(p.event_start as string) && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3 shrink-0" />
            {p.event_end && p.event_end !== p.event_start
              ? `${formatDate(p.event_start as string)} 〜 ${formatDate(p.event_end as string)}`
              : formatDate(p.event_start as string)}
            {Number(p.dates_count) > 2 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                {Number(p.dates_count)}日（飛び日）
              </span>
            )}
          </span>
        )}
        {(p.project_type as string) && (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3 shrink-0" />
            {ProjectTypeLabels[p.project_type as keyof typeof ProjectTypeLabels] || (p.project_type as string)}
          </span>
        )}
      </div>

      {/* Financials (only if there are actuals) */}
      {hasActuals && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t text-xs">
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground">売上</span>
            <span className="font-number font-medium">{formatCurrency(totalRevenue)}</span>
          </span>
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground">仕入</span>
            <span className="font-number font-medium">{formatCurrency(totalPurchase)}</span>
          </span>
          <span className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground">粗利</span>
            <span className={`font-number font-semibold ${grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(grossProfit)}
              {grossMargin !== null && (
                <span className="text-[10px] ml-0.5 font-normal">({grossMargin}%)</span>
              )}
            </span>
          </span>
        </div>
      )}

      {/* BOX links */}
      {((p.box_url_internal as string) || (p.box_url_external as string)) && (
        <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          {(p.box_url_internal as string) && (
            <a
              href={p.box_url_internal as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
              title="社内限Box"
            >
              <ExternalLink className="h-3 w-3" />社内Box
            </a>
          )}
          {(p.box_url_external as string) && (
            <a
              href={p.box_url_external as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
              title="外部共有Box"
            >
              <ExternalLink className="h-3 w-3" />外部共有Box
            </a>
          )}
        </div>
      )}
    </div>
  );
}
