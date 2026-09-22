import { Outlet, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { AppShell as SharedAppShell } from '@gmo-onair/shared/src/client/shell';
import { NotificationBell } from '@gmo-onair/shared/src/client-v4/NotificationBell';
import { PcOnlyGate } from '@gmo-onair/shared/src/client-v4/pcOnly';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import api from '@/lib/api';
import { WIKI_MOBILE_HIDDEN, WIKI_PC_ONLY } from '@/pcOnlyScreens';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useWikiSpaces } from '@/lib/wikiApi';
import { buildWikiSections, WIKI_MOBILE_TABS } from './nav';

/**
 * Wiki のシェル — **枠は共通**（`shared/src/client/shell/`）。
 *
 * ここに残っているのは「このアプリ固有の設定を渡すこと」だけです。
 * 高さ・スクロール・お知らせ・確認ダイアログ・アプリ切替・スマホの引き出しは
 * すべて共通シェルが持ちます。
 *
 * 左メニューのスペースは DB から来るので、**ここで読んでから** `sections` を組みます
 * （固定の項目は `nav.ts`）。読めていない間はスペースの区画を出さない — 空の見出しが
 * 一瞬出てから中身が増える動きは、押そうとした指が外れるので避けます。
 */
export default function AppShell() {
  const { currentUser, logout } = useAuth();
  const { canView, permissionsLoading } = usePermissions();
  const navigate = useNavigate();

  // 権限が無い人には問い合わせない（403 が並ぶだけで何も出せない）
  const { data: spaces } = useWikiSpaces({ enabled: canView });
  const sections = useMemo(() => buildWikiSections(spaces), [spaces]);

  // 権限が無い人に白紙を出さない。何の権限が要るかを名前で出す（P3 の共通部品）
  if (!permissionsLoading && !canView) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto bg-background p-4">
        <NoPermissionPanel modules={['wiki']} target="Wiki" />
      </div>
    );
  }

  return (
    <SharedAppShell
      appKey="wiki"
      // `apps.ts` への登録は別の担当が入れる。入る前でも名前が出るように明示する
      appLabel="Wiki"
      mobileHiddenPaths={WIKI_MOBILE_HIDDEN}
      sections={sections}
      // 段A は行き先が1つしか無いので下タブを出さない（`nav.ts` の判断）
      mobileTabs={WIKI_MOBILE_TABS.length >= 2 ? WIKI_MOBILE_TABS : undefined}
      notificationSlot={<NotificationBell api={api} />}
      user={currentUser ? { name: currentUser.name, role: currentUser.role, email: currentUser.email } : null}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={currentUser?.permissions as Record<string, string> | undefined}
    >
      {/* **PC で触る画面はスマホで縮めない**（M2）。宣言は `@/pcOnlyScreens` の1つの表 */}
      <PcOnlyGate table={WIKI_PC_ONLY} onGoInstead={(to) => navigate(to)}>
        <Outlet />
      </PcOnlyGate>
    </SharedAppShell>
  );
}
