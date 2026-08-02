import { useAuth } from "@/hooks/useAuth";
import { useUiStore } from "@/stores/uiStore";
import AppHeader from "@gmo-onair/shared/src/client/AppHeader";
import { QSHEET_MANUAL } from "@/manual/content";

export default function Header() {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  return (
    <AppHeader
      currentApp="qsheet"
      appLabel="Qシート"
      currentUser={currentUser}
      onLogout={logout}
      onToggleSidebar={toggleSidebar}
      manualContent={QSHEET_MANUAL}
    />
  );
}
