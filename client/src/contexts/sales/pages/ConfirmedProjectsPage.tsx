import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import {
  ProjectStageLabels,
  ProjectStageColors,
  ProjectTypeLabels,
  type ProjectStage,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Loader2, Film, Briefcase, Building2, User, Calendar, Tag,
} from "lucide-react";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";

type StageFilter = "all" | "active" | "completed";

const stageTabs: { value: StageFilter; label: string }[] = [
  { value: "all", label: "全て" },
  { value: "active", label: "進行中" },
  { value: "completed", label: "完了" },
];

/** category は旧パス (/sales/projects/confirmed/:category) と新クエリ (?filter=) の両方から来る */
export default function ConfirmedProjectsPage({ category: categoryProp }: { category?: string } = {}) {
  const params = useParams<{ category: string }>();
  const category = categoryProp ?? params.category;
  const glsCategory = category === "business" ? "B" : "A";
  const isStudio = glsCategory === "A";

  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["confirmed-projects", glsCategory, page, search, stageFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page,
        limit: 20,
        gls_category: glsCategory,
      };
      if (search) params.search = search;
      if (stageFilter === "active") params.tab = "active";
      else if (stageFilter === "completed") params.tab = "completed";
      return (await api.get("/projects", { params })).data;
    },
  });

  const projects = data?.data ?? [];
  const pagination = data?.pagination;

  const title = isStudio ? "確定案件（スタジオ）" : "確定案件（ビジネス）";
  const subtitle = isStudio
    ? "GLS-A：制作・配信案件"
    : "GLS-B：コンサルティング・その他売上案件";

  return (
    <PageTransition>
    <div className="space-y-4 p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            isStudio ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"
          }`}
        >
          {isStudio ? <Film className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold">{title}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={stageFilter}
          onValueChange={(v) => { setStageFilter(v as StageFilter); setPage(1); }}
        >
          <TabsList>
            {stageTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="案件名・GLS番号・顧客名..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="該当する確定案件がありません"
          description="検索条件を変えるか、案件管理から GLS 発番してください。"
        />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
            {projects.map((p: Record<string, unknown>) => (
              <ConfirmedProjectCard
                key={p.id as string}
                project={p}
                isStudio={isStudio}
                onClick={() => navigate(`/sales/projects/${p.id}/episodes`)}
              />
            ))}
          </div>

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
 * 確定案件カード — v2.7.16+ で導入したモダンカードデザイン (Pattern A)。
 */
function ConfirmedProjectCard({
  project: p,
  isStudio,
  onClick,
}: {
  project: Record<string, unknown>;
  isStudio: boolean;
  onClick: () => void;
}) {
  const totalRevenue = Number(p.total_revenue) || 0;
  const expectedAmount = Number(p.expected_amount) || 0;
  const stage = p.stage as ProjectStage;
  const stageLabel = ProjectStageLabels[stage] || (p.stage as string);
  const stageColor = ProjectStageColors[stage];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="group cursor-pointer rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Top row: GLS + stage + amount */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <span className=" text-xs font-semibold text-primary">
            {(p.gls_number as string) || "—"}
          </span>
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
      </h3>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 min-w-0">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {(p.customer_short_name as string) || (p.customer_name as string) || "-"}
          </span>
        </span>
        {(p.assigned_to_name as string) && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            {p.assigned_to_name as string}
          </span>
        )}
        {isStudio && (p.event_start as string) && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Calendar className="h-3 w-3 shrink-0" />
            {formatDate(p.event_start as string)}
          </span>
        )}
        {(p.project_type as string) && (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3 shrink-0" />
            {ProjectTypeLabels[p.project_type as keyof typeof ProjectTypeLabels] || (p.project_type as string)}
          </span>
        )}
      </div>
    </div>
  );
}
