import { Outlet } from "react-router-dom";
import { AppShell as SharedAppShell } from "@gmo-onair/shared/src/client/shell";
import { NotificationBell } from '@gmo-onair/shared/src/client-v4/NotificationBell';
import api from "@/lib/api";

import { useAuth } from "@/hooks/useAuth";
import { EQUIPMENT_MANUAL } from "@/manual/content";
import { EQUIPMENT_MOBILE_TABS, EQUIPMENT_NAV } from "./nav";

/**
 * 機材管理のシェル — **枠は共通** (`shared/src/client/shell/`)。
 *
 * 高さ・スクロール・お知らせ帯・確認ダイアログ・アプリ切替・スマホの引き出しは
 * すべて共通シェルが持ちます。**メニューの項目は `nav.ts` で、中身は今までと同じ**です。
 *
 * **閲覧のゲートは足していません。** 機材管理には今フロント側の権限ゲートが無く
 * (サーバー側で見ている)、ここで新設すると**権限を持たない既存の利用者が
 * 突然入れなくなります**。入れるなら本番の `user_permissions` を数えてから別の作業で。
 */
export default function AppShell() {
  const { currentUser, logout, hasPermission } = useAuth();

  return (
    <SharedAppShell
      appKey="equipment"
      sections={EQUIPMENT_NAV}
      mobileTabs={EQUIPMENT_MOBILE_TABS}
      notificationSlot={<NotificationBell api={api} />}
      manualContent={EQUIPMENT_MANUAL}
      user={currentUser ? { name: currentUser.name, role: currentUser.role, email: currentUser.email } : null}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={currentUser?.permissions as Record<string, string> | undefined}
      can={(m) => hasPermission(m)}
    >
      <Outlet />
    </SharedAppShell>
  );
}
