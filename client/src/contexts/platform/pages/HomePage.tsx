import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth, BLOCK_APPS, type BlockApp } from "@/contexts/platform/AuthContext";
import { PageTransition, StaggerList, StaggerItem } from "@/components/ui/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { AnimatedCurrency } from "@/components/ui/animated-number";
import api from "@/lib/api";
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
  TrendingUp,
  AlertTriangle,
  Wrench,
  Activity,
  ArrowRight,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  FolderKanban, PiggyBank, Calendar, Package, FileText,
  BookOpen, Users, Truck, Sparkles, Wrench,
};

// ──────────────────────────────────────
// App Card (compact)
// ──────────────────────────────────────
function AppCard({ app, onClick, disabled: forceDisabled }: { app: BlockApp; onClick: () => void; disabled?: boolean }) {
  const Icon = ICON_MAP[app.icon] || Package;
  const isComingSoon = app.status === "coming_soon";
  const isDisabled = isComingSoon || forceDisabled;
  const isExternal = !!app.externalUrl;

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-2xl border-2 p-5 text-center transition-all h-full",
        isDisabled
          ? "cursor-default border-dashed border-muted bg-muted/30 opacity-60"
          : "border-transparent bg-card shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-primary/20 active:scale-[0.98]"
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl text-white transition-transform",
          isDisabled ? "bg-muted-foreground/30" : app.color,
          !isDisabled && "group-hover:scale-110"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <h3 className="text-sm font-semibold">{app.label}</h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed">
          {app.description}
        </p>
      </div>
      {isComingSoon && (
        <Badge variant="secondary" className="absolute top-2 right-2 text-[9px]">
          準備中
        </Badge>
      )}
      {isExternal && !isDisabled && (
        <ExternalLink className="absolute top-2 right-2 h-3 w-3 text-muted-foreground/50" />
      )}
    </button>
  );
}

// ──────────────────────────────────────
// Role label
// ──────────────────────────────────────
const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
  external_client: "外部クライアント",
};

// ──────────────────────────────────────
// Interfaces for portal widgets
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

const stageLabel: Record<string, string> = {
  neta: "ネタ", d_hold: "D保留", c_proposal: "C提案",
  b_verbal: "B内示", a_won: "A受注", s_completed: "S完了", e_lost: "E失注",
};
const stageColor: Record<string, string> = {
  neta: "#94a3b8", d_hold: "#a78bfa", c_proposal: "#3b82f6",
  b_verbal: "#f59e0b", a_won: "#22c55e", s_completed: "#6b7280", e_lost: "#ef4444",
};

const alertTypeLabel: Record<string, string> = {
  application_form: "申込書", upcoming_event: "直前", warning: "警告", danger: "緊急", info: "情報",
};
const alertTypeColor: Record<string, string> = {
  application_form: "#ef4444", upcoming_event: "#f59e0b", warning: "#f59e0b", danger: "#ef4444", info: "#3b82f6",
};

const typeColors: Record<string, string> = {
  event: "bg-blue-500", recording: "bg-purple-500", broadcast: "bg-cyan-500",
};
const typeLabels: Record<string, string> = {
  event: "本番", recording: "収録", broadcast: "放送",
};

// ──────────────────────────────────────
// Portal widgets (conditionally rendered)
// ──────────────────────────────────────

