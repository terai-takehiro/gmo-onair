import { useAuth } from "@/hooks/useAuth";
import { useUiStore } from "@/stores/uiStore";
import AppHeader from "@gmo-onair/shared/src/client/AppHeader";
import { TECHSHEET_MANUAL } from "@/manual/content";

export default function Header() {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  return (
    <AppHeader
      currentApp="techsheet"
      appLabel="技術資料"
      currentUser={currentUser}
      onLogout={logout}
      onToggleSidebar={toggleSidebar}
      manualContent={TECHSHEET_MANUAL}
    />
  );
}
