import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, Target, BarChart3,
  AlertTriangle, Award, Plus,
} from "lucide-react";
import { OPPORTUNITY_STAGES } from "@/types";

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

export default function SalesReviewPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetForm, setTargetForm] = useState({ user_id: "", month: currentMonth, amount: 0, count: 0 });

  // ファネル分析
  const { data: funnelData } = useQuery({
    queryKey: ["sales-funnel", year, month],
    queryFn: async () => {
      const params: Record<string, number> = { year };
      if (month) params.month = month;
      return (await api.get("/sales-analytics/funnel", { params })).data;
    },
  });
  const funnel = funnelData?.data;

  // 失注理由分析
  const { data: lostData } = useQuery({
    queryKey: ["sales-lost-reasons", year],
    queryFn: async () => (await api.get("/sales-analytics/lost-reasons", { params: { year } })).data,
  });
  const lostAnalysis = lostData?.data;

  // 営業評価
  const { data: perfData } = useQuery({
    queryKey: ["sales-performance", year, month],
    queryFn: async () => {
      const params: Record<string, number> = { year };
      if (month) params.month = month;
      return (await api.get("/sales-analytics/performance", { params })).data;
    },
  });
  const performance: any[] = perfData?.data ?? [];

  // ユーザー一覧
  const { data: usersData } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await api.get("/auth/users")).data,
  });
  const users: any[] = usersData?.data ?? [];
  const staffUsers = users.filter((u: any) => u.role === "staff" || u.role === "system_admin");

  // 目標設定
  const targetMutation = useMutation({
    mutationFn: async (data: any) => (await api.post("/sales-analytics/targets", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-performance"] });
      setTargetDialogOpen(false);
    },
  });

  // ファネルのステージバー
  const stageCountMap = new Map<string, { count: number; total_amount: number }>();
  if (funnel?.stage_counts) {
    for (const s of funnel.stage_counts) {
      stageCountMap.set(s.stage as string, { count: s.count as number, total_amount: s.total_amount as number });
    }
  }
  const maxCount = Math.max(...Array.from(stageCountMap.values()).map(v => v.count), 1);

  return (
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">営業レビュー</h1>
          <p className="text-sm text-muted-foreground">ファネル分析・失注分析・営業評価</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={month ? String(month) : "all"} onValueChange={(v) => setMonth(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">通年</SelectItem>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}月</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="funnel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="funnel"><BarChart3 className="h-4 w-4 mr-1" />ファネル分析</TabsTrigger>
          <TabsTrigger value="lost"><AlertTriangle className="h-4 w-4 mr-1" />失注分析</TabsTrigger>
          <TabsTrigger value="performance"><Award className="h-4 w-4 mr-1" />営業評価</TabsTrigger>
        </TabsList>

        {/* ファネル分析タブ */}
        <TabsContent value="funnel" className="space-y-4">
          {/* KPI カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">ヨミ総数</p>
                    <p className="text-2xl font-bold">{funnel?.total_count ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">受注率</p>
                    <p className="text-2xl font-bold">{funnel?.win_rate ?? 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">失注率</p>
                    <p className="text-2xl font-bold">{funnel?.loss_rate ?? 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">平均滞留日数</p>
                    <p className="text-2xl font-bold">{funnel?.avg_dwell_days ?? 0}日</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ファネルバー */}
          <Card>
            <CardHeader><CardTitle className="text-base">ステージ別パイプライン</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {OPPORTUNITY_STAGES.map(stage => {
                const data = stageCountMap.get(stage.value);
                const count = data?.count ?? 0;
                const amount = data?.total_amount ?? 0;
                const width = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={stage.value} className="flex items-center gap-3">
                    <div className="w-32 text-sm">
                      <Badge variant="outline" style={{ borderColor: stage.color, color: stage.color }}>
                        {stage.label}
                      </Badge>
                    </div>
                    <div className="flex-1">
                      <div className="h-7 bg-muted rounded relative overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${Math.max(width, count > 0 ? 3 : 0)}%`, backgroundColor: stage.color }}
                        />
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                          {count}件 / <span className="font-number">{formatCurrency(amount)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 失注分析タブ */}
        <TabsContent value="lost" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">失注理由の内訳</CardTitle></CardHeader>
              <CardContent>
                {lostAnalysis?.total_lost === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">失注データがありません</p>
                ) : (
                  <div className="space-y-3">
                    {lostAnalysis?.reasons?.map((r: any, i: number) => {
                      const pct = lostAnalysis.total_lost > 0
                        ? Math.round((r.count / lostAnalysis.total_lost) * 100)
                        : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-40 text-sm truncate">{r.reason || "理由未設定"}</div>
                          <div className="flex-1">
                            <div className="h-6 bg-muted rounded relative overflow-hidden">
                              <div
                                className="h-full rounded bg-red-400 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                              <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                                {r.count}件 ({pct}%) / <span className="font-number">{formatCurrency(r.total_amount)}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">失注統計</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4 py-4">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-red-500">{lostAnalysis?.total_lost ?? 0}</p>
                    <p className="text-sm text-muted-foreground mt-1">{year}年の失注件数</p>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    失注理由を記録することで、営業戦略の改善ポイントが明確になります。<br />
                    ヨミを「失注」に変更する際に理由を選択できます。
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 営業評価タブ */}
        <TabsContent value="performance" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setTargetDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />目標設定
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">担当者別 営業評価</CardTitle></CardHeader>
            <CardContent>
              {performance.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  データがありません。目標を設定するか、ヨミを登録してください。
                </p>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>担当者</TableHead>
                      <TableHead className="text-right">目標金額</TableHead>
                      <TableHead className="text-right">受注金額</TableHead>
                      <TableHead className="text-right">達成率</TableHead>
                      <TableHead className="text-right">ヨミ数</TableHead>
                      <TableHead className="text-right">受注数</TableHead>
                      <TableHead className="text-right">受注率</TableHead>
                      <TableHead className="text-right">平均単価</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performance.map((p: any) => (
                      <TableRow key={p.user_id}>
                        <TableCell className="font-medium">{p.user_name}</TableCell>
                        <TableCell className="text-right font-number">{formatCurrency(p.target_amount)}</TableCell>
                        <TableCell className="text-right font-medium font-number">{formatCurrency(p.won_amount)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={p.achievement_rate >= 100 ? "default" : p.achievement_rate >= 70 ? "secondary" : "destructive"}>
                            {p.achievement_rate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{p.total_count}</TableCell>
                        <TableCell className="text-right">{p.won_count}</TableCell>
                        <TableCell className="text-right">{p.win_rate}%</TableCell>
                        <TableCell className="text-right font-number">{formatCurrency(p.avg_deal_size)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 目標設定ダイアログ */}
      <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>営業目標の設定</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>担当者</Label>
              <Select value={targetForm.user_id} onValueChange={(v) => setTargetForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  {staffUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>年度</Label>
                <Input type="number" value={year} readOnly />
              </div>
              <div>
                <Label>月</Label>
                <Select value={String(targetForm.month)} onValueChange={(v) => setTargetForm(f => ({ ...f, month: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}月</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>目標金額</Label>
              <CurrencyInput
                value={targetForm.amount}
                onChange={(v) => setTargetForm(f => ({ ...f, amount: v }))}
                placeholder="10000000"
              />
            </div>
            <div>
              <Label>目標件数（任意）</Label>
              <Input
                type="number"
                value={targetForm.count || ""}
                onChange={(e) => setTargetForm(f => ({ ...f, count: Number(e.target.value) }))}
                placeholder="5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTargetDialogOpen(false)}>キャンセル</Button>
            <Button
              onClick={() => targetMutation.mutate({
                user_id: targetForm.user_id,
                fiscal_year: year,
                fiscal_month: targetForm.month,
                target_amount: targetForm.amount,
                target_count: targetForm.count || null,
              })}
              disabled={!targetForm.user_id || !targetForm.amount}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
