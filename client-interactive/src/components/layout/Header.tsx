import { useAuth } from "@/hooks/useAuth";
import { useUiStore } from "@/stores/uiStore";
import SharedHeader from "@gmo-onair/shared/src/client/SharedHeader";

export default function Header() {
  const { currentUser, logout } = useAuth();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  return (
    <SharedHeader
      currentApp="interactive"
      appLabel="インタラクティブ"
      currentUser={currentUser}
      onLogout={logout}
      onToggleSidebar={toggleSidebar}
    />
  );
}
