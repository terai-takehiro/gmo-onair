import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Tv,
  FileSearch,
  Zap,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  ClipboardList,
  Briefcase,
  Languages,
  TrendingUp,
  Flame,
  Phone,
  Mail,
  MessageSquare,
  CalendarClock,
  Check,
  Inbox,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  FolderKanban, PiggyBank, Calendar, Package, FileText,
  BookOpen, Users, Truck, Sparkles, Wrench, Timer, Tv, Languages,
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

// v2.9.175+: 営業ダッシュボード (ホット案件) の 1 案件
interface SalesBoardItem {
  id: string;
  gls_number?: string | null;
  name: string;
  customer_name?: string | null;
  stage: string;
  event_start?: string | null;
  last_activity_type?: string | null;
  last_activity_subject?: string | null;
  last_activity_date?: string | null;
  next_action_activity_id?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  activity_count?: number;
  is_hot?: number;
  // v2.9.178+: AI 起票情報
  created_by?: string | null;
  ai_reviewed_at?: string | null;
  ai_requested_by?: string | null;
}

// v2.9.178+: AI 起票インボックスの 1 案件
interface AiInboxItem {
  id: string;
  code?: string | null;
  gls_number?: string | null;
  name: string;
  stage: string;
  expected_amount?: number | null;
  created_at: string;
  customer_name?: string | null;
  assigned_to_name?: string | null;
  ai_requested_by?: string | null;
}

// AI 起票判定 (MCP 経由の書き込みは created_by='mcp-claude')
const isAiCreated = (createdBy?: string | null) => createdBy === "mcp-claude";

// 営業活動種別 → ラベル + アイコン (activity_logs.activity_type)
const ACTIVITY_META: Record<string, { label: string; icon: React.ElementType }> = {
  call: { label: "電話", icon: Phone },
  email: { label: "メール", icon: Mail },
  meeting: { label: "打合せ", icon: Users },
  visit: { label: "訪問", icon: Users },
  proposal: { label: "提案", icon: FileText },
  demo: { label: "デモ", icon: MessageSquare },
  followup: { label: "フォロー", icon: MessageSquare },
  follow_up: { label: "フォロー", icon: MessageSquare },
  other: { label: "その他", icon: MessageSquare },
};

