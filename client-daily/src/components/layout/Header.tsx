import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/uiStore';
import SharedHeader from '@gmo-onair/shared/src/client/SharedHeader';
import ManualModal from '@gmo-onair/shared/src/client/manual/ManualModal';
import VersionHistoryModal from '@gmo-onair/shared/src/client/versionHistory/VersionHistoryModal';
import McpInfoModal from '@gmo-onair/shared/src/client/mcpInfo/McpInfoModal';
import { DAILY_MANUAL } from '@/manual/content';

export default function Header() {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [manualOpen, setManualOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [mcpInfoOpen, setMcpInfoOpen] = useState(false);

  return (
    <>
      <SharedHeader
        currentApp="dailyops"
        appLabel="日常業務"
        currentUser={currentUser}
        onLogout={logout}
        onToggleSidebar={toggleSidebar}
        onOpenManual={() => setManualOpen(true)}
        onOpenVersionHistory={() => setVersionHistoryOpen(true)}
        onOpenMcpInfo={() => setMcpInfoOpen(true)}
      />
      <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={DAILY_MANUAL} />
      <VersionHistoryModal open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen} productLabel="GMO ONAiR" />
      <McpInfoModal open={mcpInfoOpen} onOpenChange={setMcpInfoOpen} />
    </>
  );
}
