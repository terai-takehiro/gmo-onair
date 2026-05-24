import { NavLink, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import { getAccessibleApps } from '@gmo-onair/shared/src/client/appNav';
import api from '@/lib/api';
import {
  Timer, LayoutDashboard, Settings, ChevronLeft, X,
  Home, FileText, Package, Sparkles, Wrench, ArrowLeft,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Home, FileText, Package, Sparkles, Wrench, Timer,
};

interface Props { programId?: string }

interface LiveProgram {
  id: string;
  name: string;
  project_id: string | null;
  project_name?: string;
  gls_number?: string | null;
}

export default function Sidebar({ programId }: Props) {
  const { currentUser } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUiStore();

  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as LiveProgram),
    enabled: !!programId,
    staleTime: 60_000,
  });

  const otherApps = getAccessibleApps(
    'liveops',
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
              <Timer className="h-3.5 w-3.5" />
            </div>
            <span className="truncate text-sm font-bold">計時LIVE</span>
          </div>
          <button className="ml-auto p-1 rounded hover:bg-accent transition-colors" onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Program context panel */}
        {programId && program && (
          <div className="border-b border-border px-3 py-2.5">
            <div className="rounded-md bg-primary/10 px-2.5 py-2">
              {program.gls_number && (
                <p className="text-[10px] font-bold text-primary leading-none mb-0.5">{program.gls_number}</p>
              )}
              <p className="text-xs font-medium truncate">{program.name}</p>
              {program.project_name && !program.gls_number && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{program.project_name}</p>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {programId ? (
            <>
              <SidebarLink to={`/program/${programId}`} icon={LayoutDashboard} end onClick={close}>ダッシュボード</SidebarLink>
              <SidebarLink to={`/program/${programId}/timers`} icon={Timer} onClick={close}>タイマー管理</SidebarLink>
              <SidebarLink to={`/program/${programId}/settings`} icon={Settings} onClick={close}>番組設定</SidebarLink>
              <div className="pt-2 mt-2 border-t border-border">
                <Link
                  to="/"
                  onClick={close}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  セッション一覧へ
                </Link>
              </div>
            </>
          ) : (
            <SidebarLink to="/" icon={Timer} end onClick={close}>セッション一覧</SidebarLink>
          )}

          <div className={cn('pt-1', programId ? '' : 'mt-1')}>
            <SidebarLink to="/settings" icon={Settings} onClick={close}>設定</SidebarLink>
          </div>
        </nav>

        {/* Other apps */}
        {otherApps.length > 0 && (
          <div className="border-t border-border p-2 space-y-0.5">
            <p className="px-3 mb-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">他のアプリ</p>
            {otherApps.map((app) => {
              const Icon = ICON_MAP[app.icon] || Package;
              return (
                <a
                  key={app.key}
                  href={app.path}
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
