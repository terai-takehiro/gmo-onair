import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import {
  LayoutDashboard,
  FileText,
  Radio,
  X,
  ChevronLeft,
} from "lucide-react";

const navItems = [
  { label: "ダッシュボード", path: "/qsheet", icon: LayoutDashboard },
  { label: "エディター", path: "/qsheet/editor", icon: FileText },
  { label: "ON AIR", path: "/qsheet/onair", icon: Radio },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen } = useUiStore();

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 flex w-[72vw] sm:w-64 flex-col border-r bg-card transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* App Header — unified pattern */}
        <div className="flex h-14 items-center gap-3 border-b px-3">
          <a
            href="/"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted"
            title="ONAiR ホームへ"
          >
            <ChevronLeft className="h-4 w-4" />
          </a>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-500 text-white">
              <FileText className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-bold">Qシート</span>
          </div>
          <button
            className="ml-auto lg:hidden p-1 rounded hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.path === "/qsheet"
                ? location.pathname === "/qsheet"
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

        {/* Footer — app shortcuts */}
        <div className="border-t p-3 space-y-2">
          <div className="flex items-center justify-center gap-2">
            {[
              { path: "/", label: "ホーム" },
              { path: "/equipment", label: "機材" },
              { path: "/interactive", label: "ｲﾝﾀﾗ" },
              { path: "/techsheet", label: "技術" },
            ].map((app) => (
              <a
                key={app.path}
                href={app.path}
                className="flex items-center justify-center rounded-lg w-9 h-9 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={app.label}
              >
                <span className="text-xs">{app.label.slice(0, 2)}</span>
              </a>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground/50">v0.8.4</p>
        </div>
      </aside>
    </>
  );
}
