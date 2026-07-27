import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { AnimatedCurrency, AnimatedNumber } from "@/components/ui/animated-number";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader, KpiCard } from "@gmo-onair/shared/src/client/dashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  AlertTriangle,
  Award,
  Plus,
  ArrowRight,
  BookOpen,
  Loader2,
} from "lucide-react";
import { OPPORTUNITY_STAGES, ProjectStageLabels } from "@/types";
import { StatValue } from "@gmo-onair/shared/src/client/ui";
import { EmptyState } from '@gmo-onair/shared/src/client/states';

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** `embedded` のときは見出しを出さない (ふりかえり `/review` に埋める用。見出しが二重になる) */
export default function SalesReviewPage({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetForm, setTargetForm] = useState({
    user_id: "",
    month: currentMonth,
    amount: 0,
    count: 0,
  });

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
    queryFn: async () =>
      (await api.get("/sales-analytics/lost-reasons", { params: { year } }))
        .data,
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
  const staffUsers = users.filter(
    (u: any) => u.role === "staff" || u.role === "system_admin"
  );

  // 目標設定
  const targetMutation = useMutation({
    mutationFn: async (data: any) =>
      (await api.post("/sales-analytics/targets", data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-performance"] });
      setTargetDialogOpen(false);
    },
  });

  // ファネルのステージバー
  const stageCountMap = new Map<
    string,
    { count: number; total_amount: number }
  >();
  if (funnel?.stage_counts) {
    for (const s of funnel.stage_counts) {
      stageCountMap.set(s.stage as string, {
        count: s.count as number,
        total_amount: s.total_amount as number,
      });
    }
  }
  const maxCount = Math.max(
    ...Array.from(stageCountMap.values()).map((v) => v.count),
    1
  );

  // 営業評価チーム合計
  const teamTotal = performance.reduce(
    (acc, p) => ({
      target_amount: acc.target_amount + (p.target_amount || 0),
      won_amount: acc.won_amount + (p.won_amount || 0),
      won_count: acc.won_count + (p.won_count || 0),
      total_count: acc.total_count + (p.total_count || 0),
    }),
    { target_amount: 0, won_amount: 0, won_count: 0, total_count: 0 }
  );
  const teamAchievementRate =
    teamTotal.target_amount > 0
      ? Math.round(
          (teamTotal.won_amount / teamTotal.target_amount) * 1000
        ) / 10
      : 0;
  const teamWinRate =
    teamTotal.total_count > 0
      ? Math.round((teamTotal.won_count / teamTotal.total_count) * 1000) /
        10
      : 0;

  return (
    <PageTransition>
    <div className={embedded ? "space-y-5" : "space-y-5 p-4 sm:space-y-6 sm:p-6"}>
      {!embedded && <DashboardHeader
        title="営業レビュー"
        description="ファネル分析・失注分析・営業評価を横断で確認します。"
        period={`${year}年${month ? ` ${month}月` : ' 通年'}`}
        controls={
          <div className="flex gap-2 items-center">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[96px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={month ? String(month) : "all"}
              onValueChange={(v) => setMonth(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className="w-[96px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">通年</SelectItem>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m}月</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />}

      <Tabs defaultValue="funnel" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="funnel">
            <BarChart3 className="h-4 w-4 mr-1" />
            ファネル
          </TabsTrigger>
          <TabsTrigger value="lost">
            <AlertTriangle className="h-4 w-4 mr-1" />
            失注分析
          </TabsTrigger>
          <TabsTrigger value="performance">
            <Award className="h-4 w-4 mr-1" />
            営業評価
          </TabsTrigger>
        </TabsList>

        {/* ========== ファネル分析タブ ========== */}
        <TabsContent value="funnel" className="space-y-4">
          {/* KPI カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="ヨミ総数"
              icon={<BarChart3 />}
              value={<AnimatedNumber value={funnel?.total_count ?? 0} />}
              unit="件"
            />
            <KpiCard
              label="受注率"
              icon={<TrendingUp />}
              value={<AnimatedNumber value={funnel?.win_rate ?? 0} suffix="%" />}
              emphasis="success"
            />
            <KpiCard
              label="失注率"
              icon={<TrendingDown />}
              value={<AnimatedNumber value={funnel?.loss_rate ?? 0} suffix="%" />}
              emphasis="negative"
            />
            <KpiCard
              label="平均滞留"
              icon={<Target />}
              value={<AnimatedNumber value={funnel?.avg_dwell_days ?? 0} suffix="日" />}
              emphasis="warning"
            />
          </div>

          {/* ファネルバー + コンバージョン率 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                ステージ別パイプライン
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {OPPORTUNITY_STAGES.map((stage) => {
                const data = stageCountMap.get(stage.value);
                const count = data?.count ?? 0;
                const amount = data?.total_amount ?? 0;
                const width =
                  maxCount > 0 ? (count / maxCount) * 100 : 0;

                // コンバージョン率（次ステージへの遷移率）
                const conversion = funnel?.conversions?.find(
                  (c: any) => c.from === stage.value
                );

                return (
                  <div key={stage.value}>
                    <div className="flex items-center gap-3">
                      <div className="w-28 shrink-0 text-sm">
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: stage.color,
                            color: stage.color,
                          }}
                        >
                          {stage.label}
                        </Badge>
                      </div>
                      <div className="flex-1">
                        <div className="h-7 bg-muted rounded relative overflow-hidden">
                          <div
                            className="h-full rounded transition-all"
                            style={{
                              width: `${Math.max(width, count > 0 ? 3 : 0)}%`,
                              backgroundColor: stage.color,
                            }}
                          />
                          <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                            {count}件 /{" "}
                            <span className="font-number ml-1">
                              {formatCurrency(amount)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                    {conversion && (
                      <div className="flex items-center gap-3 ml-28 pl-3 py-0.5">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">
                          →{" "}
                          {
                            ProjectStageLabels[
                              conversion.to as keyof typeof ProjectStageLabels
                            ]
                          }
                          への遷移率:{" "}
                          <span className="font-medium text-foreground font-number">
                            {conversion.rate}%
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* 月次受注推移 */}
          {funnel?.monthly_trend && funnel.monthly_trend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  月次受注推移（{year}年）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {MONTHS.map((m) => {
                    const d = funnel.monthly_trend.find(
                      (t: any) => parseInt(t.month) === m
                    );
                    const wonCount = d?.won_count ?? 0;
                    const lostCount = d?.lost_count ?? 0;
                    const wonAmount = d?.won_amount ?? 0;
                    const maxBar = Math.max(
                      ...funnel.monthly_trend.map(
                        (t: any) => (t.won_count || 0) + (t.lost_count || 0)
                      ),
                      1
                    );
                    const wonWidth =
                      maxBar > 0 ? (wonCount / maxBar) * 100 : 0;
                    const lostWidth =
                      maxBar > 0 ? (lostCount / maxBar) * 100 : 0;
                    const isPast = m <= currentMonth || year < currentYear;

                    return (
                      <div
                        key={m}
                        className="flex items-center gap-3"
                      >
                        <span
                          className={`w-8 text-right text-xs font-medium ${isPast ? "" : "text-muted-foreground"}`}
                        >
                          {m}月
                        </span>
                        <div className="flex-1 flex h-5 bg-muted rounded overflow-hidden">
                          {wonWidth > 0 && (
                            <div
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${wonWidth}%` }}
                            />
                          )}
                          {lostWidth > 0 && (
                            <div
                              className="h-full bg-red-400 transition-all"
                              style={{ width: `${lostWidth}%` }}
                            />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground w-28 text-right shrink-0">
                          <span className="text-green-600 font-medium">
                            {wonCount}
                          </span>
                          受注{" "}
                          <span className="text-red-500">{lostCount}</span>
                          失注
                        </span>
                        <span className="text-xs font-number w-24 text-right shrink-0 hidden sm:block">
                          {formatCurrency(wonAmount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-2 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
                    受注
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                    失注
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ========== 失注分析タブ ========== */}
        <TabsContent value="lost" className="space-y-4">
          {/* 失注KPIカード */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">失注件数</p>
                {/* 6章: 大きい数字の大きさは段から選ぶ */}
                <StatValue size="sm" className="block text-destructive">
                  <AnimatedNumber value={lostAnalysis?.total_lost ?? 0} suffix="件" />
                </StatValue>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">失注金額合計</p>
                <p className="text-xl font-bold text-red-500 font-number">
                  <AnimatedCurrency value={lostAnalysis?.total_lost_amount ?? 0} />
                </p>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">平均失注金額</p>
                <p className="text-xl font-bold font-number">
                  <AnimatedCurrency value={lostAnalysis?.avg_lost_amount ?? 0} />
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 失注理由の内訳 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  失注理由の内訳
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lostAnalysis?.total_lost === 0 ? (
                  <EmptyState title="この期間に失注した案件はありません" description="期間を広げると、過去の失注理由をまとめて見られます。" />
                ) : (
                  <div className="space-y-3">
                    {lostAnalysis?.reasons?.map((r: any, i: number) => {
                      const pct =
                        lostAnalysis.total_lost > 0
                          ? Math.round(
                              (r.count / lostAnalysis.total_lost) * 100
                            )
                          : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm truncate">
                              {r.reason || "理由未設定"}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">
                              {r.count}件 ({pct}%)
                            </span>
                          </div>
                          <div className="h-5 bg-muted rounded relative overflow-hidden">
                            <div
                              className="h-full rounded bg-red-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-end px-2 text-[11px] font-number">
                              {formatCurrency(r.total_amount)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 月別失注推移 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  月別失注推移（{year}年）
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!lostAnalysis?.monthly_trend ||
                lostAnalysis.monthly_trend.length === 0 ? (
                  <EmptyState title="この期間に売上が1件もありません" description="お金 > 売上 に明細を登録すると、月ごとの推移がここに出ます。" />
                ) : (
                  <div className="space-y-2">
                    {MONTHS.map((m) => {
                      const d = lostAnalysis.monthly_trend.find(
                        (t: any) => parseInt(t.month) === m
                      );
                      const count = d?.count ?? 0;
                      const amount = d?.total_amount ?? 0;
                      const maxBar = Math.max(
                        ...lostAnalysis.monthly_trend.map(
                          (t: any) => t.count || 0
                        ),
                        1
                      );
                      const width = maxBar > 0 ? (count / maxBar) * 100 : 0;

                      return (
                        <div key={m} className="flex items-center gap-3">
                          <span className="w-8 text-right text-xs font-medium">
                            {m}月
                          </span>
                          <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                            {width > 0 && (
                              <div
                                className="h-full bg-red-400 rounded transition-all"
                                style={{ width: `${width}%` }}
                              />
                            )}
                          </div>
                          <span className="text-xs w-12 text-right font-number">
                            {count}件
                          </span>
                          <span className="text-xs font-number w-24 text-right shrink-0 hidden sm:block">
                            {formatCurrency(amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 教訓・学び */}
          {lostAnalysis?.lessons && lostAnalysis.lessons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  教訓・学び
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {lostAnalysis.lessons.map((l: any) => (
                    <div
                      key={l.id}
                      className="rounded-lg border p-3 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {l.gls_number || l.code} {l.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {l.customer_short_name || l.customer_name} /{" "}
                            {formatDate(l.lost_at)} / {l.lost_reason}
                          </p>
                        </div>
                        <span className="text-xs font-number text-red-500 shrink-0">
                          {formatCurrency(l.expected_amount)}
                        </span>
                      </div>
                      <p className="text-sm bg-muted/50 rounded p-2">
                        {l.lessons_learned}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ========== 営業評価タブ ========== */}
        <TabsContent value="performance" className="space-y-4">
          <div className="flex justify-between items-center">
            {/* チーム合計KPI */}
            {performance.length > 0 && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">チーム合計:</span>
                <span className="font-number font-medium">
                  {formatCurrency(teamTotal.won_amount)} /{" "}
                  {formatCurrency(teamTotal.target_amount)}
                </span>
                <Badge
                  variant={
                    teamAchievementRate >= 100
                      ? "default"
                      : teamAchievementRate >= 70
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {teamAchievementRate}%
                </Badge>
              </div>
            )}
            <Button size="sm" onClick={() => setTargetDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              目標設定
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                担当者別 営業評価
              </CardTitle>
            </CardHeader>
            <CardContent>
              {performance.length === 0 ? (
                <EmptyState
                title="この期間に担当者ごとの実績がありません"
                  description="目標を設定するか、ヨミを登録してください。"
                />
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="space-y-3 lg:hidden">
                    {performance.map((p: any) => (
                      <div
                        key={p.user_id}
                        className="rounded-lg border p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{p.user_name}</span>
                          <Badge
                            variant={
                              p.achievement_rate >= 100
                                ? "default"
                                : p.achievement_rate >= 70
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            達成率 {p.achievement_rate}%
                          </Badge>
                        </div>
                        {/* 達成率プログレスバー */}
                        {p.target_amount > 0 && (
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                p.achievement_rate >= 100
                                  ? "bg-green-500"
                                  : p.achievement_rate >= 70
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              }`}
                              style={{
                                width: `${Math.min(p.achievement_rate, 100)}%`,
                              }}
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">
                              目標金額
                            </span>
                            <p className="font-number font-medium">
                              {formatCurrency(p.target_amount)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">
                              受注金額
                            </span>
                            <p className="font-number font-medium text-primary">
                              {formatCurrency(p.won_amount)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">
                              ヨミ数 / 受注数
                            </span>
                            <p>
                              {p.total_count}件 / {p.won_count}件
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">
                              受注率
                            </span>
                            <p>{p.win_rate}%</p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground">
                              平均単価
                            </span>
                            <p className="font-number">
                              {formatCurrency(p.avg_deal_size)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>担当者</TableHead>
                          <TableHead className="text-right">
                            目標金額
                          </TableHead>
                          <TableHead className="text-right">
                            受注金額
                          </TableHead>
                          <TableHead className="w-40">達成率</TableHead>
                          <TableHead className="text-right">
                            ヨミ数
                          </TableHead>
                          <TableHead className="text-right">
                            受注数
                          </TableHead>
                          <TableHead className="text-right">
                            受注率
                          </TableHead>
                          <TableHead className="text-right">
                            平均単価
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {performance.map((p: any) => (
                          <TableRow key={p.user_id}>
                            <TableCell className="font-medium">
                              {p.user_name}
                            </TableCell>
                            <TableCell className="text-right font-number">
                              {formatCurrency(p.target_amount)}
                            </TableCell>
                            <TableCell className="text-right font-medium font-number">
                              {formatCurrency(p.won_amount)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      p.achievement_rate >= 100
                                        ? "bg-green-500"
                                        : p.achievement_rate >= 70
                                          ? "bg-yellow-500"
                                          : "bg-red-500"
                                    }`}
                                    style={{
                                      width: `${Math.min(p.achievement_rate, 100)}%`,
                                    }}
                                  />
                                </div>
                                <Badge
                                  variant={
                                    p.achievement_rate >= 100
                                      ? "default"
                                      : p.achievement_rate >= 70
                                        ? "secondary"
                                        : "destructive"
                                  }
                                  className="w-16 justify-center"
                                >
                                  {p.achievement_rate}%
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {p.total_count}
                            </TableCell>
                            <TableCell className="text-right">
                              {p.won_count}
                            </TableCell>
                            <TableCell className="text-right">
                              {p.win_rate}%
                            </TableCell>
                            <TableCell className="text-right font-number">
                              {formatCurrency(p.avg_deal_size)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* チーム合計行 */}
                        <TableRow className="font-medium border-t-2">
                          <TableCell>チーム合計</TableCell>
                          <TableCell className="text-right font-number">
                            {formatCurrency(teamTotal.target_amount)}
                          </TableCell>
                          <TableCell className="text-right font-number">
                            {formatCurrency(teamTotal.won_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                teamAchievementRate >= 100
                                  ? "default"
                                  : teamAchievementRate >= 70
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {teamAchievementRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {teamTotal.total_count}
                          </TableCell>
                          <TableCell className="text-right">
                            {teamTotal.won_count}
                          </TableCell>
                          <TableCell className="text-right">
                            {teamWinRate}%
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 目標設定ダイアログ */}
      <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>営業目標の設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>担当者</Label>
              <Select
                value={targetForm.user_id}
                onValueChange={(v) =>
                  setTargetForm((f) => ({ ...f, user_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="選択..." />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
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
                <Select
                  value={String(targetForm.month)}
                  onValueChange={(v) =>
                    setTargetForm((f) => ({ ...f, month: Number(v) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m}月
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>目標金額</Label>
              <CurrencyInput
                value={targetForm.amount}
                onChange={(v) => setTargetForm((f) => ({ ...f, amount: v }))}
                placeholder="10000000"
              />
            </div>
            <div>
              <Label>目標件数（任意）</Label>
              <Input
                type="number"
                value={targetForm.count || ""}
                onChange={(e) =>
                  setTargetForm((f) => ({
                    ...f,
                    count: Number(e.target.value),
                  }))
                }
                placeholder="5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTargetDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={() =>
                targetMutation.mutate({
                  user_id: targetForm.user_id,
                  fiscal_year: year,
                  fiscal_month: targetForm.month,
                  target_amount: targetForm.amount,
                  target_count: targetForm.count || null,
                })
              }
              disabled={!targetForm.user_id || !targetForm.amount}
            >
              {targetMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
