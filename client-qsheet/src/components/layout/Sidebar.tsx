import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useAuth } from "@/hooks/useAuth";
import { getAccessibleApps } from "@gmo-onair/shared/src/client/appNav";
import {
  LayoutDashboard, FilePlus, FileText, X, ChevronLeft, CalendarDays,
} from 'lucide-react';


const navItems = [
  // `/qsheet` はもう画面を持たない（`routeSwitch.ts` の転送だけ）。
  // 実体である `/qsheet/sheets` に直接向ける（転送を1段挟まないため）
  { label: "ドキュメント一覧", path: "/qsheet/sheets", icon: LayoutDashboard },
  // スケジュール表（段4・04-schedule-impl.md §5-1）
  { label: "スケジュール表", path: "/qsheet/schedules", icon: CalendarDays },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const { currentUser } = useAuth();

  const otherApps = getAccessibleApps('qsheet', currentUser?.role, currentUser?.permissions);

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        aria-label="ナビゲーション"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[72vw] sm:w-64 flex-col border-r bg-card transition-transform",
          sidebarOpen ? "translate-x-0 lg:static" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-3 border-b px-3">
          <a href="/" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted" title="ONAiR ホームへ">
            <ChevronLeft className="h-4 w-4" />
          </a>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-500 text-white">
              <FileText className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-bold">Qシート</span>
          </div>
          <button className="ml-auto p-1 rounded hover:bg-muted" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
          {navItems.map((item) => {
            const isActive = item.path === "/qsheet/sheets"
              ? ["/qsheet", "/qsheet/sheets", "/qsheet/editor"].includes(location.pathname)
              : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => {
              navigate("/qsheet/sheets");
              setSidebarOpen(false);
              setTimeout(() => {
                const btn = document.querySelector('[data-create-btn]') as HTMLButtonElement;
                btn?.click();
              }, 100);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
          >
            <FilePlus className="h-4 w-4 shrink-0" />
            新規作成
          </button>
        </nav>

        {otherApps.length > 0 && (
          <div className="border-t p-3 space-y-1">
            <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">他のアプリ</p>
            {otherApps.map((app) => {
              const Icon = app.icon;  // アプリ登録 (shared/src/client/apps.ts) が部品を持つ
              const isExternal = !!app.external;
              return (
                <a
                  key={app.key}
                  href={isExternal ? app.external : app.path}
                  {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {app.label}
                </a>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}
