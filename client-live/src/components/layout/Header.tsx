import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import AppSwitcher from '@gmo-onair/shared/src/client/AppSwitcher';
import api from '@/lib/api';

interface Props { programId?: string }

interface LiveProgram {
  id: string;
  name: string;
  gls_number?: string | null;
  project_name?: string;
}

export default function Header({ programId }: Props) {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as LiveProgram),
    enabled: !!programId,
    staleTime: 60_000,
  });

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-3 sm:px-4 relative z-30">
      <div className="flex items-center gap-2 min-w-0">
        <AppSwitcher currentApp="liveops" />
        <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-9 w-9" onClick={toggleSidebar}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <a href="/" className="font-bold text-primary hover:opacity-80 transition-opacity shrink-0">ONAiR</a>
          <span className="text-muted-foreground/30 shrink-0">/</span>
          <span className="font-semibold text-foreground shrink-0">計時LIVE</span>
          {program && (
            <>
              <span className="text-muted-foreground/30 shrink-0 hidden sm:inline">/</span>
              <span className="text-muted-foreground truncate hidden sm:inline">
                {program.gls_number
                  ? <><span className="font-mono text-primary/80 mr-1">{program.gls_number}</span>{program.name}</>
                  : program.name}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {currentUser && (
          <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[120px]">{currentUser.name}</span>
        )}
        <Button variant="ghost" size="icon" onClick={() => logout()} title="ログアウト" className="h-9 w-9 shrink-0">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
