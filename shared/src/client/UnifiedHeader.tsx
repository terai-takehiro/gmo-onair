import { Menu, LogOut } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import AppSwitcher from "@gmo-onair/shared/src/client/AppSwitcher";

interface Props {
  appId: string;
  appName: string;
  userName?: string;
  onLogout: () => void;
}

/**
 * 統一ヘッダー — 全ブロックアプリ共通パターン
 * モバイル: [≡ ハンバーガー] [アプリ名]     [ログアウト]
 * デスクトップ: [:::AppSwitcher] [ONAiR] [アプリ名] [ユーザー名] [ログアウト]
 */
export default function Header({ appId, appName, userName, onLogout }: Props) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-3 sm:px-5">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden shrink-0 h-9 w-9 -ml-1"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden lg:block">
          <AppSwitcher currentApp={appId} />
        </div>
        <a href="/" className="hidden sm:flex items-center hover:opacity-80 transition-opacity shrink-0" aria-label="GMO ONAiR ホーム">
          <img src="/logo-onair.svg" alt="GMO ONAiR" className="h-5 w-auto" />
        </a>
        <span className="text-sm font-semibold text-foreground truncate">{appName}</span>
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
