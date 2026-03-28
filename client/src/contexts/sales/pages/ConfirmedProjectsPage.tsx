import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ProjectStageLabels,
  ProjectStageColors,
  ProjectTypeLabels,
  type ProjectStage,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, Film, Briefcase } from "lucide-react";

type StageFilter = "all" | "active" | "completed";

const stageTabs: { value: StageFilter; label: string }[] = [
  { value: "all", label: "全て" },
  { value: "active", label: "進行中" },
  { value: "completed", label: "完了" },
];

export default function ConfirmedProjectsPage() {
  const { category } = useParams<{ category: string }>();
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
    <div className="space-y-4 p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            isStudio
              ? "bg-blue-100 text-blue-600"
              : "bg-emerald-100 text-emerald-600"
          }`}
        >
          {isStudio ? (
            <Film className="h-5 w-5" />
          ) : (
            <Briefcase className="h-5 w-5" />
          )}
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
          onValueChange={(v) => {
            setStageFilter(v as StageFilter);
            setPage(1);
          }}
        >
          <TabsList>
            {stageTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="案件名・GLS番号・顧客名..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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
        <p className="py-12 text-center text-muted-foreground">
          データがありません
        </p>
      ) : (
        <>
          {/* Mobile: Card layout */}
          <div className="space-y-2 lg:hidden">
            {projects.map((p: Record<string, unknown>) => (
              <div
                key={p.id as string}
                className="cursor-pointer rounded-lg border p-3 transition-colors hover:bg-muted/50 active:bg-muted"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">
                      {p.name as string}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {p.gls_number as string}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(p.customer_short_name as string) ||
                          (p.customer_name as string) ||
                          "-"}
                      </span>
                    </div>
                  </div>
                  <Badge
                    className="shrink-0"
                    style={{
                      backgroundColor:
                        ProjectStageColors[p.stage as ProjectStage],
                      color: "#fff",
                    }}
                  >
                    {ProjectStageLabels[p.stage as ProjectStage] ||
                      (p.stage as string)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-number text-sm font-medium text-foreground">
                    {formatCurrency(p.expected_amount as number)}
                  </span>
                  <span>
                    {ProjectTypeLabels[
                      p.project_type as keyof typeof ProjectTypeLabels
                    ] ||
                      (p.project_type as string) ||
                      "-"}
                  </span>
                  {(p.event_start as string) && (
                    <span>{formatDate(p.event_start as string)}</span>
                  )}
                  {(p.assigned_to_name as string) && (
                    <span>{p.assigned_to_name as string}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">GLS番号</TableHead>
                  <TableHead>案件名</TableHead>
                  <TableHead>顧客</TableHead>
                  <TableHead>ステージ</TableHead>
                  <TableHead>案件種類</TableHead>
                  <TableHead className="text-right">想定金額</TableHead>
                  {isStudio && <TableHead>イベント日</TableHead>}
                  <TableHead>担当者</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p: Record<string, unknown>) => (
                  <TableRow
                    key={p.id as string}
                    className="cursor-pointer"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {p.gls_number as string}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.name as string}
                    </TableCell>
                    <TableCell>
                      {(p.customer_short_name as string) ||
                        (p.customer_name as string) ||
                        "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        style={{
                          backgroundColor:
                            ProjectStageColors[p.stage as ProjectStage],
                          color: "#fff",
                        }}
                      >
                        {ProjectStageLabels[p.stage as ProjectStage] ||
                          (p.stage as string)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {ProjectTypeLabels[
                        p.project_type as keyof typeof ProjectTypeLabels
                      ] ||
                        (p.project_type as string) ||
                        "-"}
                    </TableCell>
                    <TableCell className="text-right font-number">
                      {formatCurrency(p.expected_amount as number)}
                    </TableCell>
                    {isStudio && (
                      <TableCell>
                        {formatDate(p.event_start as string)}
                      </TableCell>
                    )}
                    <TableCell>
                      {(p.assigned_to_name as string) || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                全{pagination.total}件中{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}
                件
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  前へ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
