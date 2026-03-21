import { NavLink } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  TrendingUp,
  FolderKanban,
  Receipt,
  ShoppingCart,
  Calendar,
  Building2,
  Truck,
  Users,
  UserCog,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { label: "ダッシュボード", to: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "営業・案件管理",
    items: [
      { label: "ヨミ管理", to: "/opportunities", icon: TrendingUp },
      { label: "案件管理", to: "/projects", icon: FolderKanban },
    ],
  },
  {
    title: "売上・仕入",
    items: [
      { label: "売上一覧", to: "/revenues", icon: Receipt },
      { label: "仕入一覧", to: "/purchases", icon: ShoppingCart },
    ],
  },
  {
    items: [
      { label: "カレンダー", to: "/calendar", icon: Calendar },
    ],
  },
  {
    title: "マスター",
    items: [
      { label: "顧客", to: "/masters/customers", icon: Building2 },
      { label: "仕入先", to: "/masters/vendors", icon: Truck },
      { label: "パートナー", to: "/masters/partners", icon: Users },
    ],
  },
  {
    title: "管理",
    items: [
      { label: "ユーザー管理", to: "/admin/users", icon: UserCog, adminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const { currentUser } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const isAdmin = currentUser?.role === "system_admin";

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
              const visibleItems = section.items.filter(
                (item) => !item.adminOnly || isAdmin
              );
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
