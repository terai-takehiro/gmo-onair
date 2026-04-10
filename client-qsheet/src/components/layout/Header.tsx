import { Menu, LogOut, User } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import AppSwitcher from "@gmo-onair/shared/src/client/AppSwitcher";

interface Props {
  userName?: string;
  onLogout: () => void;
}

export default function Header({ userName, onLogout }: Props) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-3 sm:px-4">
      <div className="flex items-center gap-2">
        <AppSwitcher currentApp="qsheet" />
        <button
          className="lg:hidden p-2 rounded-md hover:bg-muted"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        {userName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            {userName}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1 text-muted-foreground">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">ログアウト</span>
        </Button>
      </div>
    </header>
  );
}
