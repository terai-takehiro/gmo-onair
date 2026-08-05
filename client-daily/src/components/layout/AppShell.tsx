import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { usePermissions } from '@/hooks/usePermissions';
import { ShieldOff } from 'lucide-react';
import { NoticeBar } from '@gmo-onair/shared/src/client/ui/notice';
import { ConfirmHost } from '@gmo-onair/shared/src/client/ui/confirm';

export default function AppShell() {
  const { canView, permissionsLoading } = usePermissions();

  if (!permissionsLoading && !canView) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <ShieldOff className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">アクセス権限がありません</h2>
          <p className="text-sm text-muted-foreground">
            日常業務アプリへのアクセス権限がありません。<br />
            管理者に <code className="text-xs bg-muted px-1 py-0.5 rounded">dailyops</code> モジュールの権限付与を依頼してください。
          </p>
          <a href="/" className="inline-block text-sm text-primary underline">メインアプリに戻る</a>
        </div>
      </div>
    );
  }

  // 根は h-screen (100vh) ではなく h-full。iOS の 100vh は URL バーを含むので
  // 実際の表示領域より高くなり、#root の overflow: hidden で下端が切れる。
  // 親の高さは shared/src/client/base.css が html/body/#root に配っている。
  return (
    <div className="flex h-full overflow-x-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header />
        {/*
          お知らせ帯はスクロールする領域の**中の上端**に置く (sticky top-0)。
          ヘッダーの外に出すと、スクロールして下にいるときに気づけない。
          確認ダイアログの器 (ConfirmHost) はシェル直下に1つだけ。
          置き忘れると confirmAction が **false を返して実行しない**
          (黙って実行するより安全側に倒してある)。
        */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <NoticeBar />
          <Outlet />
        </main>
      </div>
      <ConfirmHost />
    </div>
  );
}
