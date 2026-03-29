import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { AnimatedCurrency } from "@/components/ui/animated-number";
import { PageTransition, StaggerList, StaggerItem, LiftCard } from "@/components/ui/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Line, ComposedChart, Cell,
} from 'recharts';
import {
  TrendingUp,
  FolderKanban,
  Receipt,
  ShoppingCart,
  Calendar,
  Building2,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Loader2,
  Package,
} from "lucide-react";

interface KPI {
  period_label: string;
  monthly_revenue: number;
  monthly_purchase: number;
  monthly_sga: number;
  gross_profit: number;
  monthly_gross_margin: number;
  operating_profit: number;
  operating_margin: number;
  active_projects: number;
  active_yomi: number;
}

interface Alert {
  id: string;
  gls_number?: string;
  name: string;
  alert_type: string;
  message: string;
}

interface Project {
  id: string;
  gls_number: string;
  name: string;
  customer_name?: string;
  stage: string;
}

interface MonthlyChart {
  month: string;
  revenue: number;
  purchase: number;
  sga: number;
  gross_profit: number;
  operating_profit: number;
}

interface PipelineStage {
  stage: string;
  count: number;
  total_amount: number;
}

const stageLabels: Record<string, string> = {
  neta: 'ネタ', d_hold: 'D 仮押さえ', c_proposal: 'C 見積提案',
  b_verbal: 'B 口頭決定', a_won: 'A 受注済',
};
const stageColors: Record<string, string> = {
  neta: '#94a3b8', d_hold: '#a78bfa', c_proposal: '#3b82f6',
  b_verbal: '#f59e0b', a_won: '#22c55e',
};

const formatYen = (value: number) => `\u00a5${(value / 10000).toLocaleString()}万`;

const alertTypeColor: Record<string, string> = {
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  application_form: "#ef4444",
  upcoming_event: "#f59e0b",
};

const alertTypeLabel: Record<string, string> = {
  application_form: "申込書未提出",
  upcoming_event: "イベント直前",
  warning: "警告",
  danger: "緊急",
  info: "情報",
};

const projectStageLabel: Record<string, string> = {
  neta: 'ネタ', d_hold: 'D 仮押さえ', c_proposal: 'C 見積提案',
  b_verbal: 'B 口頭決定', a_won: 'A 受注済', s_completed: 'S 完了', e_lost: 'E 失注',
};

