import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell as SharedAppShell } from '@gmo-onair/shared/src/client/shell';
import { NotificationBell } from '@gmo-onair/shared/src/client-v4/NotificationBell';
import { PcOnlyGate } from '@gmo-onair/shared/src/client-v4/pcOnly';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import api from '@/lib/api';
import { LIVE_PC_ONLY, LIVE_MOBILE_HIDDEN } from '@/pcOnlyScreens';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { buildLiveNav } from './nav';
import { LIVE_MANUAL } from '@/manual/content';

interface LiveProgram { id: string; name: string; gls_number?: string | null }

/**
 * 計時LIVE のシェル — **枠は共通** (`shared/src/client/shell/`)。
 *
 * ここに残っているのは「このアプリ固有の設定を渡すこと」だけです。
 * 高さ・スクロール・お知らせ帯・確認ダイアログ・アプリ切替・スマホの引き出しは
 * すべて共通シェルが持ちます。**メニューの項目は `nav.ts` で、中身は今までと同じ**です。
 *
 * ⚠️ **`/live/display/:timerId`（表示画面）はこのシェルを一切経由しません。**
 * `App.tsx` の `DisplayRouter` が別ルーターとして完全に分離しています
 * （このファイルは `AuthenticatedApp` 配下の運用画面だけの入れ物）。
 *
 * 旧 `Header.tsx` / `Sidebar.tsx` はここに統合したので削除しました。
 */
export default function AppShell() {
  const { currentUser, logout } = useAuth();
  const { canView, permissionsLoading } = usePermissions();
  const navigate = useNavigate();
  const { programId } = useParams<{ programId?: string }>();

  // 番組を選んでいるときは、上辺バーのパンくずに番組名 (GLS番号) を出す。
  // 旧 Header.tsx の subLabel と同じ情報。左メニューの項目名 (「ダッシュボード」等) より
  // 「いまどの番組を触っているか」のほうが実用上大事なので、crumb で明示的に上書きする。
  // ⚠️ フックは早期 return より前で無条件に呼ぶこと (react-hooks/rules-of-hooks)。
  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as LiveProgram),
    enabled: !!programId,
    staleTime: 60_000,
  });

  // 権限が無い人に白紙を出さない。何の権限が要るかを名前で出す (P3 の共通部品)
  // ⚠️ 権限区画の統合（'liveops' → 'qsheet'・migration 232）で表示する区画名を変えた
  // （usePermissions.ts と同じ理由）。
  if (!permissionsLoading && !canView) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto bg-background p-4">
        <NoPermissionPanel modules={['qsheet']} target="計時・視聴者" />
      </div>
    );
  }

  const crumb = program
    ? (program.gls_number ? `${program.gls_number} ${program.name}` : program.name)
    : undefined;

  return (
    <SharedAppShell
      appKey="liveops"
      crumb={crumb}
      mobileHiddenPaths={LIVE_MOBILE_HIDDEN}
      sections={buildLiveNav(programId)}
      notificationSlot={<NotificationBell api={api} />}
      manualContent={LIVE_MANUAL}
      user={currentUser ? { name: currentUser.name, role: currentUser.role, email: currentUser.email } : null}
      onLogout={logout}
      onSwitchUser={logout}
      role={currentUser?.role}
      permissions={currentUser?.permissions as Record<string, string> | undefined}
    >
      {/* **PC で触る画面はスマホで縮めない**（M2）。宣言は `@/pcOnlyScreens` の1つの表 */}
      <PcOnlyGate table={LIVE_PC_ONLY} onGoInstead={(to) => navigate(to)}>
        <Outlet />
      </PcOnlyGate>
    </SharedAppShell>
  );
}
