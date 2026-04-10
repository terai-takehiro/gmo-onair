import { Menu, LogOut } from "lucide-react";
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
    <header className="flex h-14 items-center justify-between border-b bg-card px-3 sm:px-5">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 rounded-md hover:bg-muted -ml-1"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden lg:block">
          <AppSwitcher currentApp="techsheet" />
        </div>
        <span className="text-sm font-bold text-primary">技術資料</span>
      </div>

      <div className="flex items-center gap-3">
        {userName && (
          <span className="text-sm text-muted-foreground hidden sm:inline">{userName}</span>
        )}
        <Button variant="ghost" size="icon" onClick={onLogout} title="ログアウト" className="h-9 w-9">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
