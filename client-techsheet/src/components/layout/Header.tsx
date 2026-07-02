import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUiStore } from "@/stores/uiStore";
import SharedHeader from "@gmo-onair/shared/src/client/SharedHeader";
import ManualModal from "@gmo-onair/shared/src/client/manual/ManualModal";
import VersionHistoryModal from "@gmo-onair/shared/src/client/versionHistory/VersionHistoryModal";
import { TECHSHEET_MANUAL } from "@/manual/content";

export default function Header() {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [manualOpen, setManualOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  return (
    <>
      <SharedHeader
        currentApp="techsheet"
        appLabel="技術資料"
        currentUser={currentUser}
        onLogout={logout}
        onToggleSidebar={toggleSidebar}
        onOpenManual={() => setManualOpen(true)}
        onOpenVersionHistory={() => setVersionHistoryOpen(true)}
      />
      <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={TECHSHEET_MANUAL} />
      <VersionHistoryModal open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen} productLabel="GMO ONAiR" />
    </>
  );
}
