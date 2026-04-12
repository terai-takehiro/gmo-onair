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
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-9 w-9 -ml-1" onClick={toggleSidebar}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden lg:block">
          <AppSwitcher currentApp="interactive" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <a href="/" className="text-sm font-bold text-primary hover:opacity-80 transition-opacity shrink-0">ONAiR</a>
          <span className="text-muted-foreground/40 shrink-0">/</span>
          <span className="text-sm font-semibold text-foreground truncate">インタラクティブ</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {userName && <span className="text-sm text-muted-foreground hidden sm:inline">{userName}</span>}
        <Button variant="ghost" size="icon" onClick={onLogout} title="ログアウト" className="h-9 w-9">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
