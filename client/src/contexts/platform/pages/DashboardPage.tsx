import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { PROJECT_STAGE, ALERT_TYPE, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import { PageTransition } from "@/components/ui/motion";
import { Badge } from "@/components/ui/badge";
import {
  DashboardHeader,
  KpiCard,
  SectionCard,
  EmptyState,
  chartColors,
  chartDefaults,
} from "@gmo-onair/shared/src/client/dashboard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Line, ComposedChart, Cell,
} from 'recharts';
import {
  TrendingUp,
  Receipt,
  ShoppingCart,
  Calendar,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Loader2,
  ClipboardList,
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

/* パイプラインステージを DADS categorical で分類 */
const pipelineStageColors: Record<string, string> = {
  neta: chartColors.neutral,
  d_hold: chartColors.categorical[6],    /* purple */
  c_proposal: chartColors.brand,
  b_verbal: chartColors.warning,
  a_won: chartColors.positive,
};

const formatYen = (value: number) => `¥${(value / 10000).toLocaleString()}万`;
const formatYenShort = (value: number) => `¥${(value / 10000).toFixed(0)}万`;

/* 週次スケジュールのイベントタイプ — ニュートラル+brand軸で分類 */
const typeColors: Record<string, string> = {
  event: 'bg-primary',
  recording: 'bg-info',
  broadcast: 'bg-cyan-700',
};
const typeLabels: Record<string, string> = {
  event: '本番',
  recording: '収録',
  broadcast: '放送',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [kpiPeriod, setKpiPeriod] = useState<'monthly' | 'yearly'>('monthly');
  // 任意の月を選択 (YYYY-MM)。指定時は今月/年間トグルより優先
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const { data: kpi, isLoading: kpiLoading } = useQuery<KPI>({
    queryKey: [...queryKeys.dashboard.kpi(kpiPeriod), selectedMonth],
    queryFn: async () => {
      const params: Record<string, string> = selectedMonth
        ? { month: selectedMonth }
        : { period: kpiPeriod };
      return (await api.get("/dashboard/kpi", { params })).data.data;
    },
  });

  const { data: alerts } = useQuery<Alert[]>({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: async () => (await api.get("/dashboard/alerts")).data.data,
  });

  const { data: recentProjects } = useQuery<Project[]>({
    queryKey: queryKeys.dashboard.recentProjects(),
    queryFn: async () => (await api.get("/dashboard/recent-projects")).data.data,
  });

  useQuery({
    queryKey: queryKeys.dashboard.checkCompleted(),
    queryFn: async () => (await api.get('/dashboard/check-completed')).data,
    staleTime: 60000,
  });

  const { data: chartData } = useQuery<MonthlyChart[]>({
    queryKey: queryKeys.dashboard.monthlyChart(),
    queryFn: async () => (await api.get('/dashboard/monthly-chart')).data.data,
  });

  const { data: pipelineData } = useQuery<PipelineStage[]>({
    queryKey: queryKeys.dashboard.pipeline(),
    queryFn: async () => (await api.get('/dashboard/pipeline')).data.data,
  });

  const { data: weeklyData } = useQuery({
    queryKey: queryKeys.dashboard.weeklySchedule(),
    queryFn: async () => (await api.get('/dashboard/weekly-schedule')).data.data,
  });

  const lastUpdated = new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const periodToggle = (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex gap-1 rounded-md border border-border bg-card p-1"
        role="tablist"
        aria-label="集計期間の切替"
      >
        {([
          ['monthly', '今月'],
          ['yearly', '年間'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={!selectedMonth && kpiPeriod === value}
            onClick={() => { setSelectedMonth(""); setKpiPeriod(value); }}
            className={`rounded-sm px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              !selectedMonth && kpiPeriod === value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        aria-label="特定の月を選択"
        className={`h-9 rounded-md border bg-card px-2 text-xs sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          selectedMonth ? 'border-primary text-primary' : 'border-border text-foreground'
        }`}
      />
      {selectedMonth && (
        <button
          type="button"
          onClick={() => setSelectedMonth("")}
          className="rounded-sm px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          今月に戻す
        </button>
      )}
    </div>
  );

  return (
    <PageTransition>
      <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <DashboardHeader
          title="ダッシュボード"
          description="全社の主要指標・進行中案件・週次スケジュールをここで把握します。"
          period={kpi?.period_label}
          lastUpdated={`最終更新 ${lastUpdated}`}
          controls={periodToggle}
        />

        {/* 主要指標 (KPI Grid) — 情報階層「全体」 */}
        <section aria-labelledby="kpi-summary-heading">
          <h2 id="kpi-summary-heading" className="sr-only">主要指標</h2>
          {kpiLoading ? (
            <div className="flex justify-center rounded-lg border border-border bg-card py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
            </div>
          ) : kpi ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <KpiCard
                label="売上"
                icon={<DollarSign />}
                value={formatYen(kpi.monthly_revenue)}
                footnote={kpi.period_label}
              />
              <KpiCard
                label="変動原価 (仕入)"
                icon={<ShoppingCart />}
                value={formatYen(kpi.monthly_purchase)}
              />
              <KpiCard
                label="粗利"
                icon={<TrendingUp />}
                value={formatYen(kpi.gross_profit)}
                unit={formatPercent(kpi.monthly_gross_margin)}
                emphasis={kpi.gross_profit >= 0 ? 'success' : 'negative'}
              />
              <KpiCard
                label="販管費"
                icon={<Receipt />}
                value={formatYen(kpi.monthly_sga)}
              />
              <KpiCard
                label="営業利益"
                icon={<BarChart3 />}
                value={formatYen(kpi.operating_profit)}
                unit={formatPercent(kpi.operating_margin)}
                emphasis={kpi.operating_profit >= 0 ? 'success' : 'negative'}
                size="lg"
                className="col-span-2 md:col-span-3 lg:col-span-1"
              />
            </div>
          ) : null}

          {kpi ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="進行中案件"
                value={kpi.active_projects}
                unit="件"
                size="sm"
                emphasis="info"
                onClick={() => navigate('/sales/projects')}
              />
              <KpiCard
                label="ヨミ"
                value={kpi.active_yomi}
                unit="件"
                size="sm"
                emphasis="warning"
                onClick={() => navigate('/sales/projects?stage=yomi')}
              />
              <KpiCard
                label="粗利率"
                value={formatPercent(kpi.monthly_gross_margin)}
                size="sm"
                emphasis={kpi.gross_profit >= 0 ? 'success' : 'negative'}
              />
              <KpiCard
                label="営業利益率"
                value={formatPercent(kpi.operating_margin)}
                size="sm"
                emphasis={kpi.operating_profit >= 0 ? 'success' : 'negative'}
              />
            </div>
          ) : null}
        </section>

        {/* 今週のスケジュール */}
        {weeklyData ? (
          <SectionCard
            title="今週のスケジュール"
            description="本番・収録・放送予定を週単位で確認できます。"
            icon={<Calendar />}
          >
            {(weeklyData as Array<any>).length === 0 ? (
              <EmptyState title="今週の予定はありません" />
            ) : (
              <>
                {/* Mobile: Compact horizontal scroll */}
                <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden snap-x snap-mandatory">
                  {(weeklyData as Array<{ date: string; dayLabel: string; events: Array<{ gls_number?: string; name?: string; project_name?: string; episode_code?: string; type: string }> }>).map((day) => {
                    const isToday = day.date === new Date().toISOString().split('T')[0];
                    return (
                      <div key={day.date} className={`min-w-[120px] snap-start shrink-0 rounded-md border p-2 ${isToday ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}>
                        <div className={`text-center mb-1 ${isToday ? 'font-bold text-primary' : 'text-foreground'}`}>
                          <span className="text-xs text-muted-foreground">{day.dayLabel}</span>
                          <span className="text-xs ml-1">{day.date.split('-')[2]}日</span>
                        </div>
                        <div className="space-y-0.5">
                          {day.events.slice(0, 3).map((ev, i) => (
                            <div key={i} className={`rounded px-1 py-0.5 text-primary-foreground text-xs leading-tight truncate ${typeColors[ev.type] || 'bg-muted-foreground'}`}>
                              {typeLabels[ev.type]}: {ev.gls_number || ev.episode_code}
                            </div>
                          ))}
                          {day.events.length > 3 && (
                            <div className="text-xs text-muted-foreground text-center">+{day.events.length - 3}件</div>
                          )}
                          {day.events.length === 0 && (
                            <div className="text-xs text-muted-foreground text-center mt-2" aria-hidden="true">-</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop: 7-column grid */}
                <div className="hidden lg:grid grid-cols-7 gap-2">
                  {(weeklyData as Array<{ date: string; dayLabel: string; events: Array<{ gls_number?: string; name?: string; project_name?: string; episode_code?: string; type: string }> }>).map((day) => {
                    const isToday = day.date === new Date().toISOString().split('T')[0];
                    return (
                      <div key={day.date} className={`min-h-[120px] rounded-md border p-2 ${isToday ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}>
                        <div className={`text-center mb-2 ${isToday ? 'font-bold text-primary' : 'text-foreground'}`}>
                          <div className="text-xs text-muted-foreground">{day.dayLabel}</div>
                          <div className="text-sm">{day.date.split('-')[2]}</div>
                        </div>
                        <div className="space-y-1">
                          {day.events.slice(0, 4).map((ev, i) => (
                            <div key={i} className={`rounded px-1.5 py-0.5 text-primary-foreground text-xs leading-tight truncate ${typeColors[ev.type] || 'bg-muted-foreground'}`} title={`${typeLabels[ev.type] || ev.type}: ${ev.name || ev.project_name || ev.episode_code}`}>
                              {typeLabels[ev.type]}: {ev.gls_number || ev.episode_code}
                            </div>
                          ))}
                          {day.events.length > 4 && (
                            <div className="text-xs text-muted-foreground text-center">+{day.events.length - 4}件</div>
                          )}
                          {day.events.length === 0 && (
                            <div className="text-xs text-muted-foreground text-center mt-4">予定なし</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-3 justify-center" aria-label="凡例">
                  {Object.entries(typeLabels).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1">
                      <div className={`w-2.5 h-2.5 rounded-sm ${typeColors[key]}`} aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        ) : null}

        {/* チャート群 — 情報階層「部分」 */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <SectionCard
            title="月次推移"
            description="売上・仕入・販管費の棒グラフと粗利/営業利益の折れ線グラフ。"
            icon={<BarChart3 />}
            padding="compact"
          >
            {chartData && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid {...chartDefaults.cartesian} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v: string) => `${parseInt(v.split('-')[1])}月`}
                    {...chartDefaults.axis}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}M`}
                    width={45}
                    {...chartDefaults.axis}
                  />
                  <Tooltip
                    formatter={(value) => [formatYenShort(Number(value)), '']}
                    labelFormatter={(label) => `${parseInt(String(label).split('-')[1])}月`}
                    wrapperStyle={{ zIndex: 10 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" fill={chartColors.brand} name="売上" />
                  <Bar dataKey="purchase" fill={chartColors.warning} name="仕入" />
                  <Bar dataKey="sga" fill={chartColors.negative} name="販管費" />
                  <Line type="monotone" dataKey="gross_profit" stroke={chartColors.positive} name="粗利" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="operating_profit" stroke={chartColors.info} name="営業利益" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="月次データがありません" />
            )}
          </SectionCard>

          <SectionCard
            title="ヨミパイプライン"
            description="段階別の案件数と見込金額。"
            icon={<TrendingUp />}
            padding="compact"
          >
            {pipelineData && pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={pipelineData.map((s) => ({
                    ...s,
                    label: statusOf(PROJECT_STAGE, s.stage).label,
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 48 }}
                >
                  <CartesianGrid {...chartDefaults.cartesian} />
                  <XAxis type="number" tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}M`} {...chartDefaults.axis} />
                  <YAxis type="category" dataKey="label" width={80} {...chartDefaults.axis} />
                  <Tooltip
                    formatter={(value) => [formatYenShort(Number(value)), '金額']}
                  />
                  <Bar dataKey="total_amount" name="金額" label={{ position: 'right', fontSize: 11, formatter: (v: unknown) => {
                    const item = pipelineData.find((s) => s.total_amount === Number(v));
                    return item ? `${item.count}件` : '';
                  } }}>
                    {pipelineData.map((s, idx) => (
                      <Cell key={idx} fill={pipelineStageColors[s.stage] || chartColors.neutral} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="パイプラインデータがありません" />
            )}
          </SectionCard>
        </div>

        {/* アラート + 最近の案件 — 情報階層「詳細」 */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <SectionCard
            title="アラート"
            description="対応が必要な申込書未提出・イベント直前など。"
            icon={<AlertTriangle />}
          >
            {!alerts || alerts.length === 0 ? (
              <EmptyState title="アラートはありません" description="現在対応が必要な案件はありません。" />
            ) : (
              <ul className="space-y-2 sm:space-y-3">
                {alerts.map((a, idx) => (
                  <li key={`${a.id}-${a.alert_type}-${idx}`} className="flex items-start gap-2 sm:gap-3 rounded-md border border-border p-2 sm:p-3">
                    <Badge variant={statusOf(ALERT_TYPE, a.alert_type).variant}>
                      {statusOf(ALERT_TYPE, a.alert_type).label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="最近の案件"
            description="直近で作成/更新された案件 5 件。"
            icon={<ClipboardList />}
          >
            {!recentProjects || recentProjects.length === 0 ? (
              <EmptyState title="案件がありません" description="まずは新規案件を作成してください。" />
            ) : (
              <ul className="space-y-2 sm:space-y-3">
                {recentProjects.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border p-2 sm:p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => navigate(`/sales/projects/${p.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-foreground truncate">{p.gls_number} {p.name}</p>
                        {p.customer_name && (
                          <p className="text-xs text-muted-foreground">{p.customer_name}</p>
                        )}
                      </div>
                      <Badge variant={statusOf(PROJECT_STAGE, p.stage).variant} className="shrink-0">
                        {statusOf(PROJECT_STAGE, p.stage).label}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </PageTransition>
  );
}
