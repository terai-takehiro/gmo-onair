/**
 * ① 予定（スマホ・iPhone のカレンダーに寄せたモック）
 *
 * ── 月表に戻した ─────────────────────────────────────────────
 *
 * 旧実装は「その日ぶんの縦並び」でした（FullCalendar の月表示が 375px では
 * 数ミリ角になるため）。**v4 は自分で描くので、その制約が無くなりました**。
 * モック（承認済み）は **数字＋点だけの月マス**（文字を入れない）で崩れず、
 * PC の①予定と**同じ3層**（スタジオ・パートナー・自分）を重ねます。
 * 置き方の計算・「出すもの」の記憶（`layerPrefs.ts`）は PC と共有します
 * （分けると「PCで外したはずのものがスマホでは出たまま」になる）。
 *
 * ── 月/週の切替を足した ──────────────────────────────────────
 *
 * ここまでは月表しか無く、「幅が狭くなると日しか見えない」というご指摘が
 * あった。実際には月表＋その日のアジェンダは出ていたが、**週だけを見たい
 * ときの手段がどこにも無かった**（PCの週表に相当するものが無い）。
 * `MobileCalHeader.tsx` に切替を足し、選んだときだけ `MobileWeekStrip.tsx`
 * （月表と同じ「数字＋点」だが7日ぶんを横1列）に差し替える。アジェンダ側
 * （選んだ日の中身）は月表のときと完全に同じもの — 表示形式が変わるのは
 * 上の帯だけ。
 *
 * ── 「予定を入れる」を足した ────────────────────────────────
 *
 * 旧実装は「入力欄が十数個ある」ことを理由にスマホでは予約を作らせず、
 * 「部屋の空き」へ送るだけでした。`StudioBookingDialog` を確かめ直すと
 * `maxHeight: calc(92dvh - 56px)` でスマホでも中がスクロールする作りだった
 * ため、PC の①予定と同じ `NewEventChooser` → 3つのダイアログをそのまま使います。
 * **「部屋の空きを見る」だけは残す**（部屋 × 時間を並べて空きを探す画面は
 * PC専用のままなので、ここから行き先を示す）。
 *
 * ── ⑩ 今日の現場 はこの1枚に畳んだまま ─────────────────────
 *
 * 機材の出庫・返却は選んだ日に連動させ、以前と同じく `equipment` の権限が
 * ある人にだけ出します（無い人に空の枠を出すと「今日は出庫が無い」と読める）。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, PackageOpen, Undo2 } from 'lucide-react';
import api from '@/lib/api';
import { invalidateBookingQueries } from '@/lib/bookingQueries';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import StudioBookingDetailDialog from '../../components/studio/StudioBookingDetailDialog';
import StudioBookingDialog from '../../components/studio/StudioBookingDialog';
import PartnerScheduleDialog from '../../components/schedule/PartnerScheduleDialog';
import PersonalEventDialog from '../../components/schedule/PersonalEventDialog';
import type { PartnerSchedule, PersonalEvent } from '../../components/schedule/scheduleShared';
import {
  ymd, addDays, addMonths, startOfWeek, weekDays, eventsOn, sortForList, timeLabel, type CalLayer,
} from '../calendar/calendarLayout';
import { loadLayers, saveLayers } from '../calendar/layerPrefs';
import { useCalendarEvents, type CalBooking } from '../calendar/useCalendarEvents';
import { openDeadline } from '../calendar/taskLayer';
import { MobileMonthGrid } from '../calendar/MobileMonthGrid';
import { MobileWeekStrip } from '../calendar/MobileWeekStrip';
import { MobileCalHeader, type MobileCalView } from '../calendar/MobileCalHeader';
import { LayerFilterDialog } from '../calendar/FilterDialogs';
import { NewEventChooser, type NewKind } from '../calendar/NewEventChooser';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
/** 月/週の選び方を覚える鍵。PC の `unified-cal-view` とは別（画面が別なので値も別） */
const MOBILE_VIEW_KEY = 'unified-cal-view-mobile';

/** 機材の出庫・返却 */
interface Lending {
  id: string;
  equipment_name?: string | null;
  eq_code?: string | null;
  unit_number?: string | null;
  project_name?: string | null;
  gls_number?: string | null;
  borrower_name?: string | null;
  planned_out_date?: string | null;
  due_date?: string | null;
}

