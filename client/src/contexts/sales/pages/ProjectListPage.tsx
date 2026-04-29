import { useState } from "react";
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
  Plus, Search, Loader2, ExternalLink, Building2, User, Calendar, Tag,
} from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

type SortKey = 'default' | 'created_at' | 'name' | 'customer' | 'stage' | 'expected_amount' | 'event_start';
type SortDir = 'asc' | 'desc';
type TabFilter = 'all' | 'yomi' | 'active' | 'completed' | 'lost';

const tabs: { value: TabFilter; label: string }[] = [
  { value: 'all', label: '全て' },
  { value: 'yomi', label: 'ヨミ' },
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '完了' },
  { value: 'lost', label: '失注' },
];

// v2.8.1+: デフォルトは「イベント日の近い順 + 完了/失注は最後」
const sortOptions: { value: `${SortKey}:${SortDir}`; label: string }[] = [
  { value: 'default:asc', label: 'おすすめ (イベント日順 + 完了/失注は最後)' },
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
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<`${SortKey}:${SortDir}`>("default:asc");
  const [sortKey, sortDir] = sort.split(":") as [SortKey, SortDir];

  const { data, isLoading } = useQuery({
    queryKey: ["projects", page, search, tab, sortKey, sortDir],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (tab !== 'all') params.tab = tab;
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
      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabFilter); setPage(1); }}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search + sort */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="案件名・コード・顧客名で検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
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
          {/* v2.8.1+: 進行中と完了/失注を視覚的に分離して表示 */}
          {(() => {
            const isTerminal = (p: Record<string, unknown>) => p.stage === 's_completed' || p.stage === 'e_lost';
            const activeProjects = projects.filter((p: Record<string, unknown>) => !isTerminal(p));
            const terminalProjects = projects.filter((p: Record<string, unknown>) => isTerminal(p));
            return (
              <>
                {activeProjects.length > 0 && (
                  <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
                    {activeProjects.map((p: Record<string, unknown>) => (
                      <ProjectCard
                        key={p.id as string}
                        project={p}
                        onClick={() => navigate(`/sales/projects/${p.id}`)}
                      />
                    ))}
                  </div>
                )}
                {terminalProjects.length > 0 && (
                  <div className="space-y-3">
                    {activeProjects.length > 0 && (
                      <div className="flex items-center gap-3 pt-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          完了・失注した案件
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
                      {terminalProjects.map((p: Record<string, unknown>) => (
                        <ProjectCard
                          key={p.id as string}
                          project={p}
                          terminal
                          onClick={() => navigate(`/sales/projects/${p.id}`)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
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
