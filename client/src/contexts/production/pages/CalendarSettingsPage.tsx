/**
 * ④ 設定（カレンダー・v4）
 *
 * ── ダイアログの中に隠れていたものを1枚に出した ──────────────
 *
 * 部屋の管理も外部カレンダーの購読も**動く仕組みは既にあります**。
 * ただしどちらも**カレンダー画面の中のダイアログ**で、
 * 「設定を見たい」と思って開ける場所がありませんでした
 * （サイネージの URL に至っては、どこから取るのか誰も知らない状態でした）。
 *
 * モックの ④ のとおり **部屋 / 外部カレンダー / サイネージ の3タブ**にして、
 * 左メニューから直接来られるようにします。
 *
 * ── 中身は作り替えていない ──────────────────────────────────
 *
 * 足す・直すは**今までのダイアログをそのまま開きます**
 * （`StudioRoomsManagerDialog` / `IcsFeedsDialog`）。
 * 枠の入れ替えと中身の作り直しを同じ回でやると、
 * どちらが原因で壊れたか切り分けられません。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { DoorOpen, CalendarSync, Monitor } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/contexts/platform/AuthContext';
import StudioRoomsManagerDialog from '../components/studio/StudioRoomsManagerDialog';
import IcsFeedsDialog from '../components/schedule/IcsFeedsDialog';
import { RoomsTab } from './calendarSettings/RoomsTab';
import { FeedsTab } from './calendarSettings/FeedsTab';
import { SignageTab } from './calendarSettings/SignageTab';
import type { FeedsPayload, LocationRow } from './calendarSettings/types';

const TABS = [
  { key: 'rooms', label: '部屋', icon: DoorOpen },
  { key: 'feed', label: '外部カレンダー', icon: CalendarSync },
  { key: 'sign', label: 'サイネージ', icon: Monitor },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const LEAD: Record<TabKey, string> = {
  rooms: '拠点・部屋・略称・色。予定の帯と「部屋の空き」の並びはここから作られます',
  feed: 'Google / Outlook / ICS の購読。取り込んだ予定は「自分」のレイヤーに出ます',
  sign: '部屋の前に置く表示機の URL。**URL を知っていれば誰でも開けます**',
};

export default function CalendarSettingsPage() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab') ?? '';
  const tab: TabKey = (TABS.some((t) => t.key === raw) ? raw : 'rooms') as TabKey;
  const { currentUser } = useAuth();
  // **サーバーは `requireRole('system_admin')` を掛けている**（`studio.routes.ts` の
  // `adminOnly`）。`studio` の manager に管理ボタンを出すと、押した先が 403 になる
  const canEditRooms = currentUser?.role === 'system_admin';

  const [roomsOpen, setRoomsOpen] = useState(false);
  const [feedsOpen, setFeedsOpen] = useState(false);

  const locations = useQuery({
    queryKey: ['studio-locations'],
    queryFn: async () => (await api.get('/studios/locations')).data.data as LocationRow[],
    staleTime: 5 * 60_000,
  });

  // サイネージの URL とフィードのトークンは同じ口から来る
  const feeds = useQuery({
    queryKey: ['studio-room-feeds'],
    queryFn: async () => (await api.get('/studios/rooms/feeds')).data.data as FeedsPayload,
    enabled: tab === 'sign',
  });

  const roomCount = (locations.data ?? []).reduce((n, l) => n + (l.rooms?.length ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader title="カレンダーの設定" sub={LEAD[tab].replace(/\*\*/g, '')} />

      <FilterChips
        label="設定の種類"
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          // **件数を出せるものだけ出す。** 出せないものに 0 を置くと「無い」と読まれる
          count: t.key === 'rooms' ? roomCount : null,
        }))}
        value={tab}
        onChange={(k) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('tab', k); return n; }, { replace: true })}
      />

      {locations.isError ? (
        <ErrorPanel title="設定を読み込めませんでした" error={locations.error} onRetry={() => locations.refetch()} />
      ) : (
        <>
          {tab === 'rooms' && (
            <RoomsTab
              locations={locations.data ?? []}
              loading={locations.isLoading}
              canEdit={canEditRooms}
              onManage={() => setRoomsOpen(true)}
            />
          )}
          {tab === 'feed' && <FeedsTab onManage={() => setFeedsOpen(true)} />}
          {tab === 'sign' && (
            <SignageTab
              data={feeds.data}
              loading={feeds.isLoading}
              error={feeds.error}
              onRetry={() => feeds.refetch()}
            />
          )}
        </>
      )}

      {roomsOpen && <StudioRoomsManagerDialog open onOpenChange={setRoomsOpen} locations={locations.data ?? []} />}
      {feedsOpen && <IcsFeedsDialog open onOpenChange={setFeedsOpen} />}
    </div>
  );
}
