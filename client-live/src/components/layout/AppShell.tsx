import { Outlet, useParams } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { usePermissions } from '@/hooks/usePermissions';
import { ShieldOff } from 'lucide-react';

export default function AppShell() {
  const { canView, permissionsLoading } = usePermissions();
  const { projectId } = useParams<{ projectId?: string }>();

  if (!permissionsLoading && !canView) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <ShieldOff className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">アクセス権限がありません</h2>
          <p className="text-sm text-muted-foreground">
            計時LIVEへのアクセス権限がありません。<br />
            管理者に <code className="text-xs bg-muted px-1 py-0.5 rounded">liveops</code> モジュールの権限付与を依頼してください。
          </p>
          <a href="/" className="inline-block text-sm text-primary underline">メインアプリに戻る</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-x-hidden">
      <Sidebar projectId={projectId} />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header projectId={projectId} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
