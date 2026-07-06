import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BLOCK_APPS, useAuth } from "@/contexts/platform/AuthContext";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderKanban,
  Receipt,
  ShoppingCart,
  Calendar,
  Building2,
  Truck,
  Users,
  UserCog,
  DollarSign,
  BarChart3,
  Database,
  HardDrive,
  FlaskConical,
  X,
  ClipboardList,
  Award,
  Film,
  Briefcase,
  GitBranch,
  Package,
  PiggyBank,
  Home,
  ChevronLeft,
  Sparkles,
  FileText,
  FileSearch,
  BookOpen,
  Settings,
  Timer,
  Tv,
  Store,
  KanbanSquare,
  ListTodo,
  GanttChart,
  Languages,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  FolderKanban, PiggyBank, Calendar, Package, FileText,
  BookOpen, Users, Truck, Sparkles, Timer, Tv,
};

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

/** ブロックアプリ別のナビゲーション定義 */
const APP_NAV: Record<string, NavSection[]> = {
  sales: [
    {
      title: "案件",
      items: [
        { label: "案件一覧", to: "/sales/projects", icon: FolderKanban },
        { label: "旧GLS（決算取込）", to: "/sales/gls-import", icon: Database },
        { label: "確定案件（スタジオ）", to: "/sales/projects/confirmed/studio", icon: Film },
        { label: "確定案件（ビジネス）", to: "/sales/projects/confirmed/business", icon: Briefcase },
        { label: "按分グループ", to: "/sales/project-groups", icon: GitBranch },
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
      title: "営業",
      items: [
        { label: "営業活動記録", to: "/sales/activity-logs", icon: ClipboardList },
        { label: "営業レビュー", to: "/sales/review", icon: Award },
        { label: "ダッシュボード", to: "/sales/dashboard", icon: BarChart3 },
      ],
    },
    {
      title: "マスター",
      items: [
        { label: "取引先マスター", to: "/sales/companies", icon: Store },
        { label: "顧客", to: "/sales/customers", icon: Building2 },
        { label: "料金表", to: "/sales/pricing", icon: DollarSign },
      ],
    },
  ],
  budget: [
    {
      items: [
        { label: "財務ダッシュボード", to: "/budget/dashboard", icon: BarChart3 },
      ],
    },
    {
      title: "収支",
      items: [
        { label: "売上管理", to: "/budget/revenues", icon: Receipt },
        { label: "仕入管理", to: "/budget/purchases", icon: ShoppingCart },
        { label: "販管費", to: "/budget/sga", icon: Receipt },
        { label: "X-Point取込", to: "/budget/xpoint-import", icon: FileSearch },
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
      items: [
        { label: "仕入先集計", to: "/budget/reports/vendors", icon: BarChart3 },
      ],
    },
  ],
  studio: [
    {
      items: [
        { label: "カレンダー", to: "/studio/calendar", icon: Calendar },
      ],
    },
  ],
  admin: [
    {
      items: [
        { label: "ユーザー管理", to: "/admin/users", icon: UserCog },
        { label: "データビューア", to: "/admin/data-viewer", icon: Database },
        { label: "DBバックアップ", to: "/admin/db-backups", icon: HardDrive },
        { label: "決算インポート", to: "/admin/kessan-import", icon: FlaskConical },
        { label: "システム設定", to: "/admin/settings", icon: Settings },
      ],
    },
  ],
};

/** 現在のパスからアクティブなブロックアプリIDを判定 */
function useActiveApp(): string | null {
  const { pathname } = useLocation();
  // /admin は特別扱い
  if (pathname.startsWith("/admin")) return "admin";
  const app = BLOCK_APPS.find((a) => pathname.startsWith(a.basePath));
  return app?.id ?? null;
}

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const navigate = useNavigate();
  const activeAppId = useActiveApp();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";

  // ホーム画面ではサイドバー非表示
  if (!activeAppId) return null;

  const activeApp = BLOCK_APPS.find((a) => a.id === activeAppId);
  const AppIcon = activeApp ? (ICON_MAP[activeApp.icon] || Package) : Settings;
  const appLabel = activeApp?.label ?? "システム管理";
  const appColor = activeApp?.color ?? "bg-slate-500";
  const sections = APP_NAV[activeAppId] || [];

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[72vw] sm:w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform",
          sidebarOpen ? "translate-x-0 lg:static" : "-translate-x-full"
        )}
      >
        {/* App Header */}
        <div className="flex h-14 items-center gap-3 border-b px-3">
          <button
            onClick={() => navigate("/")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
            title="ホームに戻る"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white", appColor)}>
              <AppIcon className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-bold">{appLabel}</span>
          </div>
          <button
            className="ml-auto rounded p-1 hover:bg-sidebar-accent"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="space-y-1 p-3">
            {sections.map((section, si) => (
              <div key={si} className={si > 0 ? "pt-4" : ""}>
                {section.title && (
                  <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </p>
                )}
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* App shortcuts + Home — アクセス可能なアプリのみ表示 */}
        <div className="border-t p-3 space-y-1">
          <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">他のアプリ</p>
          {(
            [
              { path: "/qsheet", label: "Qシート", Icon: FileText, module: "qsheet" },
              { path: "/equipment", label: "機材管理", Icon: Package, module: "equipment" },
              { path: "/techsheet", label: "技術資料", Icon: BookOpen, module: "techsheet" },
              { path: "/live", label: "計時LIVE", Icon: Timer, module: "liveops" },
              { path: "/awards", label: "リアルタイムCG", Icon: Tv, module: "awards" },
              { path: "https://interactive.gmo-onair.jp/", label: "インタラクティブ", Icon: Sparkles, module: "interactive", external: true },
              { path: "https://gmo-translate.jp/", label: "翻訳", Icon: Languages, module: "translate", external: true },
            ] as Array<{ path: string; label: string; Icon: React.ElementType; module: string; external?: boolean }>
          )
            .filter((app) => app.external || isAdmin || hasPermission(app.module))
            .map((app) => (
              <a
                key={app.path}
                href={app.path}
                {...(app.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              >
                <app.Icon className="h-4 w-4 shrink-0" />
                {app.label}
              </a>
            ))}
          <button
            onClick={() => { navigate("/"); setSidebarOpen(false); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Home className="h-4 w-4" />
            ホームに戻る
          </button>
        </div>
      </aside>
    </>
  );
}
