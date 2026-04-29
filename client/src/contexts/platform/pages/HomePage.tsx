import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth, BLOCK_APPS, type BlockApp } from "@/contexts/platform/AuthContext";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DashboardHeader,
  KpiCard,
  SectionCard,
  EmptyState,
} from "@gmo-onair/shared/src/client/dashboard";
import api from "@/lib/api";
import {
  PROJECT_STAGE,
  ALERT_TYPE,
  ALERT_PRIORITY,
  statusOf,
} from "@gmo-onair/shared/src/constants/statuses";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import {
  FolderKanban,
  PiggyBank,
  Calendar,
  Package,
  FileText,
  BookOpen,
  Users,
  Truck,
  Sparkles,
  UserCog,
  Database,
  Settings,
  ExternalLink,
  AlertTriangle,
  Wrench,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Timer,
  Trophy,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  ClipboardList,
  Briefcase,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  FolderKanban, PiggyBank, Calendar, Package, FileText,
  BookOpen, Users, Truck, Sparkles, Wrench, Timer, Trophy,
};

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
};

// ──────────────────────────────────────
// 型定義
// ──────────────────────────────────────
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

interface MonthlyChart {
  month: string;
  revenue: number;
  purchase: number;
  sga: number;
  gross_profit: number;
  operating_profit: number;
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
  event_start?: string;
}

// ステータス定義は shared/src/constants/statuses.ts に一元化済み (v2.4.0)

// 円表示
const formatYen = (v: number) => `¥${(v / 10000).toLocaleString()}万`;

