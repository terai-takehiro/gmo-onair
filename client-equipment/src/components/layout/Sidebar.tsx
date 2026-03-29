import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import {
  LayoutDashboard,
  Package,
  ArrowRightLeft,
  Wrench,
  ClipboardCheck,
  Settings,
  X,
  QrCode,
  MapPin,
} from "lucide-react";

const navItems = [
  { label: "ダッシュボード", path: "/equipment", icon: LayoutDashboard },
  { label: "機材一覧", path: "/equipment/items", icon: Package },
  { label: "貸出管理", path: "/equipment/lendings", icon: ArrowRightLeft },
  { label: "メンテナンス", path: "/equipment/maintenance", icon: Wrench },
  { label: "棚卸し", path: "/equipment/inventory", icon: ClipboardCheck },
  { label: "QRスキャン", path: "/equipment/scan", icon: QrCode },
  { label: "カテゴリ管理", path: "/equipment/categories", icon: Settings },
  { label: "保管場所管理", path: "/equipment/locations", icon: MapPin },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
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
          "fixed lg:static inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/equipment")}
          >
            <Package className="h-6 w-6 text-primary" />
            <div>
              <span className="text-lg font-bold text-primary">機材管理</span>
              <span className="block text-[10px] text-muted-foreground leading-none">
                GMO ONAiR Equipment
              </span>
            </div>
          </div>
          <button
            className="lg:hidden p-1 rounded hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.path === "/equipment"
                ? location.pathname === "/equipment"
                : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer link to ONAiR */}
        <div className="border-t p-3">
          <a
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            GMO ONAiR 本体へ
          </a>
        </div>
      </aside>
    </>
  );
}
