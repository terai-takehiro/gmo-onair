import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Loader2 } from "lucide-react";

const projectTypeLabel: Record<string, string> = {
  offline_event: "オフライン",
  hybrid_event: "ハイブリット",
  live_broadcast: "生放送",
  recording: "収録",
  gmo_project: "GMO案件",
  other: "その他",
};

const stageOptions = [
  { value: "", label: "全て" },
  { value: "neta", label: "ネタ" },
  { value: "d_hold", label: "D:保留" },
  { value: "c_proposal", label: "C:提案中" },
  { value: "b_verbal", label: "B:内示" },
  { value: "a_won", label: "A:受注" },
  { value: "s_completed", label: "S:完了" },
  { value: "e_lost", label: "E:失注" },
];

const stageLabel: Record<string, string> = {
  neta: "ネタ",
  d_hold: "D:保留",
  c_proposal: "C:提案中",
  b_verbal: "B:内示",
  a_won: "A:受注",
  s_completed: "S:完了",
  e_lost: "E:失注",
};

const stageColor: Record<string, string> = {
  neta: "#6b7280",
  d_hold: "#9ca3af",
  c_proposal: "#3b82f6",
  b_verbal: "#f59e0b",
  a_won: "#22c55e",
  s_completed: "#059669",
  e_lost: "#ef4444",
};

export default function OpportunityListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["opportunities", page, search, stage],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (stage) params.stage = stage;
      return (await api.get("/opportunities", { params })).data;
    },
  });

  const opportunities = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ヨミ管理</h1>
        <Button onClick={() => navigate("/opportunities/new")}>
          <Plus className="mr-2 h-4 w-4" />
          新規作成
        </Button>
      </div>

      {/* Stage filter tabs */}
      <Tabs value={stage} onValueChange={(v) => { setStage(v); setPage(1); }}>
        <TabsList>
          {stageOptions.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="案件名・顧客名で検索..."
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ヨミコード</TableHead>
                <TableHead>案件名</TableHead>
                <TableHead>顧客</TableHead>
                <TableHead>ステージ</TableHead>
                <TableHead>案件種類</TableHead>
                <TableHead className="text-right">想定金額</TableHead>
                <TableHead>想定日</TableHead>
                <TableHead>担当者</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                opportunities.map((opp: Record<string, unknown>) => (
                  <TableRow
                    key={opp.id as string}
                    className="cursor-pointer"
                    onClick={() => navigate(`/opportunities/${opp.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {opp.project_id ? (
                        <button
                          className="font-mono text-sm font-medium text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); navigate(`/projects/${opp.project_id}/episodes`); }}
                        >
                          {(opp.gls_number as string) || (opp.opp_code as string) || "-"}
                        </button>
                      ) : (
                        (opp.opp_code as string) || "-"
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{opp.title as string}</TableCell>
                    <TableCell>{(opp.customer_name as string) || "-"}</TableCell>
                    <TableCell>
                      <Badge color={stageColor[opp.stage as string]}>
                        {stageLabel[opp.stage as string] || (opp.stage as string)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{projectTypeLabel[opp.project_type as string] || (opp.project_type as string) || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(opp.expected_amount as number)}</TableCell>
                    <TableCell>{formatDate(opp.expected_date as string)}</TableCell>
                    <TableCell>{(opp.assigned_to_name as string) || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
  );
}