function KpiWidget() {
  const navigate = useNavigate();
  const { data: kpi } = useQuery<KPI>({
    queryKey: ["portal-kpi"],
    queryFn: async () => (await api.get("/dashboard/kpi", { params: { period: "monthly" } })).data.data,
    staleTime: 120000,
  });

  if (!kpi) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 px-4">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            今月の損益
          </span>
          <button
            onClick={() => navigate("/sales/dashboard")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            詳細 <ArrowRight className="h-3 w-3" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
            <p className="text-[10px] text-blue-600 dark:text-blue-400">売上</p>
            <AnimatedCurrency value={kpi.monthly_revenue} className="text-sm font-bold text-blue-700 dark:text-blue-300" />
          </div>
          <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
            <p className="text-[10px] text-orange-600 dark:text-orange-400">仕入</p>
            <AnimatedCurrency value={kpi.monthly_purchase} className="text-sm font-bold text-orange-700 dark:text-orange-300" />
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/30">
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">粗利 {formatPercent(kpi.monthly_gross_margin)}</p>
            <AnimatedCurrency value={kpi.gross_profit} className="text-sm font-bold text-emerald-700 dark:text-emerald-300" />
          </div>
          <div className={cn("rounded-lg p-3", kpi.operating_profit >= 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30")}>
            <p className={cn("text-[10px]", kpi.operating_profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
              営業利益 {formatPercent(kpi.operating_margin)}
            </p>
            <AnimatedCurrency
              value={kpi.operating_profit}
              className={cn("text-sm font-bold", kpi.operating_profit >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span>進行中案件: <strong className="text-primary">{kpi.active_projects}</strong></span>
          <span>ヨミ: <strong className="text-orange-600">{kpi.active_yomi}</strong></span>
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleWidget() {
  const { data: weeklyData } = useQuery({
    queryKey: ["portal-weekly"],
    queryFn: async () => (await api.get("/dashboard/weekly-schedule")).data.data,
    staleTime: 120000,
  });

  if (!weeklyData || !Array.isArray(weeklyData)) return null;

  const today = new Date().toISOString().split("T")[0];
  type DaySchedule = { date: string; dayLabel: string; events: Array<{ gls_number?: string; episode_code?: string; type: string; name?: string; project_name?: string }> };

  return (
    <Card>
      <CardHeader className="pb-2 px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-violet-500" />
          今週のスケジュール
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(weeklyData as DaySchedule[]).map((day) => {
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                className={cn(
                  "min-w-[90px] flex-1 shrink-0 rounded-lg border p-2",
                  isToday ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-muted/30"
                )}
              >
                <div className={cn("text-center mb-1", isToday && "font-bold text-primary")}>
                  <span className="text-[10px] text-muted-foreground">{day.dayLabel}</span>
                  <span className="text-[10px] ml-0.5">{day.date.split("-")[2]}日</span>
                </div>
                <div className="space-y-0.5">
                  {day.events.slice(0, 3).map((ev, i) => (
                    <div
                      key={i}
                      className={cn("rounded px-1 py-0.5 text-white text-[9px] leading-tight truncate", typeColors[ev.type] || "bg-gray-400")}
                    >
                      {typeLabels[ev.type]}: {ev.gls_number || ev.episode_code}
                    </div>
                  ))}
                  {day.events.length > 3 && (
                    <div className="text-[9px] text-muted-foreground text-center">+{day.events.length - 3}</div>
                  )}
                  {day.events.length === 0 && (
                    <div className="text-[9px] text-muted-foreground text-center mt-1">-</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-2 justify-center">
          {Object.entries(typeLabels).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={cn("w-2 h-2 rounded-sm", typeColors[key])} />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsWidget() {
  const navigate = useNavigate();
  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ["portal-alerts"],
    queryFn: async () => (await api.get("/dashboard/alerts")).data.data,
    staleTime: 120000,
  });

  if (!alerts || alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 px-4">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            アラート
          </span>
          <Badge variant="secondary" className="text-[10px]">{alerts.length}件</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-1.5">
          {alerts.slice(0, 4).map((a, idx) => (
            <div key={`${a.id}-${idx}`} className="flex items-center gap-2 rounded-md border p-2">
              <Badge className="text-[9px] shrink-0" style={{ backgroundColor: alertTypeColor[a.alert_type], color: "#fff" }}>
                {alertTypeLabel[a.alert_type] || a.alert_type}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{a.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{a.message}</p>
              </div>
            </div>
          ))}
          {alerts.length > 4 && (
            <button
              onClick={() => navigate("/sales/dashboard")}
              className="text-xs text-muted-foreground hover:text-primary w-full text-center pt-1 transition-colors"
            >
              他{alerts.length - 4}件を表示
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentProjectsWidget() {
  const navigate = useNavigate();
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["portal-recent-projects"],
    queryFn: async () => (await api.get("/dashboard/recent-projects")).data.data,
    staleTime: 120000,
  });

  if (!projects || projects.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 px-4">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            最近の案件
          </span>
          <button
            onClick={() => navigate("/sales/projects")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            一覧 <ArrowRight className="h-3 w-3" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-1.5">
          {projects.slice(0, 5).map((p) => (
            <div
              key={p.id}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2 transition-colors hover:bg-muted/50"
              onClick={() => navigate(`/sales/projects/${p.id}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">
                  {p.gls_number && <span className="text-muted-foreground mr-1">{p.gls_number}</span>}
                  {p.name}
                </p>
                {p.customer_name && (
                  <p className="text-[10px] text-muted-foreground">{p.customer_name}</p>
                )}
              </div>
              <Badge className="shrink-0 text-[9px]" style={{ backgroundColor: stageColor[p.stage], color: "#fff" }}>
                {stageLabel[p.stage] || p.stage}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────
// HomePage (Portal)
// ──────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const { currentUser, hasPermission, permissionsLoaded } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";

  // 全アプリを常に表示（グリッドサイズを固定してがたつき防止）
  // 権限ロード中は全アプリをdisabledにし、ロード後に権限のないものをdisabled表示
  const canSeeSales = hasPermission("sales");
  const canSeeStudio = hasPermission("studio");

  // Determine greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "おはようございます" : hour < 18 ? "お疲れさまです" : "お疲れさまです";

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="heading-page text-2xl tracking-tight lg:text-3xl">
            GMO ON<span className="text-primary">Ai</span>R
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {greeting}、{currentUser?.name} さん
            <Badge variant="outline" className="ml-2 text-[10px]">
              {roleLabelMap[currentUser?.role || ""] || currentUser?.role}
            </Badge>
          </p>
        </div>

        {/* ── Role-based widgets (権限ロード後のみ表示してがたつき防止) ── */}
        {permissionsLoaded && (
          <div className="space-y-4 mb-8">
            {/* Row 1: KPI + Schedule (for sales/studio users) */}
            {(canSeeSales || canSeeStudio) && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {canSeeSales && <KpiWidget />}
                {canSeeStudio && <ScheduleWidget />}
              </div>
            )}

            {/* Row 2: Alerts + Recent Projects (for sales users) */}
            {canSeeSales && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AlertsWidget />
                <RecentProjectsWidget />
              </div>
            )}
          </div>
        )}

        {/* ── App Grid ── */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            ブロックアプリ
          </h2>
          <StaggerList className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4 auto-rows-fr">
            {BLOCK_APPS.map((app) => {
              // 権限ロード中 or 権限なし → disabled（coming_soonは常にdisabled）
              const noPermission = permissionsLoaded && app.status !== "coming_soon" && !hasPermission(app.id);
              const isDisabled = !permissionsLoaded || noPermission;
              return (
              <StaggerItem key={app.id}>
                <AppCard
                  app={app}
                  disabled={isDisabled}
                  onClick={() => {
                    if (app.externalUrl) {
                      window.open(app.externalUrl, "_blank", "noopener,noreferrer");
                    } else if (["equipment", "qsheet", "interactive", "techsheet"].includes(app.id)) {
                      // サブアプリは必ずフルページリロード（専用ビルドへ遷移）
                      window.location.href = app.basePath;
                    } else {
                      navigate(app.basePath);
                    }
                  }}
                />
              </StaggerItem>
              );
            })}
          </StaggerList>
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <div className="border-t pt-6">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              システム管理
            </h2>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "ユーザー管理", icon: UserCog, to: "/admin/users" },
                { label: "データビューア", icon: Database, to: "/admin/data-viewer" },
                { label: "システム設定", icon: Settings, to: "/admin/settings" },
              ].map((item) => (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                >
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Version */}
        <p className="mt-10 text-center text-[10px] text-muted-foreground/40">
          GMO ONAiR Platform v{__APP_VERSION__}
        </p>
      </div>
    </PageTransition>
  );
}
