/**
 * ① 予定（v4 カレンダー・モックの1枚目）
 *
 * ── FullCalendar をやめて自分で描いた ───────────────────────
 *
 * 着手前はこの画面だけが FullCalendar でした。**v4 の月マスは 17px の帯に
 * 「3px の色棒 + 時刻 + 題名」**、週・日は重なりを横に割った角丸の札で、
 * あちらの DOM とは組み立てが違います。CSS で寄せていくと `.fc-*` に
 * 依存した規則が何十行も積み上がり、**版が上がるたびに黙って崩れます**。
 * 置き方の計算は `calendar/calendarLayout.ts` に出して、素で試せるように
 * してあります（`shared/tests/calendarLayout.test.ts` で 26 項目）。
 *
 * **旧スタジオ・パートナー・マイの3画面は FullCalendar のままです**
 * （作り直し前の画面なので、同じ回で触らない）。
 *
 * ── 「予定を入れる」を足した ────────────────────────────────
 *
 * 着手前の統合カレンダーには**新規作成が1つもありません**でした
 * （「入れるときは各カレンダーへ」と書いてあるだけ）。v4 は ① 予定が
 * 1本なので、ここから入れられないと**入れる場所が消えます**。
 * 3つは入れ方が違うので、まず何を入れるか選んでもらいます。
 *
 * ── 祝日は設定 ⑥ の表から読む ───────────────────────────────
 *
 * 着手前は画面に **2025〜2027 が直書き**されていて、2028 年になると
 * 祝日が1つも出なくなる状態でした。
 *
 * ── PC を macOS のカレンダーアプリ風に作り直した（承認済みモック） ──
 *
 * **左メニューにミニカレンダー・「マイカレンダー」（出すもの）を常設した。**
 * 別のサイドバーやツールバーのポップオーバーを試したが、
 * 「共通の左メニューにマージできないか」というご指摘で今の形に落ち着いた
 * （`calendar/CalSidebarExtras.tsx` を `shared/.../shell/sideMenuSlot.ts` の
 * 差し込み口へ portal する）。**ツールバーは今日／前後／期間の見出し／
 * 月・週・一覧の切替／予定を入れる だけ**の macOS 風の1段
 * （`calendar/DesktopToolbar.tsx`）にした。
 *
 * **「日」表示は無くした。** モックの切替は 月・週・一覧 の3つだけで、
 * マス目を押しても画面は切り替わらず「選んだ日」の印が付くだけ
 * （＝新しい予定の既定日として使う）。週の1日だけを見たいときは週表を使う。
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import api from '@/lib/api';
import { invalidateBookingQueries } from '@/lib/bookingQueries';
import { useSideMenuTopSlot } from '@gmo-onair/shared/src/client/shell/sideMenuSlot';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/platform/AuthContext';
import StudioBookingDetailDialog from '../components/studio/StudioBookingDetailDialog';
import StudioBookingDialog from '../components/studio/StudioBookingDialog';
import PartnerScheduleDialog from '../components/schedule/PartnerScheduleDialog';
import PersonalEventDialog from '../components/schedule/PersonalEventDialog';
import {
  useIsMobile, type PartnerSchedule, type PersonalEvent,
} from '../components/schedule/scheduleShared';
import { MobileToday } from './rooms/MobileToday';
import {
  ymd, addDays, addMonths, startOfWeek, weekDays, type CalLayer,
} from './calendar/calendarLayout';
import { loadLayers, saveLayers } from './calendar/layerPrefs';
import { useCalendarEvents, type CalBooking } from './calendar/useCalendarEvents';
import { DesktopToolbar, type DesktopView } from './calendar/DesktopToolbar';
import { CalSidebarExtras } from './calendar/CalSidebarExtras';
import { MonthGrid } from './calendar/MonthGrid';
import { TimeGrid } from './calendar/TimeGrid';
import { EventTable } from './calendar/EventTable';
import { SideRail } from './calendar/SideRail';
import { RoomFilterDialog, UserFilterDialog } from './calendar/FilterDialogs';
import { NewEventChooser, type NewKind } from './calendar/NewEventChooser';

const VIEW_KEY = 'unified-cal-view';
const DESKTOP_VIEWS: DesktopView[] = ['month', 'week', 'list'];

function DesktopCalendar() {
  const qc = useQueryClient();
  const location = useLocation();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === 'system_admin';
  const canStudioEdit = isAdmin || hasPermission('studio', 'editor');
  const canDeleteBooking = isAdmin || hasPermission('studio', 'manager');
  const isPartnerManager = isAdmin || hasPermission('partner_schedule', 'manager');
  const canPartnerEdit = isAdmin || hasPermission('partner_schedule', 'editor');
  const sideMenuTopSlot = useSideMenuTopSlot();

  const today = ymd(new Date());
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState<DesktopView>(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    // **旧「日」は 3 択に無い。** 前の版で保存された値が残っていても落ちないように倒す
    return (DESKTOP_VIEWS as string[]).includes(stored ?? '') ? (stored as DesktopView) : 'month';
  });
  /** 見ている位置。**月表・一覧はその月の1日を含む日、週はその週に含まれる日** */
  const [anchor, setAnchor] = useState(today);
  /** 選んでいる日。マス目の枠と「予定を入れる」の既定日に使う */
  const [selected, setSelected] = useState(today);
  /** ミニカレンダーが見ている月。本体とは緩くしか連動しない（`CalSidebarExtras` 参照） */
  const [miniAnchor, setMiniAnchor] = useState(today.slice(0, 7));
  const [layers, setLayers] = useState<Record<CalLayer, boolean>>(loadLayers);
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);

  /**
   * 案件から「カレンダーで空きを見る」で来たときの持ち込み
   * （`ProjectFormPage` が `navigate('/studio/calendar', { state })` で渡す）。
   *
   * ⚠️ **この受け口は v4 でこの画面を作り直したときに落ちていました。**
   * 送る側は残っていたので、押すと**今日の月表**が出るだけで、
   * 案件の日にも部屋にも寄らない ＝ 押しても何も起きないように見えていました。
   * 旧 `StudioCalendarPage` は同じ state で**予約ダイアログを開いて**いましたが、
   * ボタンの名前は「**空きを見る**」なので、ここでは
   * **その日・その部屋を見せる**（週表に切り替えて部屋で絞る）ところまでにします。
   * 入れるのは見てからで、上の「予定を入れる」がその口です。
   * **「日」表示を無くしたので、週表で受ける**（1日ぶんの帯より、当てにしていた
   * 部屋の1週間の空き方まで見えるほうが「空きを見る」の目的に近い）。
   */
  useEffect(() => {
    const s = location.state as {
      presetRoomIds?: string[];
      presetDate?: { start: string; end: string; allDay: boolean } | null;
    } | null;
    if (!s) return;
    if (s.presetDate?.start) {
      setAnchor(s.presetDate.start);
      setSelected(s.presetDate.start);
      setMiniAnchor(s.presetDate.start.slice(0, 7));
      setView('week');
    }
    if (s.presetRoomIds?.length) setRoomIds(s.presetRoomIds);
    // **一度きり**。消さないと、戻る・再読み込みのたびに同じ日へ引き戻される
    if (s.presetDate?.start || s.presetRoomIds?.length) {
      window.history.replaceState({}, document.title);
    }
    // 持ち込みは開いたときの1回だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [roomFilterOpen, setRoomFilterOpen] = useState(false);
  const [userFilterOpen, setUserFilterOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [newKind, setNewKind] = useState<NewKind | null>(null);
  const [detail, setDetail] = useState<CalBooking | null>(null);
  const [editSchedule, setEditSchedule] = useState<PartnerSchedule | null>(null);
  const [editEvent, setEditEvent] = useState<PersonalEvent | null>(null);

  // 引く期間。**見えている分より広く取る** — 月表は前後の月の日が並ぶので、
  // その月ちょうどで引くと端の列が空になる
  const { from, to } = useMemo(() => {
    if (view === 'week') { const w = weekDays(anchor); return { from: w[0], to: `${w[6]}T23:59` }; }
    const first = `${anchor.slice(0, 7)}-01`;
    return { from: addDays(startOfWeek(first), -1), to: `${addDays(addMonths(first, 1), 7)}T23:59` };
  }, [view, anchor]);

  const cal = useCalendarEvents(from, to, { layers, roomIds, userIds });

  const toggleLayer = (k: CalLayer) => {
    setLayers((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      saveLayers(next);
      return next;
    });
  };
  const pickView = (v: DesktopView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* 同上 */ }
  };

  /** マス目・週の見出しを押したときは**選ぶだけ**（モックの `cell.pick`）。画面は動かさない */
  const pickDay = (d: string) => setSelected(d);

  /** ミニカレンダーの日を押したときは、本体の月・週・選択日をまとめて揃える */
  const miniPick = (d: string) => {
    setSelected(d);
    setAnchor(d);
    setMiniAnchor(d.slice(0, 7));
  };

  const step = (dir: 1 | -1) => {
    if (view === 'week') setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addMonths(`${anchor.slice(0, 7)}-01`, dir));
  };

  const goToday = () => {
    setAnchor(today);
    setSelected(today);
    setMiniAnchor(today.slice(0, 7));
  };

  const title = useMemo(() => {
    if (view === 'week') {
      const w = weekDays(anchor);
      return `${Number(w[0].slice(5, 7))}/${Number(w[0].slice(8))} – ${Number(w[6].slice(5, 7))}/${Number(w[6].slice(8))}`;
    }
    return `${anchor.slice(0, 4)}年${Number(anchor.slice(5, 7))}月`;
  }, [view, anchor]);

  /** レイヤーのチェックは、その層を読む権限がある人にだけ出す（押しても効かない項目を並べない） */
  const layerVisible: Record<CalLayer, boolean> = {
    studio: cal.can.studio, partner: cal.can.partner, my: cal.can.personal,
  };

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => {
      // 案件詳細の予約一覧も読み直す（消したのに残って見えると、もう一度消しに行く）。
      // **案件の実施日も残った予約から引き直される**ので案件側も落とす（`lib/bookingQueries.ts`）
      invalidateBookingQueries(qc);
      setDetail(null);
      notifySuccess('予約を消しました');
    },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  /** 予約を作るダイアログが要る拠点と部屋の一覧 */
  const locations = useQuery({
    queryKey: ['studio-locations'],
    queryFn: async () => (await api.get('/studios/locations')).data.data,
    staleTime: 5 * 60_000,
    enabled: cal.can.studio,
  });

  const open = (key: string) => {
    const [kind, ...rest] = key.split('-');
    const id = rest.join('-');
    if (kind === 'bk') { const b = cal.bookings.find((x) => x.id === id); if (b) setDetail(b); }
    if (kind === 'ps') { const s = cal.partners.find((x) => x.id === id); if (s) setEditSchedule(s); }
    if (kind === 'pe') { const e = cal.mine.find((x) => x.id === id); if (e) setEditEvent(e); }
  };

  return (
    <div className="flex flex-col">
      {/*
        左メニューの上への差し込み（`sideMenuTopSlot`）。差し込み口がまだ無い
        （シェルの外・初回描画）ときは何も描かない — `usePrimaryActionSlot` と同じ約束
      */}
      {sideMenuTopSlot && createPortal(
        <CalSidebarExtras
          miniAnchor={miniAnchor} onMiniAnchor={setMiniAnchor}
          today={today} selected={selected} onPick={miniPick}
          layers={layers} onToggleLayer={toggleLayer} visible={layerVisible}
        />,
        sideMenuTopSlot,
      )}

      {/* **`<main>` 自体がスクロール領域**（共通シェル）。ここは `sticky` で上端に留める
          だけにする — 固定の高さを自分で作ると、シェルの高さの持ち方（`h-full` の連鎖）
          が変わった日に静かに崩れる（`NoticeBar` と同じやり方） */}
      <div className="sticky top-0 z-10 bg-card">
        <DesktopToolbar
          view={view} onView={pickView} title={title}
          onPrev={() => step(-1)} onNext={() => step(1)} onToday={goToday}
          onAdd={() => setChooserOpen(true)} canAdd={canStudioEdit || canPartnerEdit}
          roomCount={roomIds.length} userCount={userIds.length}
          onPickRooms={() => setRoomFilterOpen(true)} onPickUsers={() => setUserFilterOpen(true)}
          onClearFilters={() => { setRoomIds([]); setUserIds([]); }}
        />
      </div>

      <div className="flex flex-col gap-3.5 p-3 lg:p-6">
        {cal.isError && <ErrorPanel title="予定を読み込めませんでした" error={cal.error} onRetry={cal.refetch} />}

        <div className="flex flex-col items-start gap-3.5 lg:flex-row">
          <div className="min-w-0 flex-1">
            {cal.isLoading && cal.events.length === 0 ? (
              <Delayed><SkeletonRows rows={8} /></Delayed>
            ) : view === 'month' ? (
              <MonthGrid
                anchor={`${anchor.slice(0, 7)}-01`} today={today} selected={selected}
                events={cal.events} holidays={cal.holidays}
                onPickDay={pickDay} onOpen={(e) => open(e.key)}
              />
            ) : view === 'list' ? (
              <EventTable events={cal.events} holidays={cal.holidays} onOpen={(e) => open(e.key)} />
            ) : (
              <TimeGrid
                days={weekDays(anchor)}
                today={today} now={now} events={cal.events} holidays={cal.holidays}
                onOpen={(e) => open(e.key)}
                onPickDay={pickDay}
              />
            )}
          </div>

          <SideRail today={today} events={cal.events} canStudio={cal.can.studio} onOpen={(e) => open(e.key)} />
        </div>
      </div>

      <RoomFilterDialog open={roomFilterOpen} onOpenChange={setRoomFilterOpen} value={roomIds} onChange={setRoomIds} />
      <UserFilterDialog open={userFilterOpen} onOpenChange={setUserFilterOpen} value={userIds} onChange={setUserIds} />

      <NewEventChooser
        open={chooserOpen} onOpenChange={setChooserOpen}
        allow={{ room: canStudioEdit, mine: canPartnerEdit, partner: canPartnerEdit }}
        onPick={setNewKind}
      />

      {/* 部屋を押さえる。**既存のダイアログをそのまま呼ぶ**（入れ方の作り直しは別の回） */}
      <StudioBookingDialog
        open={newKind === 'room'}
        onOpenChange={(v) => !v && setNewKind(null)}
        locations={locations.data ?? []}
        editingBooking={null}
        presetDate={{ start: selected, end: selected, allDay: false }}
      />

      <PartnerScheduleDialog
        open={newKind === 'partner' || !!editSchedule}
        onOpenChange={(v) => { if (!v) { setNewKind(null); setEditSchedule(null); } }}
        editing={editSchedule}
        presetRange={editSchedule ? null : { start: selected, end: selected }}
        isManager={isPartnerManager}
      />

      <PersonalEventDialog
        open={newKind === 'mine' || !!editEvent}
        onOpenChange={(v) => { if (!v) { setNewKind(null); setEditEvent(null); } }}
        editing={editEvent}
        presetRange={editEvent ? null : { start: selected, end: selected, allDay: false }}
      />

      {/* スタジオ予約は**読むだけ**。直すのはスタジオカレンダー（作る導線がそこにある） */}
      <StudioBookingDetailDialog
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        booking={detail as never}
        onEdit={() => { /* この画面では直さない */ }}
        onDelete={(id) => confirmAction({
          title: 'この予約を消しますか',
          description: '押さえていた部屋が空きになります。取り消せません。',
          confirmLabel: '消す', tone: 'danger',
        }).then((ok) => ok && del.mutate(id))}
        canEdit={false}
        canDelete={canDeleteBooking}
      />
    </div>
  );
}

/**
 * スマホと PC で**別の画面**を出す（Phase 6・M3）。
 *
 * 月表は 375px で1日ぶんの升が数ミリ角になります。現場で見たいのは
 * 「**今日、何がどこであるか**」だけなので、その日ぶんの縦並びにします
 * （モックの ⑬ 今日の予約）。
 *
 * **早期 return にしないこと** — 同じ部品の中で切り替えると、幅が変わったときに
 * フックの数が変わって React が落ちます。ここは「どちらを描くか決めるだけ」。
 */
export default function UnifiedCalendarPage() {
  return useIsMobile() ? <MobileToday /> : <DesktopCalendar />;
}