export function MobileToday() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === 'system_admin';
  const canStudioEdit = isAdmin || hasPermission('sales', 'editor');
  const canDeleteBooking = isAdmin || hasPermission('sales', 'manager');
  const isPartnerManager = isAdmin || hasPermission('sales', 'manager');
  const canPartnerEdit = isAdmin || hasPermission('sales', 'editor');
  const canEquipment = hasPermission('equipment');

  const today = ymd(new Date());
  const [anchor, setAnchor] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [layers, setLayers] = useState<Record<CalLayer, boolean>>(loadLayers);
  const [view, setView] = useState<MobileCalView>(() => (
    localStorage.getItem(MOBILE_VIEW_KEY) === 'week' ? 'week' : 'month'
  ));

  const [layerFilterOpen, setLayerFilterOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [newKind, setNewKind] = useState<NewKind | null>(null);
  const [detail, setDetail] = useState<CalBooking | null>(null);
  const [editSchedule, setEditSchedule] = useState<PartnerSchedule | null>(null);
  const [editEvent, setEditEvent] = useState<PersonalEvent | null>(null);
  // **旧スタジオカレンダー（退役済み）が持っていた「既存の部屋予約を直す唯一の導線」を
  // スマホ側にも吸収した**（PC の `UnifiedCalendarPage.tsx` と同じ形）
  const [editBooking, setEditBooking] = useState<CalBooking | null>(null);

  // 月表は前後の月の日が並ぶので、その月ちょうどで引くと端の列が空になる（PC と同じ理由）。
  // 週表は選んだ週の7日だけでよい（PC の週表と同じ絞り方・`UnifiedCalendarPage.tsx`）
  const { from, to } = useMemo(() => {
    if (view === 'week') {
      const w = weekDays(selected);
      return { from: w[0], to: `${w[6]}T23:59` };
    }
    const first = `${anchor}-01`;
    return { from: addDays(startOfWeek(first), -1), to: `${addDays(addMonths(first, 1), 7)}T23:59` };
  }, [view, anchor, selected]);

  const cal = useCalendarEvents(from, to, { layers, roomIds: [], userIds: [] });

  const toggleLayers = (next: Record<CalLayer, boolean>) => {
    setLayers(next);
    saveLayers(next);
  };

  const pickView = (v: MobileCalView) => {
    setView(v);
    try { localStorage.setItem(MOBILE_VIEW_KEY, v); } catch { /* 保存できなくても切替は効かせる */ }
  };

  const pickDay = (d: string) => { setSelected(d); setAnchor(d.slice(0, 7)); };
  const stepMonth = (dir: 1 | -1) => setAnchor(addMonths(`${anchor}-01`, dir).slice(0, 7));
  /** 週送り。**`anchor`（月）も追随させる** — 週をまたいで月が変わったのに
   *  月表へ戻したときだけ前の月が出る、という食い違いを防ぐ */
  const stepWeek = (dir: 1 | -1) => {
    const d = addDays(selected, dir * 7);
    setSelected(d);
    setAnchor(d.slice(0, 7));
  };

  const monthTitle = `${anchor.slice(0, 4)}年${Number(anchor.slice(5, 7))}月`;
  const weekTitle = useMemo(() => {
    const w = weekDays(selected);
    return `${Number(w[0].slice(5, 7))}/${Number(w[0].slice(8))} – ${Number(w[6].slice(5, 7))}/${Number(w[6].slice(8))}`;
  }, [selected]);

  const selLabel = useMemo(() => {
    const dow = DOW[new Date(`${selected}T00:00:00`).getDay()];
    return `${Number(selected.slice(5, 7))}月${Number(selected.slice(8))}日（${dow}）${selected === today ? '・今日' : ''}`;
  }, [selected, today]);

  const dayList = useMemo(() => sortForList(eventsOn(cal.events, selected)), [cal.events, selected]);

  /**
   * 3つの登録ダイアログへ渡す preset は**同一性を保つ**（`useMemo`）。
   *
   * インラインの `{...}` で書くと毎レンダー新しいオブジェクトになり、3つのダイアログが
   * どれも preset を初期化 `useEffect` の依存配列に入れているため、**背後のクエリが
   * 解決するたびに入力中のフォームが黙って白紙に戻る**。
   * PC 側（`pages/calendar/useCalendarEdit.ts`）は同じ理由で既に `useMemo` に
   * 包んであり、スマホのこの画面だけ対策が漏れていた。
   */
  const studioPreset = useMemo(() => ({ start: selected, end: selected, allDay: false }), [selected]);
  const partnerPreset = useMemo(() => ({ start: selected, end: selected }), [selected]);
  const personalPreset = useMemo(() => ({ start: selected, end: selected, allDay: false }), [selected]);

  /** その層を読む権限があるか（「出すもの」のダイアログも件数の脚注も同じ表を見る） */
  const layerVisible: Record<CalLayer, boolean> = {
    studio: cal.can.studio, partner: cal.can.partner, my: cal.can.personal, tasks: cal.can.tasks,
  };

  const lead = useMemo(() => {
    const show: Record<CalLayer, boolean> = {
      studio: cal.can.studio, partner: cal.can.partner, my: cal.can.personal, tasks: cal.can.tasks,
    };
    const keys: CalLayer[] = ['studio', 'partner', 'my', 'tasks'];
    const on = keys.filter((k) => show[k] && layers[k]).length;
    const all = keys.filter((k) => show[k]).length;
    return `${cal.events.length} 件 ・ 出しているもの ${on}／${all}`;
  }, [cal.events, cal.can, layers]);

  /** 予約を作るダイアログが要る拠点と部屋の一覧（PC と同じ） */
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
    // 期限は案件のタスクタブ（sales を開ける人）か /daily/tasks へ（taskLayer.ts）
    if (kind === 'tk') openDeadline(navigate, cal.can.studio, cal.deadlines.find((x) => x.id === id));
  };

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => {
      invalidateBookingQueries(qc);
      setDetail(null);
      notifySuccess('予約を削除しました');
    },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  /** その日に出す機材と、その日に返る機材。選んだ日に連動させる */
  const eq = useQuery({
    queryKey: ['equipment-lendings', 'day', selected],
    enabled: canEquipment,
    queryFn: async () => {
      const [planned, lent] = await Promise.all([
        api.get('/equipment/lendings', { params: { status: 'planned' } }),
        api.get('/equipment/lendings', { params: { status: 'lent' } }),
      ]);
      const out = (planned.data.data as Lending[]).filter((r) => (r.planned_out_date ?? '').slice(0, 10) === selected);
      const back = (lent.data.data as Lending[]).filter((r) => (r.due_date ?? '').slice(0, 10) === selected);
      return { out, back };
    },
  });

  return (
    <div className="flex flex-col gap-3 p-3">
      <PageHeader
        title="予定"
        sub={`スタジオの予約・パートナーの予定・自分の予定・タスクの期限を1枚で見ます。${lead}`}
        primaryAction={(canStudioEdit || canPartnerEdit) ? (
          <Button onClick={() => setChooserOpen(true)}>予定を入れる</Button>
        ) : undefined}
      />

      <MobileCalHeader
        view={view} onView={pickView}
        title={view === 'week' ? weekTitle : monthTitle}
        onPrev={() => (view === 'week' ? stepWeek(-1) : stepMonth(-1))}
        onNext={() => (view === 'week' ? stepWeek(1) : stepMonth(1))}
        onToday={() => pickDay(today)}
        onLayers={() => setLayerFilterOpen(true)}
      />

      {cal.isError ? (
        <ErrorPanel title="予定を読み込めませんでした" error={cal.error} onRetry={cal.refetch} />
      ) : view === 'week' ? (
        <MobileWeekStrip
          days={weekDays(selected)} today={today} selected={selected}
          events={cal.events} holidays={cal.holidays} onPickDay={pickDay}
        />
      ) : (
        <MobileMonthGrid
          anchor={`${anchor}-01`} today={today} selected={selected}
          events={cal.events} holidays={cal.holidays} onPickDay={pickDay}
        />
      )}

      <div className="h-px bg-border" />

      <h2 className="text-cardtitle">{selLabel}</h2>

      {cal.isLoading && cal.events.length === 0 ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : dayList.length === 0 ? (
        <EmptyState title="この日の予定はありません" description="上の「今日」で今日に戻れます。上のアイコンから「出すもの」を選べます。" />
      ) : (
        <ul className="v4-card-in flex flex-col gap-2">
          {dayList.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                onClick={() => open(e.key)}
                className={cn(
                  'rounded-note flex w-full items-start gap-2.5 border bg-card p-3 text-left [overflow-wrap:anywhere]',
                  e.tentative ? 'border-dashed' : 'border-border',
                )}
                style={{ borderColor: e.tentative ? e.color : undefined }}
              >
                <span className="w-[3px] shrink-0 self-stretch rounded-chip" style={{ backgroundColor: e.color }} />
                <span className="text-note w-16 shrink-0 pt-px font-bold text-muted-foreground">
                  {timeLabel(e)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-list block">{e.title}</span>
                  {e.sub && <span className="text-note mt-0.5 block text-muted-foreground">{e.sub}</span>}
                </span>
                {e.typeLabel && (
                  <span
                    className="text-badge shrink-0 rounded-badge px-1.5 py-0.5 font-bold"
                    style={{ backgroundColor: `${e.color}1a`, color: e.color }}
                  >
                    {e.typeLabel}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* **読めなかったことは黙らない。** 何も出さないと「今日は出庫なし」と読める */}
      {canEquipment && eq.isError && (
        <ErrorPanel title="機材の出し入れを読み込めませんでした" error={eq.error} onRetry={() => eq.refetch()} />
      )}
      {canEquipment && (eq.data?.out.length || eq.data?.back.length) ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sub font-bold">機材の出し入れ</h2>
          {eq.data.out.map((r) => (
            <EqRow key={r.id} row={r} kind="out" />
          ))}
          {eq.data.back.map((r) => (
            <EqRow key={r.id} row={r} kind="back" />
          ))}
        </section>
      ) : null}

      <Button variant="outline" onClick={() => navigate('/calendar/rooms')}>
        <DoorOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />部屋の空きを見る
      </Button>

      <LayerFilterDialog
        open={layerFilterOpen} onOpenChange={setLayerFilterOpen}
        value={layers} onChange={toggleLayers} visible={layerVisible}
      />

      <NewEventChooser
        open={chooserOpen} onOpenChange={setChooserOpen}
        allow={{ room: canStudioEdit, mine: canPartnerEdit, partner: canPartnerEdit }}
        onPick={setNewKind}
      />

      <StudioBookingDialog
        open={newKind === 'room' || !!editBooking}
        onOpenChange={(v) => { if (!v) { setNewKind(null); setEditBooking(null); } }}
        locations={locations.data ?? []}
        editingBooking={editBooking as never}
        presetDate={studioPreset}
      />

      <PartnerScheduleDialog
        open={newKind === 'partner' || !!editSchedule}
        onOpenChange={(v) => { if (!v) { setNewKind(null); setEditSchedule(null); } }}
        editing={editSchedule}
        presetRange={editSchedule ? null : partnerPreset}
        isManager={isPartnerManager}
      />

      <PersonalEventDialog
        open={newKind === 'mine' || !!editEvent}
        onOpenChange={(v) => { if (!v) { setNewKind(null); setEditEvent(null); } }}
        editing={editEvent}
        presetRange={editEvent ? null : personalPreset}
      />

      {/* **旧スタジオカレンダーの退役に伴い、ここが「既存の部屋予約を編集する唯一の導線」になった** */}
      <StudioBookingDetailDialog
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        booking={detail as never}
        onEdit={(b) => { setDetail(null); setEditBooking(b as never); }}
        onDelete={(id) => confirmAction({
          title: 'この予約を削除しますか',
          description: '押さえていた部屋が空きになります。取り消せません。',
          confirmLabel: '削除', tone: 'danger',
        }).then((ok) => ok && del.mutate(id))}
        canEdit={canStudioEdit}
        canDelete={canDeleteBooking}
      />
    </div>
  );
}

/**
 * 出庫予定 / 返却期限の1行。
 * **時刻を書かない** — どちらも日付だけの値なので、書くと嘘になる。
 */
function EqRow({ row, kind }: { row: Lending; kind: 'out' | 'back' }) {
  const Icon = kind === 'out' ? PackageOpen : Undo2;
  return (
    <div className="rounded-card flex items-start gap-3 border border-border bg-card p-3.5">
      <span className="w-[52px] shrink-0">
        <span className="text-note flex items-center gap-1 font-bold text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {kind === 'out' ? '出庫' : '返却'}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-list block [overflow-wrap:anywhere]">
          {row.equipment_name || row.eq_code || '（名前なし）'}
          {row.unit_number ? ` #${row.unit_number}` : ''}
        </span>
        <span className="text-note mt-0.5 block text-muted-foreground">
          {[row.eq_code, row.gls_number, row.project_name, row.borrower_name]
            .filter(Boolean).join(' ／ ') || '案件の指定なし'}
        </span>
      </span>
    </div>
  );
}
