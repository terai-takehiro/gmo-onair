import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import AppHeader from '@gmo-onair/shared/src/client/AppHeader';
import { LIVE_MANUAL } from '@/manual/content';
import api from '@/lib/api';

interface Props { programId?: string }
interface LiveProgram { id: string; name: string; gls_number?: string | null }

export default function Header({ programId }: Props) {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as LiveProgram),
    enabled: !!programId,
    staleTime: 60_000,
  });

  const subLabel = program
    ? program.gls_number ? `${program.gls_number} ${program.name}` : program.name
    : undefined;

  return (
    <AppHeader
      currentApp="liveops"
      appLabel="計時LIVE"
      subLabel={subLabel}
      currentUser={currentUser}
      onLogout={logout}
      onToggleSidebar={toggleSidebar}
      manualContent={LIVE_MANUAL}
    />
  );
}
