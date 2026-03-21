import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Loader2 } from "lucide-react";

export default function RevenueListPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["revenues-all", page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      return (await api.get("/revenues", { params })).data;
    },
  });

  const revenues = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">売上一覧</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="GLS番号・案件名・顧客名で検索..."
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
                <TableHead>請求KEY</TableHead>
                <TableHead>GLS番号</TableHead>
                <TableHead>案件名</TableHead>
                <TableHead>顧客</TableHead>
                <TableHead>税区分</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>計上日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                revenues.map((r: Record<string, unknown>) => (
                  <TableRow key={r.id as string}>
                    <TableCell className="font-mono text-xs">{(r.billing_key as string) || "-"}</TableCell>
                    <TableCell className="text-primary">{(r.gls_number as string) || "-"}</TableCell>
                    <TableCell>{(r.project_name as string) || "-"}</TableCell>
                    <TableCell>{(r.customer_name as string) || "-"}</TableCell>
                    <TableCell>{r.tax_type as string}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(r.amount as number)}</TableCell>
                    <TableCell>{formatDate(r.recording_date as string)}</TableCell>
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
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>前へ</Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