// YYYY-MM-DD を「今日 / N日前 / M/D」の相対表記に
function relativeDay(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "今日";
  if (diff === 1) return "昨日";
  if (diff > 1 && diff <= 30) return `${diff}日前`;
  if (diff === -1) return "明日";
  if (diff < 0 && diff >= -30) return `${-diff}日後`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
  const canSeeBudget = hasPermission("budget");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "おはようございます" : hour < 18 ? "お疲れさまです" : "お疲れさまです";
  const lastUpdated = new Date().toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-screen-2xl px-4 py-5 sm:py-8 space-y-5 sm:space-y-6">
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

        {/* ───── 1. 今後のスケジュール (最上部・全幅で目立たせる) ───── */}
        {canSeeStudio && <ScheduleSection />}

        {/* ───── 2. クイックアクセス (財務管理が有効なユーザー) ───── */}
        {canSeeBudget && <QuickAccessSection navigate={navigate} />}

        {/* ───── 3. AI 起票インボックス (未確認の AI 起票案件があるときだけ表示) ───── */}
        {canSeeSales && <AiInboxSection navigate={navigate} />}

        {/* ───── 4. 今月の主要指標 + 前月比 ───── */}
        {canSeeSales && <KpiSection navigate={navigate} />}

        {/* ───── 5. 営業ダッシュボード (進行中案件 + ホットな情報) ───── */}
        {canSeeSales && <SalesBoardSection navigate={navigate} />}

        {/* ───── 5. 直近の案件 ───── */}
        {canSeeSales && <RecentProjectsSection navigate={navigate} />}

        {/* ───── 6. ブロックアプリ起動 (補助) ───── */}
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
                disabled={!app.externalUrl && !hasPermission(app.id)}
                onClick={() => {
                  if (app.externalUrl) {
                    window.open(app.externalUrl, "_blank", "noopener,noreferrer");
                  } else if (["equipment", "qsheet", "techsheet", "liveops", "awards"].includes(app.id)) {
                    window.location.href = app.basePath;
                  } else {
                    navigate(app.basePath);
                  }
                }}
              />
            ))}
          </div>
        </SectionCard>

        {/* ───── 7. 今日対応すべきこと (優先度低めのため下部に配置) ───── */}
        {canSeeSales && <ActionItemsSection navigate={navigate} />}

        {/* ───── 8. システム管理 (admin only) ───── */}
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
// セクション 1.5: クイックアクセス (財務管理が有効なユーザー向け)
// 経費精算 PDF 取込などの高頻度業務へトップページからワンタップで移動
// ══════════════════════════════════════════════════════════
function QuickAccessSection({ navigate }: { navigate: (to: string) => void }) {
  return (
    <SectionCard
      title="クイックアクセス"
      description="よく使う財務業務へワンタップで移動できます。"
      icon={<Zap />}
      padding="compact"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => navigate("/budget/xpoint-import")}
          aria-label="精算PDF取込を開く"
          className="group flex items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileSearch className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-1.5">
              精算PDF取込
              <Badge variant="outline" className="text-[10px] px-1.5 font-normal">X-Point / 楽楽精算</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              申請PDFをアップロード or Boxから読み取り、確認して仕入・販管費に登録
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
        </button>
      </div>
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
// セクション 1: 今後のスケジュール (今日から 7 日間)
// 最上部・全幅で目立たせ、件数だけでなくイベント名も表示する
// ══════════════════════════════════════════════════════════
interface ScheduleEvent {
  type: string; // 'event' (本番) | 'recording' (収録) | 'broadcast' (放送) | 'booking' (スタジオ予約)
  name?: string;
  project_name?: string;
  gls_number?: string;
  episode_code?: string;
  booking_type?: string; // type='booking' のときの予約種別 (performance/rehearsal/maintenance 等)
}

const EVENT_TYPE_STYLE: Record<string, { label: string; dot: string; chip: string }> = {
  event: { label: "本番", dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200" },
  recording: { label: "収録", dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  broadcast: { label: "放送", dot: "bg-green-600", chip: "bg-green-50 text-green-700 border-green-200" },
};

// スタジオ予約の種別別スタイル (StudioBookingDialog の bookingTypeOptions と同じ値)
const BOOKING_TYPE_STYLE: Record<string, { label: string; dot: string; chip: string }> = {
  performance: { label: "本番", dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200" },
  rehearsal: { label: "リハーサル", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  hold: { label: "仮押さえ", dot: "bg-yellow-400", chip: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  tour: { label: "内覧", dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200" },
  consultation: { label: "相談", dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200" },
  setup: { label: "設営/準備", dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200" },
  maintenance: { label: "メンテナンス", dot: "bg-slate-500", chip: "bg-slate-100 text-slate-700 border-slate-300" },
  internal: { label: "社内利用", dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200" },
  other: { label: "その他", dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200" },
  project: { label: "予約", dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 border-slate-200" },
};

function scheduleEventStyle(ev: ScheduleEvent): { label: string; dot: string; chip: string } {
  if (ev.type === "booking") {
    return BOOKING_TYPE_STYLE[ev.booking_type ?? ""] ?? BOOKING_TYPE_STYLE.other;
  }
  return EVENT_TYPE_STYLE[ev.type] ?? EVENT_TYPE_STYLE.event;
}

function ScheduleSection() {
  const { data: weeklyData, isLoading } = useQuery<Array<{ date: string; dayLabel: string; events: ScheduleEvent[] }>>({
    queryKey: queryKeys.dashboard.weeklySchedule(),
    queryFn: async () => (await api.get("/dashboard/weekly-schedule")).data.data,
    staleTime: 120_000,
  });

  const totalEvents = (weeklyData ?? []).reduce((a, d) => a + d.events.length, 0);

  return (
    <SectionCard
      title="今後のスケジュール"
      description="今日から 7 日間の本番・収録・放送とスタジオ予約 (リハーサル・メンテナンス等すべて) の予定です。"
      icon={<Calendar />}
      actions={
        <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {[
            EVENT_TYPE_STYLE.event,
            EVENT_TYPE_STYLE.recording,
            EVENT_TYPE_STYLE.broadcast,
            BOOKING_TYPE_STYLE.rehearsal,
            { label: "その他予約", dot: "bg-slate-400", chip: "" },
          ].map((s) => (
            <span key={s.label} className="flex items-center gap-1">
              <span className={cn("inline-block h-2 w-2 rounded-full", s.dot)} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </span>
      }
      padding="compact"
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : !weeklyData || weeklyData.length === 0 || totalEvents === 0 ? (
        <EmptyState title="今後 7 日間の予定はありません" />
      ) : (
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {weeklyData.map((day, i) => {
            const isToday = i === 0;
            const count = day.events.length;
            const isSunday = day.dayLabel === "日";
            const isSaturday = day.dayLabel === "土";
            const shown = day.events.slice(0, 3);
            const overflow = count - shown.length;
            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-md border p-1.5 sm:p-2 min-h-[88px] sm:min-h-[120px] flex flex-col",
                  isToday ? "border-primary border-2 bg-primary/5" : "border-border bg-muted/20"
                )}
              >
                <div className="text-center">
                  <span className={cn(
                    "text-xs",
                    isToday ? "font-bold text-primary" : isSunday ? "text-red-500" : isSaturday ? "text-blue-500" : "text-muted-foreground"
                  )}>
                    {isToday ? "今日" : day.dayLabel}
                  </span>
                  <span className={cn("ml-1 text-xs font-medium", isToday ? "text-primary" : "text-foreground")}>
                    {Number(day.date.split("-")[2])}
                  </span>
                </div>
                {/* モバイルは件数のみ、sm 以上でイベント名チップを表示 */}
                <div className={cn(
                  "mt-1 text-center text-base font-bold font-number tabular-nums sm:hidden",
                  count > 0 ? (isToday ? "text-primary" : "text-foreground") : "text-muted-foreground/40"
                )}>
                  {count > 0 ? count : "–"}
                </div>
                <div className="mt-1.5 hidden sm:flex flex-col gap-1 flex-1">
                  {count === 0 ? (
                    <span className="text-center text-xs text-muted-foreground/40 mt-2">–</span>
                  ) : (
                    <>
                      {shown.map((ev, j) => {
                        const style = scheduleEventStyle(ev);
                        const label = ev.name || ev.project_name || ev.episode_code || style.label;
                        return (
                          <span
                            key={j}
                            title={`[${style.label}] ${ev.gls_number ? `${ev.gls_number} ` : ""}${label}`}
                            className={cn("truncate rounded border px-1 py-0.5 text-[10px] leading-tight", style.chip)}
                          >
                            {label}
                          </span>
                        );
                      })}
                      {overflow > 0 && (
                        <span className="text-center text-[10px] text-muted-foreground">+{overflow} 件</span>
                      )}
                    </>
                  )}
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
// セクション: AI 起票インボックス (v2.9.178+)
// AI (メール取込等の MCP 経由) が起票した案件のうち未確認のものを表示し、
// 人間が内容を確認 → 「確認済み」にするレビュー導線。0 件のときは非表示。
// ══════════════════════════════════════════════════════════
function AiInboxSection({ navigate }: { navigate: (to: string) => void }) {
  const qc = useQueryClient();
  const { data: items } = useQuery<AiInboxItem[]>({
    queryKey: queryKeys.dashboard.aiInbox(),
    queryFn: async () => (await api.get("/dashboard/ai-inbox")).data.data,
    staleTime: 60_000,
    refetchOnMount: "always",
  });

  const reviewMutation = useMutation({
    mutationFn: async (projectId: string) => api.post(`/projects/${projectId}/ai-review`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.aiInbox() });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.salesBoard() });
    },
  });

  const list = items ?? [];
  if (list.length === 0) return null;

  return (
    <SectionCard
      title={`AI 起票インボックス (未確認 ${list.length}件)`}
      description="AI が問い合わせメール等から起票した案件です。内容を確認して「確認済み」にしてください。"
      icon={<Inbox />}
      padding="compact"
      className="border-violet-200"
    >
      <ul className="divide-y divide-border">
        {list.map((p) => (
          <li key={p.id} className="flex items-start gap-3 px-2 py-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-label="AI起票" />
            <button
              type="button"
              className="min-w-0 flex-1 text-left rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => navigate(`/sales/projects/${p.id}`)}
            >
              <p className="text-sm font-medium text-foreground truncate">
                {(p.gls_number || p.code) ? (
                  <span className="text-xs text-muted-foreground mr-1.5">{p.gls_number || p.code}</span>
                ) : null}
                {p.name}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {p.customer_name ? <span className="truncate">{p.customer_name}</span> : null}
                <span>起票 {relativeDay(p.created_at?.slice(0, 10))}</span>
                {p.ai_requested_by ? (
                  <span className="text-violet-600">指示: {p.ai_requested_by}</span>
                ) : null}
                {p.assigned_to_name ? <span>担当: {p.assigned_to_name}</span> : null}
              </p>
            </button>
            <Badge variant={statusOf(PROJECT_STAGE, p.stage).variant} className="shrink-0 mt-0.5">
              {statusOf(PROJECT_STAGE, p.stage).label}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-8 gap-1 text-xs"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate(p.id)}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              確認済み
            </Button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ══════════════════════════════════════════════════════════
// セクション: 営業ダッシュボード (進行中案件 + ホットな情報)
// - 進行中の全案件を一覧化 (ページングなし = トップページで確実に見える)
// - 直近の営業活動 (メール/電話/打合せ) がある「ホット案件」を先頭に強調表示
// - 次回アクション期限も併記し、今すぐ追うべき案件が一目で分かる
// ══════════════════════════════════════════════════════════
function SalesBoardSection({ navigate }: { navigate: (to: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  // 延期メニューを開いている次回アクションの activity_id (1つだけ開く)
  const [postponeFor, setPostponeFor] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data: items, isLoading } = useQuery<SalesBoardItem[]>({
    queryKey: queryKeys.dashboard.salesBoard(),
    queryFn: async () => (await api.get("/dashboard/sales-board")).data.data,
    staleTime: 60_000,
    refetchOnMount: "always",
  });

  // 次回アクションの 完了 / 延期 (ページ遷移なしのワンタップ操作)
  const nextActionMutation = useMutation({
    mutationFn: async (p: { id: string; action: "complete" | "postpone"; date?: string }) =>
      p.action === "complete"
        ? api.post(`/activity-logs/${p.id}/complete-next-action`)
        : api.post(`/activity-logs/${p.id}/postpone-next-action`, { date: p.date }),
    onSuccess: () => {
      setPostponeFor(null);
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.salesBoard() });
    },
  });

  // 今日から N 日後の YYYY-MM-DD
  const dateAfter = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${dd}`;
  };

  const list = items ?? [];
  const hotCount = list.filter((p) => p.is_hot === 1).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const followupCount = list.filter(
    (p) => p.next_action_date && p.next_action_date >= todayStr
  ).length;

  // 既定は最初の 8 件表示 + 「すべて表示」で全件展開 (確実に一覧化できるように)
  const VISIBLE = 8;
  const shown = expanded ? list : list.slice(0, VISIBLE);

  return (
    <SectionCard
      title={`営業ダッシュボード${list.length ? ` (進行中 ${list.length}件)` : ""}`}
      description="進行中の全案件を一覧化。メール・電話など直近のやり取りがある案件を上部に強調表示します。"
      icon={<TrendingUp />}
      actions={
        <button
          type="button"
          className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm flex items-center gap-1"
          onClick={() => navigate("/sales/projects")}
        >
          案件一覧 <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      }
      padding="compact"
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="進行中の案件はありません" />
      ) : (
        <>
          {/* サマリー: ホット / 次アクション期限あり */}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-2.5 py-1 text-orange-700">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              ホット案件 {hotCount} 件
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-blue-700">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              次アクション期限あり {followupCount} 件
            </span>
          </div>

          <ul className="divide-y divide-border">
            {shown.map((p) => {
              const meta = p.last_activity_type
                ? ACTIVITY_META[p.last_activity_type] ?? ACTIVITY_META.other
                : null;
              const ActIcon = meta?.icon;
              const overdue =
                p.next_action_date && p.next_action_date < todayStr;
              const aiCreated = isAiCreated(p.created_by);
              const naId = p.next_action_activity_id;
              return (
                <li key={p.id} className={cn(p.is_hot === 1 && "bg-orange-50/40 rounded-md")}>
                  {/* 案件本体 (クリックで詳細へ)。次回アクションの操作ボタンはネスト不可のため下の別行に置く */}
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-2 pt-2.5 pb-1.5 text-left transition-colors hover:bg-accent rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate(`/sales/projects/${p.id}`)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {p.is_hot === 1 ? (
                        <Flame className="h-4 w-4 text-orange-500" aria-label="ホット" />
                      ) : (
                        <Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {p.gls_number ? (
                          <span className="text-xs text-muted-foreground mr-1.5">{p.gls_number}</span>
                        ) : null}
                        {p.name}
                        {aiCreated ? (
                          <span
                            className="ml-1.5 inline-flex items-center gap-0.5 align-middle rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-normal text-violet-700"
                            title={p.ai_requested_by ? `AI起票 (指示: ${p.ai_requested_by})` : "AI起票"}
                          >
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            AI起票
                            {!p.ai_reviewed_at ? <span className="text-amber-600 font-medium">·未確認</span> : null}
                          </span>
                        ) : null}
                      </p>
                      {p.customer_name ? (
                        <p className="text-xs text-muted-foreground truncate">{p.customer_name}</p>
                      ) : null}
                      {/* 直近の営業活動 */}
                      {meta && ActIcon ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground/80 truncate">
                          <ActIcon className="h-3.5 w-3.5 shrink-0 text-orange-600" aria-hidden="true" />
                          <span className="font-medium">{meta.label}</span>
                          <span className="text-muted-foreground">{relativeDay(p.last_activity_date)}</span>
                          {p.last_activity_subject ? (
                            <span className="text-muted-foreground truncate">· {p.last_activity_subject}</span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={statusOf(PROJECT_STAGE, p.stage).variant} className="shrink-0">
                      {statusOf(PROJECT_STAGE, p.stage).label}
                    </Badge>
                  </button>
                  {/* 次回アクション (完了/延期 をページ遷移なしで操作) */}
                  {p.next_action && p.next_action_date && naId ? (
                    <div className="flex flex-wrap items-center gap-1.5 pl-9 pr-2 pb-2">
                      <span
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-1.5 text-xs",
                          overdue ? "text-red-600 font-medium" : "text-blue-700"
                        )}
                      >
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {relativeDay(p.next_action_date)}
                        <span className="text-muted-foreground truncate">{p.next_action}</span>
                        {overdue ? <span className="shrink-0">(期限超過)</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[11px] text-green-700 hover:bg-green-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={nextActionMutation.isPending}
                          onClick={() => nextActionMutation.mutate({ id: naId, action: "complete" })}
                          aria-label="次回アクションを完了"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          完了
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-md border px-2 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            postponeFor === naId
                              ? "border-blue-300 bg-blue-100 text-blue-800"
                              : "border-border bg-muted/40 text-muted-foreground hover:bg-accent"
                          )}
                          onClick={() => setPostponeFor(postponeFor === naId ? null : naId)}
                          aria-label="次回アクションを延期"
                        >
                          延期
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                      {postponeFor === naId ? (
                        <span className="flex w-full items-center justify-end gap-1 pt-0.5">
                          {[
                            { label: "明日", days: 1 },
                            { label: "3日後", days: 3 },
                            { label: "1週間後", days: 7 },
                          ].map((opt) => (
                            <button
                              key={opt.days}
                              type="button"
                              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              disabled={nextActionMutation.isPending}
                              onClick={() =>
                                nextActionMutation.mutate({ id: naId, action: "postpone", date: dateAfter(opt.days) })
                              }
                            >
                              {opt.label}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {list.length > VISIBLE ? (
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-2 text-xs text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>閉じる <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></>
              ) : (
                <>残り {list.length - VISIBLE} 件を表示 <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></>
              )}
            </button>
          ) : null}
        </>
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
  const testModules = ["sales", "budget", "studio", "equipment", "qsheet", "techsheet"];

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
