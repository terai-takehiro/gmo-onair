import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BLOCK_APPS } from "@/contexts/platform/AuthContext";
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
  X,
  ClipboardList,
  ClipboardCheck,
  Award,
  Film,
  Briefcase,
  GitBranch,
  Package,
  Wrench,
  PiggyBank,
  Home,
  ChevronLeft,
  Sparkles,
  FileText,
  BookOpen,
  Settings,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  FolderKanban, PiggyBank, Calendar, Package, FileText,
  BookOpen, Users, Truck, Sparkles, Wrench,
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
        { label: "確定案件（スタジオ）", to: "/sales/projects/confirmed/studio", icon: Film },
        { label: "確定案件（ビジネス）", to: "/sales/projects/confirmed/business", icon: Briefcase },
        { label: "按分グループ", to: "/sales/project-groups", icon: GitBranch },
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
        { label: "顧客", to: "/sales/customers", icon: Building2 },
        { label: "料金表", to: "/sales/pricing", icon: DollarSign },
      ],
    },
  ],
  budget: [
    {
      title: "収支",
      items: [
        { label: "売上管理", to: "/budget/revenues", icon: Receipt },
        { label: "仕入管理", to: "/budget/purchases", icon: ShoppingCart },
        { label: "販管費", to: "/budget/sga", icon: Receipt },
      ],
    },
    {
      title: "マスター",
      items: [
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
  equipment: [
    {
      items: [
        { label: "ダッシュボード", to: "/equipment", icon: BarChart3 },
        { label: "機材一覧", to: "/equipment/items", icon: Package },
        { label: "貸出管理", to: "/equipment/lending", icon: ClipboardList },
        { label: "メンテナンス", to: "/equipment/maintenance", icon: Wrench },
        { label: "棚卸し", to: "/equipment/inventory", icon: ClipboardCheck },
      ],
    },
  ],
  admin: [
    {
      items: [
        { label: "ユーザー管理", to: "/admin/users", icon: UserCog },
        { label: "データビューア", to: "/admin/data-viewer", icon: Database },
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
          "fixed inset-y-0 left-0 z-50 flex w-[72vw] sm:w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
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
            className="ml-auto rounded p-1 hover:bg-sidebar-accent lg:hidden"
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

        {/* App shortcuts + Home */}
        <div className="border-t p-3 space-y-2">
          <div className="flex items-center justify-center gap-1">
            {[
              { emoji: "📋", path: "/qsheet", label: "Qシート" },
              { emoji: "📦", path: "/equipment", label: "機材" },
              { emoji: "✨", path: "/interactive", label: "ｲﾝﾀﾗ" },
              { emoji: "🔧", path: "/techsheet", label: "技術" },
            ].map((app) => (
              <a
                key={app.path}
                href={app.path}
                title={app.label}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              >
                <span className="text-base">{app.emoji}</span>
                <span>{app.label}</span>
              </a>
            ))}
          </div>
          <button
            onClick={() => { navigate("/"); setSidebarOpen(false); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Home className="h-4 w-4" />
            ホームに戻る
          </button>
          <p className="text-center text-[10px] text-muted-foreground/50">v0.7.9</p>
        </div>
      </aside>
    </>
  );
}