// 数値変化を「+X%」「-X%」形式に
function formatDelta(curr: number, prev: number): { text: string; pct: number } | null {
  if (prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return { text: `${rounded >= 0 ? '+' : ''}${rounded}%`, pct: rounded };
}

// ──────────────────────────────────────
// ホームページ本体
// ──────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";

  const canSeeSales = hasPermission("sales");
  const canSeeStudio = hasPermission("studio");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "おはようございます" : hour < 18 ? "お疲れさまです" : "お疲れさまです";
  const lastUpdated = new Date().toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* ───── ヘッダー ───── */}
        <DashboardHeader
          title={<img src="/logo-onair.svg" alt="GMO ONAiR" className="h-8 sm:h-10 w-auto" />}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <span>{greeting}、{currentUser?.name} さん</span>
              <Badge variant="outline" className="text-xs">
                {roleLabelMap[currentUser?.role || ""] || currentUser?.role}
              </Badge>
            </span>
          }
          lastUpdated={`最終更新 ${lastUpdated}`}
          controls={
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              aria-label="データを再取得"
            >
              <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
              更新
            </Button>
          }
        />

        {/* ───── 1. 今日対応すべきこと (最上部) ───── */}
        {canSeeSales && <ActionItemsSection navigate={navigate} />}

        {/* ───── 2. 今月の主要指標 + 前月比 ───── */}
        {canSeeSales && <KpiSection navigate={navigate} />}

        {/* ───── 3. 今週のスケジュール / 直近の案件 ───── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          {canSeeStudio && <ScheduleSection />}
          {canSeeSales && <RecentProjectsSection navigate={navigate} />}
        </div>

        {/* ───── 4. ブロックアプリ起動 (補助) ───── */}
        <SectionCard
          title="アプリを起動"
          description="業務に応じたブロックアプリへ遷移します。"
          icon={<Briefcase />}
          padding="compact"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 auto-rows-fr">
            {BLOCK_APPS.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                disabled={!hasPermission(app.id)}
                onClick={() => {
                  if (app.externalUrl) {
                    window.open(app.externalUrl, "_blank", "noopener,noreferrer");
                  } else if (["equipment", "qsheet", "interactive", "techsheet", "liveops", "awards"].includes(app.id)) {
                    window.location.href = app.basePath;
                  } else {
                    navigate(app.basePath);
                  }
                }}
              />
            ))}
          </div>
        </SectionCard>

        {/* ───── 5. システム管理 (admin only) ───── */}
        {isAdmin && (
          <SectionCard
            title="システム管理"
            description="ユーザー・データ・システム設定。"
            icon={<Settings />}
            padding="compact"
          >
            <div className="flex flex-wrap gap-2">
              {[
                { label: "ユーザー管理", icon: UserCog, to: "/admin/users" },
                { label: "データビューア", icon: Database, to: "/admin/data-viewer" },
                { label: "システム設定", icon: Settings, to: "/admin/settings" },
              ].map((item) => (
                <Button
                  key={item.to}
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(item.to)}
                  className="gap-1.5"
                >
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {item.label}
                </Button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* スタッフ向け権限診断 */}
        {!isAdmin && <PermDiagPanel />}

        {/* バージョン */}
        <p className="pt-4 text-center text-xs text-muted-foreground/60">
          GMO ONAiR Platform v{__APP_VERSION__}
        </p>
      </div>
    </PageTransition>
  );
}

// ══════════════════════════════════════════════════════════
// セクション 1: 今日対応すべきこと
// 「目的に則する」: ユーザーが今すぐ判断・行動すべきものだけ
// 優先度順 (緊急→警告→情報) でソート、最大5件表示
// ══════════════════════════════════════════════════════════
function ActionItemsSection({ navigate }: { navigate: (to: string) => void }) {
  const { data: alerts, isLoading } = useQuery<Alert[]>({
    queryKey: queryKeys.dashboard.alerts(),
    queryFn: async () => (await api.get("/dashboard/alerts")).data.data,
    staleTime: 60_000,
  });

  const sorted = (alerts ?? []).slice().sort((a, b) => {
    const pa = ALERT_PRIORITY[a.alert_type as keyof typeof ALERT_PRIORITY] ?? 99;
    const pb = ALERT_PRIORITY[b.alert_type as keyof typeof ALERT_PRIORITY] ?? 99;
    return pa - pb;
  });
  const top = sorted.slice(0, 5);
  const total = sorted.length;

  if (isLoading) return null;
  if (total === 0) {
    return (
      <SectionCard
        title="今日対応すべきこと"
        description="緊急対応・期限・申込書未提出など、今すぐ判断が必要な項目です。"
        icon={<CheckCircle2 />}
        padding="compact"
      >
        <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          対応が必要な項目はありません。
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={`今日対応すべきこと (${total}件)`}
      description="緊急度順に表示。タップで案件詳細へ。"
      icon={<AlertTriangle />}
      actions={
        total > 5 ? (
          <button
            type="button"
            className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            onClick={() => navigate("/sales/projects")}
          >
            すべて表示
          </button>
        ) : null
      }
      padding="compact"
    >
      <ul className="divide-y divide-border">
        {top.map((a, i) => (
          <li key={`${a.id}-${a.alert_type}-${i}`}>
            <button
              type="button"
              className="flex w-full items-start gap-3 px-2 py-2.5 text-left transition-colors hover:bg-accent rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => a.id && navigate(`/sales/projects/${a.id}`)}
            >
              <Badge variant={statusOf(ALERT_TYPE, a.alert_type).variant} className="shrink-0 mt-0.5">
                {statusOf(ALERT_TYPE, a.alert_type).label}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {a.gls_number ? <span className=" text-xs text-muted-foreground mr-1.5">{a.gls_number}</span> : null}
                  {a.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground mt-1" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ══════════════════════════════════════════════════════════
// セクション 2: 今月の主要指標 + 前月比
// 「違いに気づける」: 前月比トレンド・「分解できる」: 各カードから詳細画面
// ══════════════════════════════════════════════════════════
function KpiSection({ navigate }: { navigate: (to: string) => void }) {
  const { data: kpi, isLoading } = useQuery<KPI>({
    queryKey: queryKeys.dashboard.kpi("monthly"),
    queryFn: async () => (await api.get("/dashboard/kpi", { params: { period: "monthly" } })).data.data,
    staleTime: 120_000,
  });

  const { data: chart } = useQuery<MonthlyChart[]>({
    queryKey: queryKeys.dashboard.monthlyChart(),
    queryFn: async () => (await api.get("/dashboard/monthly-chart")).data.data,
    staleTime: 120_000,
  });

  // 前月のデータを取得 (chart 配列の最後から2番目)
  const prevMonth = chart && chart.length >= 2 ? chart[chart.length - 2] : null;

  if (isLoading || !kpi) {
    return (
      <SectionCard title="今月の主要指標" description="読み込み中..." icon={<PiggyBank />} padding="compact">
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      </SectionCard>
    );
  }

  const revDelta = prevMonth ? formatDelta(kpi.monthly_revenue, prevMonth.revenue) : null;
  const grossDelta = prevMonth ? formatDelta(kpi.gross_profit, prevMonth.gross_profit) : null;
  const opDelta = prevMonth ? formatDelta(kpi.operating_profit, prevMonth.operating_profit) : null;

  return (
    <SectionCard
      title={`今月の主要指標 (${kpi.period_label})`}
      description="売上・粗利・営業利益・案件数。前月との比較を併記し変化を把握できるようにしています。"
      icon={<PiggyBank />}
      actions={
        <button
          type="button"
          className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm flex items-center gap-1"
          onClick={() => navigate("/sales/dashboard")}
        >
          詳細 <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      }
      footnote="前月比は前月実績との差分。事業会計年度・案件範囲はダッシュボードで切替可能です。"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="売上"
          value={formatYen(kpi.monthly_revenue)}
          trend={revDelta?.text}
          trendLabel="前月比"
          trendSemantics="positive"
          onClick={() => navigate("/budget/revenues")}
        />
        <KpiCard
          label="粗利"
          value={formatYen(kpi.gross_profit)}
          unit={`${kpi.monthly_gross_margin}%`}
          emphasis={kpi.gross_profit >= 0 ? 'success' : 'negative'}
          trend={grossDelta?.text}
          trendLabel="前月比"
          trendSemantics="positive"
          onClick={() => navigate("/budget/dashboard")}
        />
        <KpiCard
          label="営業利益"
          value={formatYen(kpi.operating_profit)}
          unit={`${kpi.operating_margin}%`}
          emphasis={kpi.operating_profit >= 0 ? 'success' : 'negative'}
          trend={opDelta?.text}
          trendLabel="前月比"
          trendSemantics="positive"
          onClick={() => navigate("/budget/dashboard")}
        />
        <KpiCard
          label="進行中案件"
          value={kpi.active_projects}
          unit="件"
          emphasis="info"
          footnote={`ヨミ ${kpi.active_yomi} 件`}
          onClick={() => navigate("/sales/projects")}
        />
      </div>
    </SectionCard>
  );
}

// ══════════════════════════════════════════════════════════
// セクション 3-A: 今週のスケジュール
// ══════════════════════════════════════════════════════════
function ScheduleSection() {
  const { data: weeklyData, isLoading } = useQuery<Array<{ date: string; dayLabel: string; events: Array<{ type: string }> }>>({
    queryKey: queryKeys.dashboard.weeklySchedule(),
    queryFn: async () => (await api.get("/dashboard/weekly-schedule")).data.data,
    staleTime: 120_000,
  });

  return (
    <SectionCard
      title="今週のスケジュール"
      description="本番・収録・放送の予定数。今日の列がハイライトされます。"
      icon={<Calendar />}
      padding="compact"
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : !weeklyData || weeklyData.length === 0 ? (
        <EmptyState title="今週の予定はありません" />
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {weeklyData.map((day) => {
            const isToday = day.date === new Date().toISOString().split('T')[0];
            const count = day.events.length;
            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-md border p-2 text-center min-h-[64px] flex flex-col justify-between",
                  isToday ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                )}
              >
                <div className={cn("text-xs", isToday ? "font-bold text-primary" : "text-muted-foreground")}>
                  {day.dayLabel}
                </div>
                <div className={cn("text-xs", isToday ? "text-primary" : "text-foreground")}>
                  {day.date.split('-')[2]}
                </div>
                <div className={cn(
                  "mt-1 text-base font-bold font-number tabular-nums",
                  count > 0 ? (isToday ? "text-primary" : "text-foreground") : "text-muted-foreground/40"
                )}>
                  {count > 0 ? count : '–'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ══════════════════════════════════════════════════════════
// セクション 3-B: 直近の案件 (今後7日以内)
// ══════════════════════════════════════════════════════════
function RecentProjectsSection({ navigate }: { navigate: (to: string) => void }) {
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: queryKeys.dashboard.recentProjects(),
    queryFn: async () => (await api.get("/dashboard/recent-projects")).data.data,
    staleTime: 60_000,
  });

  return (
    <SectionCard
      title="直近の案件"
      description="今後 7 日以内のイベント・収録案件。"
      icon={<ClipboardList />}
      actions={
        <button
          type="button"
          className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          onClick={() => navigate("/sales/projects")}
        >
          すべて表示
        </button>
      }
      padding="compact"
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <EmptyState title="直近 7 日間の案件はありません" />
      ) : (
        <ul className="divide-y divide-border">
          {projects.slice(0, 5).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-accent rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => navigate(`/sales/projects/${p.id}`)}
              >
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    <span className=" text-xs text-muted-foreground mr-1.5">{p.gls_number}</span>
                    {p.name}
                  </p>
                  {p.customer_name ? (
                    <p className="text-xs text-muted-foreground truncate">{p.customer_name}</p>
                  ) : null}
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
  );
}

// ══════════════════════════════════════════════════════════
// アプリカード — 補助セクション用にコンパクト化
// ══════════════════════════════════════════════════════════
function AppCard({ app, onClick, disabled: forceDisabled }: { app: BlockApp; onClick: () => void; disabled?: boolean }) {
  const Icon = ICON_MAP[app.icon] || Package;
  const isComingSoon = app.status === "coming_soon";
  const isDisabled = isComingSoon || forceDisabled;
  const isExternal = !!app.externalUrl;

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-label={`${app.label}を開く`}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-md border p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDisabled
          ? "cursor-default border-dashed border-muted bg-muted/20 opacity-50"
          : "border-border bg-card hover:border-primary hover:bg-accent active:scale-[0.98]"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md text-white",
          isDisabled ? "bg-muted-foreground/30" : app.color
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <h3 className="text-sm font-semibold text-foreground">{app.label}</h3>
      </div>
      {isComingSoon && (
        <Badge variant="secondary" className="absolute top-1 right-1 text-[10px] px-1">
          準備中
        </Badge>
      )}
      {isExternal && !isDisabled && (
        <ExternalLink className="absolute top-1.5 right-1.5 h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════
// 権限診断パネル — 内容そのままで節維持
// ══════════════════════════════════════════════════════════
function PermDiagPanel() {
  const { permissions: ctxPerms, hasPermission, permissionsLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [apiPerms, setApiPerms] = useState<any>(null);
  const [, setPermTest] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [endpointTests, setEndpointTests] = useState<Record<string, { status: number | string; ok: boolean; msg?: string }>>({});

  const run = async () => {
    setLoading(true);
    try {
      const [debugRes, permsRes, permTestRes] = await Promise.allSettled([
        api.get("/auth/debug"),
        api.get("/users/me/permissions"),
        api.get("/auth/permission-test"),
      ]);
      setData(debugRes.status === "fulfilled" ? debugRes.value.data.data : { error: (debugRes.reason as any)?.response?.data?.error?.message ?? String(debugRes.reason) });
      setApiPerms(permsRes.status === "fulfilled" ? permsRes.value.data.data : { _error: (permsRes.reason as any)?.response?.data?.error?.message ?? String(permsRes.reason) });
      setPermTest(permTestRes.status === "fulfilled" ? permTestRes.value.data.data : { _error: (permTestRes.reason as any)?.response?.data?.error?.message ?? String(permTestRes.reason) });
    } finally {
      setLoading(false);
    }
  };

  const runEndpointTests = async () => {
    const endpoints: Array<[string, string]> = [
      ["sales", "/projects?limit=1"], ["budget", "/revenues?limit=1"], ["studio", "/studios/locations"],
      ["equipment", "/equipment/stats"], ["qsheet", "/qsheet/documents?limit=1"], ["techsheet", "/techsheet/documents?limit=1"],
    ];
    const results: Record<string, { status: number | string; ok: boolean; msg?: string }> = {};
    await Promise.all(endpoints.map(async ([name, path]) => {
      try {
        const res = await api.get(path);
        results[name] = { status: res.status, ok: true };
      } catch (e: any) {
        results[name] = { status: e?.response?.status ?? "err", ok: false, msg: e?.response?.data?.error?.message ?? e?.message };
      }
    }));
    setEndpointTests(results);
  };

  const permCount = data?.permissionsInDb?.length ?? 0;
  const hasPerms = permCount > 0;
  const reqUserPerms: Record<string, string> = data?.userFromJwt?.permissions ?? {};
  const reqUserPermCount = Object.keys(reqUserPerms).length;
  const apiPermCount = apiPerms && !apiPerms._error ? Object.keys(apiPerms).length : 0;
  const ctxPermCount = Object.keys(ctxPerms).length;
  const testModules = ["sales", "budget", "studio", "equipment", "qsheet", "techsheet", "interactive"];

  return (
    <div className="border border-border rounded-md overflow-hidden text-xs">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => { setOpen((v) => !v); if (!open && !data) run(); }}
      >
        <span className="flex items-center gap-2 font-medium text-muted-foreground">
          {hasPerms ? <ShieldCheck className="h-4 w-4 text-success" /> : data ? <ShieldAlert className="h-4 w-4 text-warning" /> : <ShieldCheck className="h-4 w-4 text-muted-foreground" />}
          権限診断
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3">
          {loading && <p className="text-muted-foreground">読み込み中...</p>}
          {data?.error && <p className="text-destructive">エラー: {data.error}</p>}
          {data && !data.error && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">ユーザーID</span><span className=" truncate">{data.userInDb?.id}</span>
                <span className="text-muted-foreground">ロール (DB)</span><span className="font-medium">{data.userInDb?.role}</span>
                <span className="text-muted-foreground">ステータス</span><span>{data.userInDb?.status}</span>
                <span className="text-muted-foreground">権限数 (DB table)</span><span className={hasPerms ? "text-success font-bold" : "text-warning font-bold"}>{permCount} モジュール</span>
                <span className="text-muted-foreground">権限数 (req.user)</span><span className={reqUserPermCount > 0 ? "text-success font-bold" : "text-destructive font-bold"}>{reqUserPermCount} モジュール</span>
                <span className="text-muted-foreground">権限数 (API応答)</span><span className={apiPermCount > 0 ? "text-success font-bold" : "text-destructive font-bold"}>{apiPerms?._error ? `エラー: ${apiPerms._error}` : `${apiPermCount} モジュール`}</span>
                <span className="text-muted-foreground">権限数 (AuthContext)</span><span className={ctxPermCount > 0 ? "text-success font-bold" : "text-destructive font-bold"}>{ctxPermCount} モジュール {permissionsLoaded ? "(loaded)" : "(loading...)"}</span>
              </div>
              <details className="text-muted-foreground">
                <summary className="cursor-pointer font-medium">hasPermission() 判定結果</summary>
                <div className="bg-muted/30 rounded p-2 mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {testModules.map((m) => {
                    const lvl = ctxPerms[m]; const canReader = hasPermission(m, "reader");
                    return (
                      <div key={m} className="flex justify-between"><span>{m}</span><span className={canReader ? "text-success" : "text-destructive"}>{canReader ? "✓" : "✗"} {lvl ?? "(なし)"}</span></div>
                    );
                  })}
                </div>
              </details>
            </>
          )}
          <div className="flex gap-3">
            <button onClick={run} className="text-primary underline text-xs">{loading ? "..." : "再診断"}</button>
            <button onClick={runEndpointTests} className="text-primary underline text-xs">実エンドポイントテスト</button>
          </div>
          {Object.keys(endpointTests).length > 0 && (
            <div className="bg-muted/30 rounded p-2 space-y-0.5">
              <div className="font-medium mb-1">エンドポイントテスト結果:</div>
              {Object.entries(endpointTests).map(([name, r]) => (
                <div key={name} className="flex justify-between"><span className="text-muted-foreground">{name}</span><span className={r.ok ? "text-success" : "text-destructive"}>{r.ok ? `✓ ${r.status}` : `✗ ${r.status}${r.msg ? ` — ${r.msg}` : ""}`}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
