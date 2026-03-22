import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2 } from "lucide-react";

const statusOptions = [
  { value: "", label: "全て" },
  { value: "tentative", label: "仮" },
  { value: "confirmed", label: "確定" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "中止" },
];

const statusLabel: Record<string, string> = {
  tentative: "仮",
  confirmed: "確定",
  completed: "完了",
  cancelled: "中止",
};

const statusColor: Record<string, string> = {
  tentative: "#f59e0b",
  confirmed: "#005bac",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

export default function ProjectListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", page, search, status],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (status) params.status = status;
      return (await api.get("/projects", { params })).data;
    },
  });

  const projects = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">案件管理</h1>

      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <TabsList>
          {statusOptions.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="イベントコード・案件名で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>イベントコード</TableHead>
                <TableHead>案件名</TableHead>
                <TableHead>顧客</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>本番日</TableHead>
                <TableHead>リハ日</TableHead>
                <TableHead>話数</TableHead>
                <TableHead>グループ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p: Record<string, unknown>) => (
                  <TableRow
                    key={p.id as string}
                    className="cursor-pointer"
                    onClick={() => navigate(`/projects/${p.id}/episodes`)}
                  >
                    <TableCell>
                      <button
                        className="font-mono text-sm font-medium text-primary hover:underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/projects/${p.id}/episodes`); }}
                      >
                        {p.gls_number as string}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">{p.name as string}</TableCell>
                    <TableCell>{(p.customer_name as string) || "-"}</TableCell>
                    <TableCell>
                      <Badge color={statusColor[p.status as string]}>
                        {statusLabel[p.status as string] || (p.status as string)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(p.event_start as string)}</TableCell>
                    <TableCell>{formatDate(p.rehearsal_start as string)}</TableCell>
                    <TableCell>{(p.episode_count as number) ?? "-"}</TableCell>
                    <TableCell className="text-xs">{(p.group_name as string) || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
  );
}
