/**
 * SecondaryNav — 案件管理アプリの二次ナビ
 *
 * 共通レール (今日 / 案件 / タスク / お客様 / 予定 / お金 / 設定) の中の
 * 細かい行き先を出すスロット。旧 Sidebar から
 *   ・アプリ切替ヘッダー (ChevronLeft + アプリ名)
 *   ・「他のアプリ」セクション
 * を取り除いたもの (どちらもレールと ⌘K に集約したため不要)。
 *
 * Phase 3 で ⌘K が入ったら、ここは空にして 6 レール + ⌘K に一本化する。
 * それまでは約40のメニューを到達可能に保つのが役目。
 */
import { NavLink, useLocation } from "react-router-dom";
import { BLOCK_APPS, useAuth } from "@/contexts/platform/AuthContext";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  FolderKanban,
  Receipt,
  ShoppingCart,
  Calendar,
  CalendarClock,
  Layers,
  Building2,
  Truck,
  Users,
  UserCog,
  DollarSign,
  BarChart3,
  Database,
  HardDrive,
  FlaskConical,
  ClipboardList,
  Award,
  Film,
  Briefcase,
  GitBranch,
  Presentation,
  FileSearch,
  Settings,
  Store,
  KanbanSquare,
  ListTodo,
  GanttChart,
  CopyCheck,
  Sparkles,
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  /** 指定すると、そのモジュール権限を持つユーザーにのみ表示 */
  module?: string;
  /** 指定すると、いずれかのモジュール権限を持つユーザーに表示 (module より優先) */
  modules?: string[];
  /** true のとき system_admin のみに表示 */
  adminOnly?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

/** レール区画別のナビゲーション定義 */
const APP_NAV: Record<string, NavSection[]> = {
  sales: [
    {
      title: "お客様",
      items: [{ label: "顧客", to: "/sales/customers", icon: Building2 }],
    },
    {
      title: "商談",
      items: [
        { label: "ヨミ・パイプライン", to: "/sales/pipeline", icon: TrendingUp },
        { label: "営業活動記録", to: "/sales/activity-logs", icon: ClipboardList },
      ],
    },
    {
      title: "案件",
      items: [
        { label: "案件一覧", to: "/sales/projects", icon: FolderKanban },
        { label: "確定案件（スタジオ）", to: "/sales/projects/confirmed/studio", icon: Film },
        { label: "確定案件（ビジネス）", to: "/sales/projects/confirmed/business", icon: Briefcase },
        { label: "按分グループ", to: "/sales/project-groups", icon: GitBranch },
        { label: "旧GLS（決算取込）", to: "/sales/gls-import", icon: Database },
      ],
    },
    {
      title: "タスク",
      items: [
        { label: "カンバン", to: "/sales/tasks/kanban", icon: KanbanSquare },
        { label: "タスクリスト", to: "/sales/tasks/list", icon: ListTodo },
        { label: "ガントチャート", to: "/sales/tasks/gantt", icon: GanttChart },
      ],
    },
    {
      title: "ふりかえり",
      items: [
        { label: "営業レビュー", to: "/sales/review", icon: Award },
        { label: "報告資料", to: "/sales/keep-report", icon: Presentation },
        { label: "AI がやったこと", to: "/sales/ai-activity", icon: Sparkles },
        { label: "ダッシュボード", to: "/sales/dashboard", icon: BarChart3 },
      ],
    },
    {
      title: "マスター",
      items: [
        { label: "取引先マスター", to: "/sales/companies", icon: Store },
        { label: "料金表", to: "/sales/pricing", icon: DollarSign },
      ],
    },
  ],
  budget: [
    {
      items: [{ label: "財務ダッシュボード", to: "/budget/dashboard", icon: BarChart3 }],
    },
    {
      title: "収支",
      items: [
        { label: "売上管理", to: "/budget/revenues", icon: Receipt },
        { label: "仕入管理", to: "/budget/purchases", icon: ShoppingCart },
        { label: "販管費", to: "/budget/sga", icon: Receipt },
        { label: "精算PDF取込", to: "/budget/xpoint-import", icon: FileSearch },
        { label: "決算インポート", to: "/budget/kessan-import", icon: FlaskConical, adminOnly: true },
        { label: "同じ支払いが2回入っていないか調べる", to: "/budget/dedup-screening", icon: CopyCheck, adminOnly: true },
        { label: "案件月別詳細", to: "/budget/detail", icon: FolderKanban },
      ],
    },
    {
      title: "マスター",
      items: [
        { label: "取引先マスター", to: "/sales/companies", icon: Store },
        { label: "仕入先", to: "/budget/vendors", icon: Truck },
        { label: "パートナー", to: "/budget/partners", icon: Users },
      ],
    },
    {
      title: "レポート",
      items: [{ label: "仕入先集計", to: "/budget/reports/vendors", icon: BarChart3 }],
    },
  ],
  studio: [
    {
      items: [
        { label: "統合カレンダー", to: "/studio/all", icon: Layers, modules: ["studio", "partner_schedule"] },
        { label: "スタジオカレンダー", to: "/studio/calendar", icon: Calendar },
        { label: "パートナースケジュール", to: "/studio/partners", icon: Users, module: "partner_schedule" },
        { label: "マイカレンダー", to: "/studio/my-calendar", icon: CalendarClock, module: "partner_schedule" },
      ],
    },
  ],
  admin: [
    {
      items: [
        { label: "設定の入口", to: "/settings", icon: Settings },
        { label: "ユーザー管理", to: "/admin/users", icon: UserCog },
        { label: "データビューア", to: "/admin/data-viewer", icon: Database },
        { label: "DBバックアップ", to: "/admin/db-backups", icon: HardDrive },
        { label: "システム設定", to: "/admin/settings", icon: Settings },
      ],
    },
  ],
};

