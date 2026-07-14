import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import SharedHeader from '@gmo-onair/shared/src/client/SharedHeader';
import ManualModal from '@gmo-onair/shared/src/client/manual/ManualModal';
import VersionHistoryModal from '@gmo-onair/shared/src/client/versionHistory/VersionHistoryModal';
import McpInfoModal from '@gmo-onair/shared/src/client/mcpInfo/McpInfoModal';
import { LIVE_MANUAL } from '@/manual/content';
import api from '@/lib/api';

interface Props { programId?: string }
interface LiveProgram { id: string; name: string; gls_number?: string | null }

export default function Header({ programId }: Props) {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [manualOpen, setManualOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [mcpInfoOpen, setMcpInfoOpen] = useState(false);

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
    <>
      <SharedHeader
        currentApp="liveops"
        appLabel="計時LIVE"
        subLabel={subLabel}
        currentUser={currentUser}
        onLogout={logout}
        onToggleSidebar={toggleSidebar}
        onOpenManual={() => setManualOpen(true)}
        onOpenVersionHistory={() => setVersionHistoryOpen(true)}
        onOpenMcpInfo={() => setMcpInfoOpen(true)}
      />
      <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={LIVE_MANUAL} />
      <VersionHistoryModal open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen} productLabel="GMO ONAiR" />
      <McpInfoModal open={mcpInfoOpen} onOpenChange={setMcpInfoOpen} />
    </>
  );
}
