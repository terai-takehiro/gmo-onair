import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { usePermissions } from '@/hooks/usePermissions';
import { ShieldOff } from 'lucide-react';

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
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
