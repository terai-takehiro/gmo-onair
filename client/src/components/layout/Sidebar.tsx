import { NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/platform/AuthContext";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
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
  Award,
  Film,
  Briefcase,
  GitBranch,
  Package,
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  /** 必要なモジュール権限 (未指定=全員表示) */
  module?: string;
  /** 必要なアクセスレベル (デフォルト: view) */
  minLevel?: "view" | "edit" | "full";
}

interface NavSection {
  title?: string;
  items: NavItem[];
  /** セクション全体に必要なモジュール権限 */
  module?: string;
}

const navSections: NavSection[] = [
  {
    items: [
      { label: "ダッシュボード", to: "/", icon: LayoutDashboard, module: "dashboard" },
    ],
  },
  {
    title: "営業・案件管理",
    module: "projects",
    items: [
      { label: "案件管理", to: "/projects", icon: FolderKanban },
      { label: "確定案件（スタジオ）", to: "/projects/confirmed/studio", icon: Film },
      { label: "確定案件（ビジネス）", to: "/projects/confirmed/business", icon: Briefcase },
      { label: "按分グループ", to: "/project-groups", icon: GitBranch },
      { label: "営業活動記録", to: "/activity-logs", icon: ClipboardList },
      { label: "営業レビュー", to: "/sales-review", icon: Award },
    ],
  },
  {
    title: "売上・仕入・販管費",
    items: [
      { label: "売上管理", to: "/revenues", icon: Receipt, module: "revenues" },
      { label: "仕入管理", to: "/purchases", icon: ShoppingCart, module: "purchases" },
      { label: "販管費", to: "/sga", icon: Receipt, module: "sga" },
    ],
  },
  {
    title: "制作・運用",
    items: [
      { label: "スタジオ予約", to: "/calendar", icon: Calendar, module: "calendar" },
      { label: "機材管理", to: "/equipment", icon: Package, module: "equipment" },
      { label: "貸出管理", to: "/equipment/lending", icon: ClipboardList, module: "equipment" },
    ],
  },
  {
    title: "マスター管理",
    module: "masters",
    items: [
      { label: "顧客", to: "/masters/customers", icon: Building2 },
      { label: "仕入先", to: "/masters/vendors", icon: Truck },
      { label: "パートナー", to: "/masters/partners", icon: Users },
      { label: "料金表", to: "/masters/pricing", icon: DollarSign },
    ],
  },
  {
    title: "レポート",
    module: "reports",
    items: [
      { label: "仕入先集計", to: "/reports/vendors", icon: BarChart3 },
    ],
  },
  {
    title: "システム管理",
    module: "admin",
    items: [
      { label: "ユーザー管理", to: "/admin/users", icon: UserCog },
      { label: "データビューア", to: "/admin/data-viewer", icon: Database },
    ],
  },
];

export default function Sidebar() {
  const { hasPermission } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUiStore();

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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="text-lg font-bold text-primary">GMO ONAiR</span>
          <button
            className="rounded p-1 hover:bg-sidebar-accent lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="space-y-1 p-3">
            {navSections.map((section, si) => {
              // セクションレベルのパーミッションチェック
              if (section.module && !hasPermission(section.module)) return null;

              const visibleItems = section.items.filter((item) => {
                if (item.module && !hasPermission(item.module, item.minLevel)) return false;
                return true;
              });
              if (visibleItems.length === 0) return null;

              return (
                <div key={si} className={si > 0 ? "pt-4" : ""}>
                  {section.title && (
                    <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.title}
                    </p>
                  )}
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
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
              );
            })}
          </nav>
        </ScrollArea>
      </aside>
    </>
  );
}
