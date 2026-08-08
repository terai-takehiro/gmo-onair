import { Outlet, useNavigate } from 'react-router-dom';
import { AppShell as SharedAppShell } from '@gmo-onair/shared/src/client/shell';
import { NotificationBell } from '@gmo-onair/shared/src/client-v4/NotificationBell';
import { PcOnlyGate } from '@gmo-onair/shared/src/client-v4/pcOnly';
import api from "@/lib/api";
import { DAILY_PC_ONLY, DAILY_MOBILE_HIDDEN } from '@/pcOnlyScreens';

import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { DAILY_MOBILE_TABS, DAILY_NAV } from './nav';
import { DAILY_MANUAL } from '@/manual/content';

/**
 * 日常業務のシェル — **枠は共通** (`shared/src/client/shell/`)。
 *
 * ここに残っているのは「このアプリ固有の設定を渡すこと」だけです。
 * 高さ・スクロール・お知らせ帯・確認ダイアログ・アプリ切替・スマホの引き出しは
 * すべて共通シェルが持ちます。**メニューの項目は `nav.ts` で、中身は今までと同じ**です。
 */
export default function AppShell() {
  const { currentUser, logout } = useAuth();
  const { canView, permissionsLoading } = usePermissions();
  const navigate = useNavigate();

  // 権限が無い人に白紙を出さない。何の権限が要るかを名前で出す (P3 の共通部品)
  if (!permissionsLoading && !canView) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto bg-background p-4">
        <NoPermissionPanel modules={['dailyops']} target="日常業務" />
      </div>
    );
  }

  return (
    <SharedAppShell
      appKey="dailyops"
      mobileHiddenPaths={DAILY_MOBILE_HIDDEN}
      sections={DAILY_NAV}
      mobileTabs={DAILY_MOBILE_TABS}
      notificationSlot={<NotificationBell api={api} />}
      manualContent={DAILY_MANUAL}
      user={currentUser ? { name: currentUser.name, role: currentUser.role, email: currentUser.email } : null}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={currentUser?.permissions as Record<string, string> | undefined}
    >
      {/* **PC で触る画面はスマホで縮めない**（M2）。宣言は `@/pcOnlyScreens` の1つの表 */}
      <PcOnlyGate table={DAILY_PC_ONLY} onGoInstead={(to) => navigate(to)}>
        <Outlet />
      </PcOnlyGate>
    </SharedAppShell>
  );
}
