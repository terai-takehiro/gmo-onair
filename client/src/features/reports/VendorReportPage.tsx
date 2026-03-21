import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";

interface VendorSummaryItem {
  vendor_id: string;
  vendor_name: string;
  vendor_type: string;
  purchase_count: number;
  total_amount: number;
  percentage: number;
}

interface VendorSummaryResponse {
  items: VendorSummaryItem[];
  grand_total: number;
}

function getDefaultPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`,
  };
}

export default function VendorReportPage() {
  const defaults = getDefaultPeriod();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const { data, isLoading } = useQuery<VendorSummaryResponse>({
    queryKey: ["vendor-report", from, to],
    queryFn: async () => {
      const res = await api.get("/reports/vendor-summary", {
        params: { from, to },
      });
      return res.data.data;
    },
  });

  const handleExport = async () => {
    const res = await api.get("/reports/vendor-summary", {
      params: { from, to, format: "csv" },
      responseType: "blob",
    });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-report-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const items = data?.items || [];
  const grandTotal = data?.grand_total || 0;
  const totalCount = items.reduce((s, r) => s + r.purchase_count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">仕入先別集計レポート</h1>
        <Button onClick={handleExport} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          CSV出力
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">期間指定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="from">開始日</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <span className="pb-2 text-muted-foreground">~</span>
            <div className="space-y-1">
              <Label htmlFor="to">終了日</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-44"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>仕入先名</TableHead>
                  <TableHead>種別</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">合計額</TableHead>
                  <TableHead className="text-right">構成比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {items.map((item) => (
                      <TableRow key={item.vendor_id}>
                        <TableCell className="font-medium">{item.vendor_name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.vendor_type || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.purchase_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(item.total_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.percentage.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>合計</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums">{totalCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(grandTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">100.0%</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