const projectStageColor: Record<string, string> = {
  neta: '#94a3b8', d_hold: '#a78bfa', c_proposal: '#3b82f6',
  b_verbal: '#f59e0b', a_won: '#22c55e', s_completed: '#6b7280', e_lost: '#ef4444',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [kpiPeriod, setKpiPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const { data: kpi, isLoading: kpiLoading } = useQuery<KPI>({
    queryKey: ["dashboard-kpi", kpiPeriod],
    queryFn: async () => (await api.get("/dashboard/kpi", { params: { period: kpiPeriod } })).data.data,
  });

  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ["dashboard-alerts"],
    queryFn: async () => (await api.get("/dashboard/alerts")).data.data,
  });

  const { data: recentProjects } = useQuery<Project[]>({
    queryKey: ["dashboard-recent-projects"],
    queryFn: async () => (await api.get("/dashboard/recent-projects")).data.data,
  });

  // Auto-check completed projects on dashboard load
  useQuery({
    queryKey: ['check-completed'],
    queryFn: async () => (await api.get('/dashboard/check-completed')).data,
    staleTime: 60000, // only check once per minute
  });

  const { data: chartData } = useQuery<MonthlyChart[]>({
    queryKey: ['dashboard-chart'],
    queryFn: async () => (await api.get('/dashboard/monthly-chart')).data.data,
  });

  const { data: pipelineData } = useQuery<PipelineStage[]>({
    queryKey: ['dashboard-pipeline'],
    queryFn: async () => (await api.get('/dashboard/pipeline')).data.data,
  });

  const { data: weeklyData } = useQuery({
    queryKey: ['dashboard-weekly'],
    queryFn: async () => (await api.get('/dashboard/weekly-schedule')).data.data,
  });

  const typeColors: Record<string, string> = {
    event: 'bg-blue-500',
    recording: 'bg-purple-500',
    broadcast: 'bg-cyan-500',
  };
  const typeLabels: Record<string, string> = {
    event: '本番',
    recording: '収録',
    broadcast: '放送',
  };


  const quickLinks = [
    { label: "案件管理", to: "/projects", icon: FolderKanban },
    { label: "売上一覧", to: "/revenues", icon: Receipt },
    { label: "仕入一覧", to: "/purchases", icon: ShoppingCart },
    { label: "カレンダー", to: "/calendar", icon: Calendar },
    { label: "マスター管理", to: "/masters/customers", icon: Building2 },
    { label: "機材管理", to: "/equipment/", icon: Package, external: true },
  ];

  return (
    <PageTransition>
    <div className="space-y-4 p-3 lg:space-y-6 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg lg:text-2xl font-bold">ダッシュボード</h1>
        <div className="flex gap-1 rounded-lg border p-1">
          <button
            onClick={() => setKpiPeriod('monthly')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${kpiPeriod === 'monthly' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
          >
            今月
          </button>
          <button
            onClick={() => setKpiPeriod('yearly')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${kpiPeriod === 'yearly' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
          >
            年間
          </button>
        </div>
      </div>

      {/* P&L Infographic */}
      {kpiLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : kpi ? (
        <Card className="overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
            {kpi.period_label || (kpiPeriod === 'yearly' ? '年間' : '今月')} 損益サマリー
          </div>
          <CardContent className="p-0">
            {/* Mobile: Compact grid */}
            <div className="grid grid-cols-2 gap-px bg-border lg:hidden">
              <div className="bg-blue-600 text-white p-3 flex items-center gap-2">
                <DollarSign className="h-5 w-5 shrink-0 opacity-80" />
                <div className="min-w-0">
                  <p className="text-[10px] opacity-80">売上</p>
                  <AnimatedCurrency value={kpi.monthly_revenue} className="text-base font-bold font-number truncate" />
                </div>
              </div>
              <div className="bg-orange-500 text-white p-3 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 shrink-0 opacity-80" />
                <div className="min-w-0">
                  <p className="text-[10px] opacity-80">変動原価</p>
                  <AnimatedCurrency value={kpi.monthly_purchase} className="text-base font-bold font-number truncate" />
                </div>
              </div>
              <div className="bg-emerald-600 text-white p-3 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 shrink-0 opacity-80" />
                <div className="min-w-0">
                  <p className="text-[10px] opacity-80">粗利 <span className="font-semibold">{formatPercent(kpi.monthly_gross_margin)}</span></p>
                  <AnimatedCurrency value={kpi.gross_profit} className="text-base font-bold font-number truncate" />
                </div>
              </div>
              <div className="bg-red-500 text-white p-3 flex items-center gap-2">
                <Receipt className="h-5 w-5 shrink-0 opacity-80" />
                <div className="min-w-0">
                  <p className="text-[10px] opacity-80">販管費</p>
                  <AnimatedCurrency value={kpi.monthly_sga} className="text-base font-bold font-number truncate" />
                </div>
              </div>
              <div className={`col-span-2 p-3 flex items-center justify-center gap-3 ${
                kpi.operating_profit >= 0 ? 'bg-gradient-to-r from-green-700 to-emerald-800' : 'bg-gradient-to-r from-red-700 to-red-800'
              } text-white`}>
                <BarChart3 className="h-5 w-5 shrink-0 opacity-80" />
                <div className="flex items-baseline gap-2">
                  <p className="text-[10px] opacity-80">営業利益</p>
                  <AnimatedCurrency value={kpi.operating_profit} className="text-lg font-bold font-number" />
                  <p className="text-sm font-semibold opacity-90">{formatPercent(kpi.operating_margin)}</p>
                </div>
              </div>
            </div>
            {/* Desktop: Horizontal flow */}
            <div className="hidden lg:flex flex-row items-stretch">
              <div className="flex-1 bg-blue-600 text-white p-6 flex flex-col justify-center items-center relative animate-[fadeIn_0.5s_ease-out]">
                <DollarSign className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm font-medium opacity-80">売上</p>
                <AnimatedCurrency value={kpi.monthly_revenue} className="text-3xl font-bold font-number" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 bg-white rounded-full p-1 shadow">
                  <span className="text-gray-400 text-lg font-bold">-</span>
                </div>
              </div>
              <div className="flex-1 bg-orange-500 text-white p-6 flex flex-col justify-center items-center relative animate-[fadeIn_0.7s_ease-out]">
                <ShoppingCart className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm font-medium opacity-80">変動原価(仕入)</p>
                <AnimatedCurrency value={kpi.monthly_purchase} className="text-3xl font-bold font-number" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 bg-white rounded-full p-1 shadow">
                  <span className="text-gray-400 text-lg font-bold">=</span>
                </div>
              </div>
              <div className="flex-1 bg-emerald-600 text-white p-6 flex flex-col justify-center items-center relative animate-[fadeIn_0.9s_ease-out]">
                <TrendingUp className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm font-medium opacity-80">粗利</p>
                <AnimatedCurrency value={kpi.gross_profit} className="text-3xl font-bold font-number" />
                <p className="text-lg font-semibold opacity-90">{formatPercent(kpi.monthly_gross_margin)}</p>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 bg-white rounded-full p-1 shadow">
                  <span className="text-gray-400 text-lg font-bold">-</span>
                </div>
              </div>
              <div className="flex-1 bg-red-500 text-white p-6 flex flex-col justify-center items-center relative animate-[fadeIn_1.1s_ease-out]">
                <Receipt className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm font-medium opacity-80">販管費</p>
                <AnimatedCurrency value={kpi.monthly_sga} className="text-3xl font-bold font-number" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 bg-white rounded-full p-1 shadow">
                  <span className="text-gray-400 text-lg font-bold">=</span>
                </div>
              </div>
              <div className={`flex-1 p-6 flex flex-col justify-center items-center animate-[fadeIn_1.3s_ease-out] ${
                kpi.operating_profit >= 0 ? 'bg-gradient-to-br from-green-700 to-emerald-800' : 'bg-gradient-to-br from-red-700 to-red-800'
              } text-white`}>
                <BarChart3 className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm font-medium opacity-80">営業利益</p>
                <AnimatedCurrency value={kpi.operating_profit} className="text-3xl font-bold font-number" />
                <p className="text-lg font-semibold opacity-90">{formatPercent(kpi.operating_margin)}</p>
              </div>
            </div>
            {/* Sub KPIs */}
            <div className="grid grid-cols-4 border-t">
              <div className="p-2 lg:p-4 text-center border-r">
                <p className="text-[10px] lg:text-xs text-muted-foreground">進行中案件</p>
                <p className="text-lg lg:text-2xl font-bold text-primary">{kpi.active_projects}</p>
              </div>
              <div className="p-2 lg:p-4 text-center border-r">
                <p className="text-[10px] lg:text-xs text-muted-foreground">ヨミ</p>
                <p className="text-lg lg:text-2xl font-bold text-orange-600">{kpi.active_yomi}</p>
              </div>
              <div className="p-2 lg:p-4 text-center border-r">
                <p className="text-[10px] lg:text-xs text-muted-foreground">粗利率</p>
                <p className="text-lg lg:text-2xl font-bold text-emerald-600">{formatPercent(kpi.monthly_gross_margin)}</p>
              </div>
              <div className="p-2 lg:p-4 text-center">
                <p className="text-[10px] lg:text-xs text-muted-foreground">営業利益率</p>
                <p className={`text-lg lg:text-2xl font-bold ${kpi.operating_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatPercent(kpi.operating_margin)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Weekly Schedule */}
      {weeklyData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-primary" />
              今週のスケジュール
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mobile: Compact horizontal scroll */}
            <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden snap-x snap-mandatory">
              {(weeklyData as Array<{ date: string; dayLabel: string; events: Array<{ gls_number?: string; name?: string; project_name?: string; episode_code?: string; type: string }> }>).map((day) => {
                const isToday = day.date === new Date().toISOString().split('T')[0];
                return (
                  <div key={day.date} className={`min-w-[120px] snap-start shrink-0 rounded-lg border p-2 ${isToday ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-muted/30'}`}>
                    <div className={`text-center mb-1 ${isToday ? 'font-bold text-primary' : ''}`}>
                      <span className="text-xs text-muted-foreground">{day.dayLabel}</span>
                      <span className="text-xs ml-1">{day.date.split('-')[2]}日</span>
                    </div>
                    <div className="space-y-0.5">
                      {day.events.slice(0, 3).map((ev, i) => (
                        <div key={i} className={`rounded px-1 py-0.5 text-white text-[10px] leading-tight truncate ${typeColors[ev.type] || 'bg-gray-400'}`}>
                          {typeLabels[ev.type]}: {ev.gls_number || ev.episode_code}
                        </div>
                      ))}
                      {day.events.length > 3 && (
                        <div className="text-[10px] text-muted-foreground text-center">+{day.events.length - 3}件</div>
                      )}
                      {day.events.length === 0 && (
                        <div className="text-[10px] text-muted-foreground text-center mt-2">-</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop: 7-column grid */}
            <div className="hidden lg:grid grid-cols-7 gap-1">
              {(weeklyData as Array<{ date: string; dayLabel: string; events: Array<{ gls_number?: string; name?: string; project_name?: string; episode_code?: string; type: string }> }>).map((day) => {
                const isToday = day.date === new Date().toISOString().split('T')[0];
                return (
                  <div key={day.date} className={`min-h-[120px] rounded-lg border p-2 ${isToday ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-muted/30'}`}>
                    <div className={`text-center mb-2 ${isToday ? 'font-bold text-primary' : ''}`}>
                      <div className="text-xs text-muted-foreground">{day.dayLabel}</div>
                      <div className="text-sm">{day.date.split('-')[2]}</div>
                    </div>
                    <div className="space-y-1">
                      {day.events.slice(0, 4).map((ev, i) => (
                        <div key={i} className={`rounded px-1.5 py-0.5 text-white text-[10px] leading-tight truncate ${typeColors[ev.type] || 'bg-gray-400'}`} title={`${typeLabels[ev.type] || ev.type}: ${ev.name || ev.project_name || ev.episode_code}`}>
                          {typeLabels[ev.type]}: {ev.gls_number || ev.episode_code}
                        </div>
                      ))}
                      {day.events.length > 4 && (
                        <div className="text-[10px] text-muted-foreground text-center">+{day.events.length - 4}件</div>
                      )}
                      {day.events.length === 0 && (
                        <div className="text-[10px] text-muted-foreground text-center mt-4">予定なし</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2 lg:mt-3 justify-center">
              {Object.entries(typeLabels).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <div className={`w-2.5 h-2.5 rounded-sm ${typeColors[key]}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        {/* Monthly Revenue/Purchase/Profit Chart */}
        <Card>
          <CardHeader className="pb-2 lg:pb-6">
            <CardTitle className="text-base lg:text-lg">月次推移</CardTitle>
          </CardHeader>
          <CardContent className="px-2 lg:px-6">
            {chartData && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v: string) => `${parseInt(v.split('-')[1])}月`}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}M`}
                    tick={{ fontSize: 12 }}
                    width={45}
                  />
                  <Tooltip
                    formatter={(value) => [formatYen(Number(value)), '']}
                    labelFormatter={(label) => `${parseInt(String(label).split('-')[1])}月`}
                    wrapperStyle={{ zIndex: 10 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="purchase" fill="#f59e0b" name="仕入" />
                  <Bar dataKey="sga" fill="#ef4444" name="販管費" />
                  <Bar dataKey="revenue" fill="#005bac" name="売上" />
                  <Line type="monotone" dataKey="gross_profit" stroke="#22c55e" name="粗利" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="operating_profit" stroke="#7c3aed" name="営業利益" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">データがありません</p>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Chart */}
        <Card>
          <CardHeader className="pb-2 lg:pb-6">
            <CardTitle className="text-base lg:text-lg">ヨミパイプライン</CardTitle>
          </CardHeader>
          <CardContent className="px-2 lg:px-6">
            {pipelineData && pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={pipelineData.map((s) => ({
                    ...s,
                    label: stageLabels[s.stage] || s.stage,
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}M`} />
                  <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [formatYen(Number(value)), '金額']}
                  />
                  <Bar dataKey="total_amount" name="金額" label={{ position: 'right', fontSize: 11, formatter: (v: unknown) => {
                    const item = pipelineData.find((s) => s.total_amount === Number(v));
                    return item ? `${item.count}件` : '';
                  } }}>
                    {pipelineData.map((s, idx) => (
                      <Cell key={idx} fill={stageColors[s.stage] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">データがありません</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        {/* Alerts */}
        <Card>
          <CardHeader className="pb-2 lg:pb-6">
            <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
              <AlertTriangle className="h-4 w-4 lg:h-5 lg:w-5 text-yellow-500" />
              アラート
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!alerts || alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">アラートはありません</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((a, idx) => (
                  <div key={`${a.id}-${a.alert_type}-${idx}`} className="flex items-start gap-3 rounded-md border p-3">
                    <Badge color={alertTypeColor[a.alert_type] || "#6b7280"}>
                      {alertTypeLabel[a.alert_type] || a.alert_type}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card>
          <CardHeader className="pb-2 lg:pb-6">
            <CardTitle className="text-base lg:text-lg">最近の案件</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentProjects || recentProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">案件がありません</p>
            ) : (
              <div className="space-y-3">
                {recentProjects.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium">{p.gls_number} {p.name}</p>
                      {p.customer_name && (
                        <p className="text-xs text-muted-foreground">{p.customer_name}</p>
                      )}
                    </div>
                    <Badge style={{ backgroundColor: projectStageColor[p.stage], color: '#fff' }}>
                      {projectStageLabel[p.stage] || p.stage}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-2 lg:mb-4 text-base lg:text-lg font-semibold">クイックリンク</h2>
        <StaggerList className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
          {quickLinks.map((link) => (
            <StaggerItem key={link.to}>
              <LiftCard
                className="cursor-pointer rounded-lg border bg-card text-card-foreground shadow-sm"
                onClick={() => {
                  if ('external' in link && link.external) {
                    window.open(link.to, '_blank');
                  } else {
                    navigate(link.to);
                  }
                }}
              >
                <CardContent className="flex flex-col items-center gap-1 p-3 lg:gap-2 lg:p-6">
                  <link.icon className="h-6 w-6 lg:h-8 lg:w-8 text-primary" />
                  <p className="text-xs lg:text-sm font-medium">{link.label}</p>
                </CardContent>
              </LiftCard>
            </StaggerItem>
          ))}
        </StaggerList>
      </div>
    </div>
    </PageTransition>
  );
}
