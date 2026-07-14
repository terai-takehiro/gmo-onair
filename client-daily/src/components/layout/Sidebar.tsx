import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { getAccessibleApps } from '@gmo-onair/shared/src/client/appNav';
import {
  ClipboardList, CalendarCheck, Newspaper, ChevronLeft, X,
  Home, FileText, Package, Sparkles, Wrench, Timer, Tv, Languages,
  Briefcase, PiggyBank, Calendar, LayoutDashboard, DoorOpen,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Home, FileText, Package, Sparkles, Wrench, Timer, Tv, Languages,
  Briefcase, PiggyBank, Calendar, ClipboardList,
};

export default function Sidebar() {
  const { currentUser } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUiStore();

  const otherApps = getAccessibleApps(
    'dailyops',
    currentUser?.role,
    currentUser?.permissions as Record<string, string> | undefined
  );

  const close = () => setSidebarOpen(false);

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={close} />
      )}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[72vw] sm:w-60 flex-col border-r border-border bg-card transition-transform',
        sidebarOpen ? 'translate-x-0 lg:static' : '-translate-x-full'
      )}>
        {/* App header */}
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-3">
          <a href="/" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent transition-colors" title="ONAiR ホームへ">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </a>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
            </div>
            <span className="truncate text-sm font-bold">日常業務</span>
          </div>
          <button className="ml-auto p-1 rounded hover:bg-accent transition-colors" onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          <SidebarLink to="/" icon={LayoutDashboard} end onClick={close}>ホーム</SidebarLink>
          <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">メニュー</p>
          <SidebarLink to="/weekly" icon={CalendarCheck} onClick={close}>ウィークリー活動報告</SidebarLink>
          <SidebarLink to="/news" icon={Newspaper} onClick={close}>デイリーニュース報告</SidebarLink>
          <SidebarLink to="/inview" icon={DoorOpen} onClick={close}>内覧会 来場予約</SidebarLink>
        </nav>

        {/* Other apps */}
        {otherApps.length > 0 && (
          <div className="border-t border-border p-2 space-y-0.5 max-h-[40vh] overflow-y-auto">
            <p className="px-3 mb-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">他のアプリ</p>
            {otherApps.map((app) => {
              const Icon = ICON_MAP[app.icon] || Package;
              const isExternal = !!app.externalUrl;
              return (
                <a
                  key={app.key}
                  href={isExternal ? app.externalUrl : app.path}
                  {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
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

function SidebarLink({ to, icon: Icon, end, onClick, children }: {
  to: string; icon: React.ElementType; end?: boolean; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </NavLink>
  );
}