/**
 * 現在のパスから二次ナビの区画を判定する。
 * 刷新後の正となるパス (/projects 等) と、移行期に残る旧パス (/sales/* 等) の両方を見る。
 */
export function activeNavSection(pathname: string): string | null {
  if (pathname.startsWith("/admin") || pathname.startsWith("/settings")) return "admin";
  if (
    pathname.startsWith("/projects") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/customers")
  ) {
    return "sales";
  }
  if (pathname.startsWith("/finance")) return "budget";
  if (pathname.startsWith("/schedule")) return "studio";
  const app = BLOCK_APPS.find((a) => a.basePath.startsWith("/") && pathname.startsWith(a.basePath));
  return app && APP_NAV[app.id] ? app.id : null;
}

export const SECONDARY_NAV_LABELS: Record<string, string> = {
  sales: "案件",
  budget: "お金",
  studio: "予定",
  admin: "設定",
};

export default function SecondaryNav() {
  const { pathname } = useLocation();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";

  const sectionKey = activeNavSection(pathname);
  if (!sectionKey) return null;
  const sections = APP_NAV[sectionKey] ?? [];
  if (sections.length === 0) return null;

  return (
    <nav className="space-y-1 p-3" aria-label={`${SECONDARY_NAV_LABELS[sectionKey] ?? ""}のメニュー`}>
      {sections.map((section, si) => (
        <div key={si} className={si > 0 ? "pt-4" : ""}>
          {section.title && (
            <p className="mb-1 px-3 text-[12px] font-bold tracking-wide text-muted-foreground">
              {section.title}
            </p>
          )}
          {section.items
            .filter((item) => {
              if (isAdmin) return true;
              if (item.adminOnly) return false;
              if (item.modules && item.modules.length > 0) return item.modules.some((m) => hasPermission(m));
              if (item.module) return hasPermission(item.module);
              return true;
            })
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-control px-3 py-2 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-accent text-primary"
                      : "text-secondary-foreground hover:bg-secondary hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{item.label}</span>
              </NavLink>
            ))}
        </div>
      ))}
    </nav>
  );
}
