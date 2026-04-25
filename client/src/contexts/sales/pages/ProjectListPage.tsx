import { useState, useRef, useCallback } from "react";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Loader2, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

type SortKey = 'code' | 'name' | 'customer' | 'stage' | 'project_type' | 'expected_amount' | 'event_start' | 'assigned_to';
type SortDir = 'asc' | 'desc';

type TabFilter = 'all' | 'yomi' | 'active' | 'completed' | 'lost';

const tabs: { value: TabFilter; label: string }[] = [
  { value: 'all', label: '全て' },
  { value: 'yomi', label: 'ヨミ' },
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '完了' },
  { value: 'lost', label: '失注' },
];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-0.5 opacity-40" />;
  return sortDir === 'asc'
    ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
    : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
}

export default function ProjectListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  const startResize = useCallback((col: string, e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: currentWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.max(60, resizeRef.current.startW + ev.clientX - resizeRef.current.startX);
      setColWidths((prev) => ({ ...prev, [resizeRef.current!.col]: newW }));
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", page, search, tab, sortKey, sortDir],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (tab !== 'all') params.tab = tab;
      if (sortKey) { params.sort_by = sortKey; params.sort_dir = sortDir; }
      return (await api.get("/projects", { params })).data;
    },
  });

  const projects = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <PageTransition>
    <div className="space-y-4 p-3 lg:p-6">
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="案件名・コード・顧客名で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {projects.length === 0 ? (
            <EmptyState title="該当する案件がありません" description="検索条件を変えるか、新しい案件を作成してください。" />
          ) : (
            <>
              {/* Mobile: Card layout */}
              <div className="space-y-2 lg:hidden">
                {projects.map((p: Record<string, unknown>) => (
                  <div
                    key={p.id as string}
                    className="cursor-pointer rounded-lg border p-3 transition-colors hover:bg-muted/50 active:bg-muted"
                    onClick={() => navigate(`/sales/projects/${p.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-tight">
                      {p.name as string}
                      {(p.event_end as string) && <span className="text-xs text-muted-foreground ml-1">({formatShortDate(p.event_end as string)})</span>}
                    </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {(p.gls_number as string) || (p.code as string)} / {(p.customer_name as string) || "-"}
                        </p>
                      </div>
                      <Badge className="shrink-0" style={{ backgroundColor: ProjectStageColors[p.stage as ProjectStage], color: '#fff' }}>
                        {ProjectStageLabels[p.stage as ProjectStage] || (p.stage as string)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {Number(p.total_revenue) > 0
                        ? <span className="font-number text-sm font-medium text-foreground">{formatCurrency(p.total_revenue as number)}</span>
                        : Number(p.expected_amount) > 0
                          ? <span className="text-sm font-medium text-foreground"><span className="text-xs text-muted-foreground mr-0.5">(想定)</span><span className="font-number">{formatCurrency(p.expected_amount as number)}</span></span>
                          : null
                      }
                      {(Number(p.total_revenue) > 0 || Number(p.total_purchase) > 0) && (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span title="売上">売{formatCurrency(p.total_revenue as number)}</span>
                          <span title="仕入">仕{formatCurrency(p.total_purchase as number)}</span>
                          <span className={`font-medium ${Number(p.total_revenue) - Number(p.total_purchase) >= 0 ? "text-green-600" : "text-red-600"}`} title="粗利">
                            粗{formatCurrency(Number(p.total_revenue) - Number(p.total_purchase))}
                          </span>
                        </span>
                      )}
                      <span>{ProjectTypeLabels[p.project_type as keyof typeof ProjectTypeLabels] || (p.project_type as string) || "-"}</span>
                      {(p.event_start as string) && (
                        <span>
                          {p.event_end && p.event_end !== p.event_start
                            ? `${formatDate(p.event_start as string)} 〜 ${formatDate(p.event_end as string)}`
                            : formatDate(p.event_start as string)}
                        </span>
                      )}
                      {(p.assigned_to_name as string) && <span>{p.assigned_to_name as string}</span>}
                    </div>
                    {((p.box_url_internal as string) || (p.box_url_external as string)) && (
                      <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {(p.box_url_internal as string) && (
                          <a href={p.box_url_internal as string} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ExternalLink className="h-3 w-3" />社内Box
                          </a>
                        )}
                        {(p.box_url_external as string) && (
                          <a href={p.box_url_external as string} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ExternalLink className="h-3 w-3" />外部共有Box
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden lg:block overflow-x-auto">
                <Table className={Object.keys(colWidths).length > 0 ? "table-fixed" : ""}>
                  <TableHeader>
                    <TableRow>
                      {([
                        { key: 'code' as SortKey, label: 'コード', defaultW: 110 },
                        { key: 'name' as SortKey, label: '案件名', defaultW: 200 },
                        { key: 'customer' as SortKey, label: '顧客', defaultW: 120 },
                        { key: 'stage' as SortKey, label: 'ステージ', defaultW: 100 },
                        { key: 'project_type' as SortKey, label: '案件種類', defaultW: 100 },
                        { key: 'expected_amount' as SortKey, label: '金額（税別）', align: 'right', defaultW: 120 },
                        { key: 'event_start' as SortKey, label: 'イベント日', defaultW: 130 },
                        { key: 'assigned_to' as SortKey, label: '担当者', defaultW: 80 },
                      ] as { key: SortKey; label: string; align?: string; defaultW: number }[]).map(({ key, label, align, defaultW }) => {
                        const w = colWidths[key] ?? (Object.keys(colWidths).length > 0 ? defaultW : undefined);
                        return (
                          <TableHead
                            key={key}
                            style={w ? { width: w, minWidth: 60 } : undefined}
                            className={`select-none whitespace-nowrap relative${align === 'right' ? ' text-right' : ''}`}
                            onClick={() => handleSort(key)}
                          >
                            <span className="cursor-pointer hover:text-foreground">
                              {label}
                              <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                            </span>
                            <span
                              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-primary/40 select-none"
                              onMouseDown={(e) => startResize(key, e, colWidths[key] ?? defaultW)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableHead>
                        );
                      })}
                      {(['total_revenue', 'total_purchase', 'gross_profit'] as const).map((col, i) => {
                        const labels = ['売上', '仕入', '粗利'];
                        const defaultW = 90;
                        const w = colWidths[col] ?? (Object.keys(colWidths).length > 0 ? defaultW : undefined);
                        return (
                          <TableHead key={col} style={w ? { width: w, minWidth: 60 } : undefined} className="text-right whitespace-nowrap relative">
                            {labels[i]}
                            <span
                              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-primary/40 select-none"
                              onMouseDown={(e) => startResize(col, e, colWidths[col] ?? defaultW)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableHead>
                        );
                      })}
                      <TableHead style={colWidths['box'] ? { width: colWidths['box'] } : undefined} className="relative">
                        Box
                        <span
                          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-primary/40 select-none"
                          onMouseDown={(e) => startResize('box', e, colWidths['box'] ?? 80)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((p: Record<string, unknown>) => (
                      <TableRow
                        key={p.id as string}
                        className="cursor-pointer"
                        onClick={() => navigate(`/sales/projects/${p.id}`)}
                      >
                        <TableCell className="font-mono text-xs">
                          {(p.gls_number as string) || (p.code as string) || "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {p.name as string}
                          {(p.event_end as string) && <span className="text-xs text-muted-foreground ml-1">({formatShortDate(p.event_end as string)})</span>}
                        </TableCell>
                        <TableCell>{(p.customer_name as string) || "-"}</TableCell>
                        <TableCell>
                          <Badge style={{ backgroundColor: ProjectStageColors[p.stage as ProjectStage], color: '#fff' }}>
                            {ProjectStageLabels[p.stage as ProjectStage] || (p.stage as string)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ProjectTypeLabels[p.project_type as keyof typeof ProjectTypeLabels] || (p.project_type as string) || "-"}
                        </TableCell>
                        <TableCell className="text-right font-number">
                          {Number(p.total_revenue) > 0
                            ? formatCurrency(p.total_revenue as number)
                            : Number(p.expected_amount) > 0
                              ? <><span className="text-xs text-muted-foreground mr-0.5">(想定)</span>{formatCurrency(p.expected_amount as number)}</>
                              : "-"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {p.event_start
                            ? p.event_end && p.event_end !== p.event_start
                              ? `${formatDate(p.event_start as string)} 〜 ${formatDate(p.event_end as string)}`
                              : formatDate(p.event_start as string)
                            : "-"}
                        </TableCell>
                        <TableCell>{(p.assigned_to_name as string) || "-"}</TableCell>
                        <TableCell className="text-right font-number text-xs">
                          {Number(p.total_revenue) > 0 ? formatCurrency(p.total_revenue as number) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-number text-xs">
                          {Number(p.total_purchase) > 0 ? formatCurrency(p.total_purchase as number) : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-number text-xs font-medium ${
                          Number(p.total_revenue) > 0 || Number(p.total_purchase) > 0
                            ? Number(p.total_revenue) - Number(p.total_purchase) >= 0 ? "text-green-600" : "text-red-600"
                            : ""
                        }`}>
                          {(Number(p.total_revenue) > 0 || Number(p.total_purchase) > 0)
                            ? formatCurrency(Number(p.total_revenue) - Number(p.total_purchase))
                            : "-"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            {(p.box_url_internal as string) && (
                              <a href={p.box_url_internal as string} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                title="社内限Box">
                                <ExternalLink className="h-3 w-3" />社内
                              </a>
                            )}
                            {(p.box_url_external as string) && (
                              <a href={p.box_url_external as string} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                title="外部共有Box">
                                <ExternalLink className="h-3 w-3" />外部
                              </a>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                全{pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}件
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
    </PageTransition>
  );
}
