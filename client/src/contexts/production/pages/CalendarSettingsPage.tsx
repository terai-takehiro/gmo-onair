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
 * ── タブごとに要る権限が違う（レビューで直した）──────────────
 *
 * 3つのタブは**別々のサーバーの口**を叩きます:
 *
 *   部屋 / サイネージ … `/studios/*`   → `studio` の reader
 *   外部カレンダー   … `/schedule/*`  → **`partner_schedule` の editor**
 *
 * 画面全体を `studio` で括っていたため、
 * **① `studio` だけの人は外部カレンダーのタブを開けるのに中身が全部 403**、
 * **② `partner_schedule` だけの人はこの画面自体に来られない**、の2つが起きていました。
 * **タブごとに出し分け、ルートはどちらかの権限で通します**
 * （財務の「取り込み」と同じやり方 — 選べないタブは出さない）。
 *
 * ── 中身は作り替えていない ──────────────────────────────────
 *
 * 足す・直すは**今までのダイアログをそのまま開きます**
 * （`StudioRoomsManagerDialog` / `IcsFeedsDialog`）。
 * 枠の入れ替えと中身の作り直しを同じ回でやると、
 * どちらが原因で壊れたか切り分けられません。
 *
 * ── Google/Outlook の OAuth コールバックを受ける（旧「自分の予定」の吸収） ──
 *
 * 旧「自分の予定」(`/studio/my-calendar`) は v4 ネイティブUI化（バックログB）で
 * 退役したが、**サーバーの OAuth コールバック（`google-oauth.routes.ts` /
 * `ms-oauth.routes.ts`）は連携の完了後にブラウザをここへ返す** （`?tab=feed&google=…`
 * / `?tab=feed&outlook=…`）。旧画面が出していた「連携しました」の通知と、
 * 連携直後にキャッシュを読み直す処理をここへそのまま持ってきた
 * （消すと「押しても何も起きたか分からない」に戻る）。
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  feed: 'Google / Outlook のカレンダー購読。取り込んだ予定は「出すもの」の『自分』に出ます',
  sign: '部屋の前に置く表示機の URL。**URL を知っていれば誰でも開けます**',
};

export default function CalendarSettingsPage() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const { currentUser, hasPermission } = useAuth();
  // **サーバーは `requireRole('system_admin')` を掛けている**（`studio.routes.ts` の
  // `adminOnly`）。`studio` の manager に管理ボタンを出すと、押した先が 403 になる
  const canEditRooms = currentUser?.role === 'system_admin';

  // タブごとに要る権限が違う。**開けないタブは出さない**（押せば 403 になるだけ）
  const canStudio = hasPermission('sales');
  const canFeeds = hasPermission('sales', 'editor');
  const shown = TABS.filter((t) => (t.key === 'feed' ? canFeeds : canStudio));

  const raw = sp.get('tab') ?? '';
  // **開けないタブが指定されたら、開ける最初のタブに落とす。**
  // そのまま開くと中身が全部 403 になり「壊れている」と読まれる
  const tab: TabKey = (shown.some((t) => t.key === raw) ? raw : shown[0]?.key ?? 'rooms') as TabKey;

  const [roomsOpen, setRoomsOpen] = useState(false);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const [linkNotice, setLinkNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  // Google/Outlook OAuth コールバックからの戻り (`?google=linked|error` / `?outlook=linked|error`)。
  // **旧「自分の予定」(`MyCalendarPage.tsx`) が持っていた処理をそのまま移設した**
  // （サーバー側のリダイレクト先も合わせて張り替え済み）
  useEffect(() => {
    const g = sp.get('google');
    const o = sp.get('outlook');
    if (!g && !o) return;
    const provider = g ? 'Google' : 'Outlook';
    const status = g || o;
    if (status === 'linked') {
      setLinkNotice({ ok: true, msg: `${provider} カレンダーと連携しました。予定を取り込みました。` });
      qc.invalidateQueries({ queryKey: ['personal-events'] });
      qc.invalidateQueries({ queryKey: ['google-cal-status'] });
      qc.invalidateQueries({ queryKey: ['ms-cal-status'] });
    } else if (status === 'error') {
      setLinkNotice({ ok: false, msg: `${provider} とつなげませんでした。もう一度お試しください。` });
    }
    // URL からパラメータを除去（`tab` は残す）
    sp.delete('google');
    sp.delete('outlook');
    setSp(sp, { replace: true });
    // 戻ってきたときの1回だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locations = useQuery({
    queryKey: ['studio-locations'],
    queryFn: async () => (await api.get('/studios/locations')).data.data as LocationRow[],
    staleTime: 5 * 60_000,
    enabled: canStudio,
  });

  // サイネージの URL とフィードのトークンは同じ口から来る
  const feeds = useQuery({
    queryKey: ['studio-room-feeds'],
    queryFn: async () => (await api.get('/studios/rooms/feeds')).data.data as FeedsPayload,
    enabled: tab === 'sign' && canStudio,
  });

  const roomCount = (locations.data ?? []).reduce((n, l) => n + (l.rooms?.length ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader title="カレンダーの設定" sub={LEAD[tab].replace(/\*\*/g, '')} />

      {linkNotice && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            linkNotice.ok
              ? 'border-green-600/30 bg-green-50 text-green-800'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <span className="flex-1">{linkNotice.msg}</span>
          <button type="button" className="text-xs underline" onClick={() => setLinkNotice(null)}>閉じる</button>
        </div>
      )}

      {/* **タブが1つしか無い人には並びを出さない**（選べないものを選ばせない） */}
      {shown.length > 1 && (
      <FilterChips
        label="設定の種類"
        items={shown.map((t) => ({
          key: t.key,
          label: t.label,
          // **件数を出せるものだけ出す。** 出せないものに 0 を置くと「無い」と読まれる
          count: t.key === 'rooms' ? roomCount : null,
        }))}
        value={tab}
        onChange={(k) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('tab', k); return n; }, { replace: true })}
      />
      )}

      {/*
          **見られるタブが1つも無いときに、中身を描かない。**
          `partner_schedule` の reader（editor ではない）はルートを通るが
          外部カレンダーは editor 必須なので開けるタブが無い。そのまま描くと
          部屋タブに落ちて、問い合わせを止めているだけなのに
          **「部屋が登録されていません」と嘘をつく**（レビューで直した）
      */}
      {shown.length === 0 ? (
        <p className="rounded-card border border-border bg-surface-subtle p-4 text-sub text-secondary-foreground">
          この画面で開ける設定はありません。部屋とサイネージは<strong className="font-bold">カレンダーの閲覧権限</strong>、
          外部カレンダーの購読は<strong className="font-bold">パートナー予定の編集権限</strong>が要ります。
        </p>
      ) : locations.isError ? (
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
