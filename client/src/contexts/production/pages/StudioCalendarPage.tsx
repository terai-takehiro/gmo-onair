/**
 * スタジオ予約（v4・FullCalendar を撤去した回）
 *
 * ① 予定（統合カレンダー）と同じ描画部品（`calendar/`）に載せ替えた。
 * データの取り方・予約の作成/編集ダイアログ・部屋管理・カレンダー連携
 * （ICS/サイネージ）・香盤ビューは1行も変えていない — 変えたのは
 * **月・週の描き方**だけ（FullCalendar → 自前描画）。
 *
 * **予約を作る唯一の導線はこの画面のまま。** ① 予定の「部屋を押さえる」も
 * 結局この画面の `StudioBookingDialog` を呼んでいる（作り直していない）。
 *
 * **日表は香盤（部屋を縦に並べた表）のまま。** ① 予定の日表（重なりを横に
 * 割る TimeGrid）は「誰が何時にいるか」を見る形で、香盤は「その部屋が
 * いつ空くか」を見る形。目的が違うので、ここだけ TimeGrid に寄せない。
 *
 * **クリック&ドラッグでの新規作成は無くした**（① 予定と同じ判断）。
 * 「予約追加」ボタン、または香盤のマスを押す形に統一している。
 *
 * ⚠️ **案件作成画面からの「カレンダーで空きを見る」の持ち込みは扱わない。**
 * v4 でその導線は `/studio/calendar`（① 予定）へ張り替え済み
 * （`ProjectFormPage.openCalendar` を参照）。この画面へその state が
 * 来ることはもう無い
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import ProjectQuickLinks from "@/contexts/shared/components/ProjectQuickLinks";
import api from "@/lib/api";
import { invalidateBookingQueries } from "@/lib/bookingQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Filter, Settings, CalendarSync, CalendarDays } from "lucide-react";
import StudioBookingDialog from "../components/studio/StudioBookingDialog";
import StudioBookingDetailDialog from "../components/studio/StudioBookingDetailDialog";
import KoubanView from "../components/studio/KoubanView";
import StudioRoomsManagerDialog from "../components/studio/StudioRoomsManagerDialog";
// **写しを持たない。** スマホ判定は `shared/src/client-v4/mobile.ts` の1本だけ
import { useIsMobile } from "@gmo-onair/shared/src/client-v4/mobile";
import { useAuth } from "@/contexts/platform/AuthContext";
import { cn } from "@/lib/utils";
import {
  BOOKING_TYPE_COLORS, BOOKING_TYPE_LABELS, CalendarShell,
} from "../components/schedule/scheduleShared";
import {
  ymd, addDays, addMonths, startOfWeek, weekDays, type CalEvent,
} from "./calendar/calendarLayout";
import { CalToolbar, type CalView } from "./calendar/CalToolbar";
import { MonthGrid } from "./calendar/MonthGrid";
import { TimeGrid } from "./calendar/TimeGrid";
import { EventTable } from "./calendar/EventTable";
import type { Holiday } from "./calendar/useCalendarEvents";

interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
  color: string;
  sort_order: number;
  room_type: string;
}

interface StudioLocation {
  id: string;
  name: string;
  sort_order: number;
  rooms: StudioRoom[];
}

interface BookingRoom {
  room_id: string;
  room_name: string;
  room_abbreviation?: string | null;
  room_color: string;
  room_type?: string;
  location_id: string;
  occupant?: string;
  usage_note?: string;
}

// 部屋の略称取得 — abbreviation 未設定なら部屋名から先頭2文字をフォールバック
function roomShortLabel(r: BookingRoom): string {
  const abbr = r.room_abbreviation?.trim();
  if (abbr) return abbr;
  return r.room_name.slice(0, 2);
}

// 部屋略称チェイン — 4 部屋以上は省略
function buildRoomChain(rooms: BookingRoom[]): string {
  const labels = rooms.map(roomShortLabel);
  if (labels.length <= 3) return labels.join('・');
  return `${labels.slice(0, 3).join('・')} +${labels.length - 3}`;
}

interface StudioBooking {
  id: string;
  title: string;
  booking_type: string;
  project_id: string | null;
  episode_id: string | null;
  all_day: number;
  start_time: string;
  end_time: string;
  location_note: string | null;
  notes: string | null;
  project_name: string | null;
  gls_number: string | null;
  episode_code: string | null;
  status?: string;
  rooms: BookingRoom[];
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function StudioCalendarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get("project_id") || "";
  const filterProjectName = searchParams.get("project_name") || "";
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";
  const canEdit = hasPermission("studio", "editor");
  const canManage = hasPermission("studio", "manager");

  const today = ymd(new Date());
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalView>(isMobile ? "list" : "month");
  const [anchor, setAnchor] = useState(today);

  // **月・週は 375px だとマスが数ミリ角になる**（① 予定と同じ理由）。日表（香盤）も
  // 部屋を縦に並べる表なのでスマホ向きではない — スマホでは一覧だけにする
  const allowedViews: CalView[] = isMobile ? ["list"] : ["month", "week", "day", "list"];
  const pickView = (v: CalView) => setView(allowedViews.includes(v) ? v : "list");

  // Filter state
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Dialog state
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<StudioBooking | null>(null);
  const [detailBooking, setDetailBooking] = useState<StudioBooking | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [presetDate, setPresetDate] = useState<{ start: string; end: string; allDay: boolean } | null>(null);
  const [presetRoomIds, setPresetRoomIds] = useState<string[]>([]);
  const [roomsManagerOpen, setRoomsManagerOpen] = useState(false);
  const [feedsOpen, setFeedsOpen] = useState(false);

  // Fetch locations & rooms
  const { data: locationsData } = useQuery({
    queryKey: ["studio-locations"],
    queryFn: async () => (await api.get("/studios/locations")).data,
  });
  // Deduplicate locations by name (guard against seed-duplicated DB entries)
  const locations: StudioLocation[] = (() => {
    const raw: StudioLocation[] = locationsData?.data ?? [];
    const seen = new Set<string>();
    return raw.filter((loc) => {
      if (seen.has(loc.name)) return false;
      seen.add(loc.name);
      return true;
    });
  })();

  const { from, to } = useMemo(() => {
    if (view === "week") { const w = weekDays(anchor); return { from: w[0], to: `${w[6]}T23:59` }; }
    if (view === "day") return { from: anchor, to: `${anchor}T23:59` };
    const first = `${anchor.slice(0, 7)}-01`;
    return { from: addDays(startOfWeek(first), -1), to: `${addDays(addMonths(first, 1), 7)}T23:59` };
  }, [view, anchor]);

  // Fetch bookings (表示中の期間ぶん)
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ["studio-bookings", from, to, filterProjectId],
    queryFn: async () => {
      const params: Record<string, string> = { from, to };
      if (filterProjectId) params.project_id = filterProjectId;
      const res = await api.get("/studios/bookings", { params });
      return res.data.data;
    },
    placeholderData: (prev: any) => prev, // 期間移動/再取得中も前の表示を残す
  });
  const bookings: StudioBooking[] = useMemo(() => bookingsData ?? [], [bookingsData]);

  // **「直近7日の予定」は月を送っても崩れない**よう、表示中の期間とは別に
  // 常に「今日から7日間」ぶんを引く（表示中の月が別なら bookings には入っていない）
  const upcomingTo = useMemo(() => addDays(today, 6), [today]);
  const { data: upcomingData } = useQuery({
    queryKey: ["studio-bookings", "upcoming7", today, upcomingTo],
    queryFn: async () => (await api.get("/studios/bookings", { params: { from: today, to: upcomingTo } })).data.data,
  });
  const upcomingBookings: StudioBooking[] = useMemo(() => upcomingData ?? [], [upcomingData]);

  const holidays = useQuery<Holiday[]>({
    queryKey: ["calendar-holidays", from, to],
    queryFn: async () => (await api.get("/business-hours/holidays", { params: { from, to } })).data.data,
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const holidayMap = useMemo(() => new Map((holidays.data ?? []).map((h) => [h.date, h])), [holidays.data]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => {
      // 案件詳細の予約一覧も読み直す (消したのに残って見えると、もう一度消しに行くことになる)。
      // **案件の実施日も残った予約から引き直される**ので案件側も落とす (`lib/bookingQueries.ts`)
      invalidateBookingQueries(qc);
      setDetailDialogOpen(false);
    },
  });

  // カレンダーの札 (月/週/一覧で使う。日表は香盤が別に描く)
  const calEvents = useMemo<CalEvent[]>(() => {
    const events: CalEvent[] = [];
    for (const b of bookings) {
      const color = BOOKING_TYPE_COLORS[b.booking_type] || BOOKING_TYPE_COLORS.other;
      const displayTitle = b.title.replace(/^GLS[-A-Z0-9]*\s+/i, "").trim() || b.title;
      const tentative = b.status === "tentative" || b.booking_type === "hold";

      if (b.rooms.length > 0) {
        const filteredRooms = selectedRoomIds.size > 0
          ? b.rooms.filter((r) => selectedRoomIds.has(r.room_id))
          : b.rooms;
        if (filteredRooms.length === 0) continue;
        events.push({
          key: `bk-${b.id}`,
          id: b.id,
          layer: "studio",
          title: displayTitle,
          color,
          typeLabel: BOOKING_TYPE_LABELS[b.booking_type] ?? "その他",
          sub: buildRoomChain(filteredRooms),
          source: "",
          allDay: !!b.all_day,
          start: b.start_time.slice(0, 16),
          end: b.end_time.slice(0, 16),
          tentative,
        });
      } else {
        // 外現場など部屋なし。**部屋で絞っているときは出さない**（埋まり方を見る道具なので）
        if (selectedRoomIds.size > 0) continue;
        events.push({
          key: `bk-${b.id}`,
          id: b.id,
          layer: "studio",
          title: `📍 ${displayTitle}`,
          color,
          typeLabel: BOOKING_TYPE_LABELS[b.booking_type] ?? "その他",
          sub: b.location_note || "",
          source: "",
          allDay: !!b.all_day,
          start: b.start_time.slice(0, 16),
          end: b.end_time.slice(0, 16),
          tentative,
        });
      }
    }
    return events;
  }, [bookings, selectedRoomIds]);

  const step = (dir: 1 | -1) => {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addMonths(`${anchor.slice(0, 7)}-01`, dir));
  };

  const title = useMemo(() => {
    if (view === "day") return `${Number(anchor.slice(5, 7))}/${Number(anchor.slice(8))}（${DOW[new Date(`${anchor}T00:00:00`).getDay()]}）`;
    if (view === "week") {
      const w = weekDays(anchor);
      return `${Number(w[0].slice(5, 7))}/${Number(w[0].slice(8))} – ${Number(w[6].slice(5, 7))}/${Number(w[6].slice(8))}`;
    }
    return `${anchor.slice(0, 4)}年${Number(anchor.slice(5, 7))}月`;
  }, [view, anchor]);

  const open = (e: CalEvent) => {
    const booking = bookings.find((b) => b.id === e.id);
    if (booking) { setDetailBooking(booking); setDetailDialogOpen(true); }
  };

  const handleNewBooking = () => {
    setPresetDate({ start: anchor, end: anchor, allDay: false });
    setPresetRoomIds([]);
    setEditingBooking(null);
    setBookingDialogOpen(true);
  };

  const handleEditBooking = (booking: StudioBooking) => {
    setEditingBooking(booking);
    setPresetDate(null);
    setPresetRoomIds([]);
    setDetailDialogOpen(false);
    setBookingDialogOpen(true);
  };

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const clearFilter = () => setSelectedRoomIds(new Set());

  // ── 直近 7 日間の予定 (今日起点) ───────────────────────────
  const upcomingDays = useMemo(() => {
    const dateKey = (d: Date) => ymd(d);
    const days: { key: string; date: Date; label: string; isToday: boolean; isTomorrow: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${today}T00:00:00`);
      d.setDate(d.getDate() + i);
      days.push({
        key: dateKey(d),
        date: d,
        label: `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`,
        isToday: i === 0,
        isTomorrow: i === 1,
      });
    }
    const filtered = selectedRoomIds.size > 0
      ? upcomingBookings.filter((b) => (b.rooms ?? []).some((r) => selectedRoomIds.has(r.room_id)))
      : upcomingBookings;
    const map = new Map<string, StudioBooking[]>();
    days.forEach((d) => map.set(d.key, []));
    for (const b of filtered) {
      const startDay = (b.start_time || '').split('T')[0];
      const endDay = (b.end_time || startDay).split('T')[0];
      days.forEach((d) => {
        if (startDay && startDay <= d.key && d.key <= endDay) {
          map.get(d.key)!.push(b);
        }
      });
    }
    return days.map((d) => ({ ...d, items: map.get(d.key) ?? [] })).filter((d) => d.items.length > 0);
  }, [upcomingBookings, selectedRoomIds, today]);

  const totalUpcoming = upcomingDays.reduce((sum, d) => sum + d.items.length, 0);

  return (
    <CalendarShell
      current="studio"
      icon={CalendarDays}
      title="スタジオ予約"
      description="部屋・時間を選んで予約を追加します。"
      actions={
        <>
          <Button
            variant={filterOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterOpen(!filterOpen)}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">部屋</span>
            {selectedRoomIds.size > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {selectedRoomIds.size}
              </Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFeedsOpen(true)} className="gap-1">
            <CalendarSync className="h-4 w-4" />
            <span className="hidden sm:inline">カレンダー連携</span>
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setRoomsManagerOpen(true)} className="gap-1">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">部屋管理</span>
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={handleNewBooking}>
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">予約追加</span>
            </Button>
          )}
        </>
      }
    >
      {/* 案件で絞り込み中の表示 + クイックリンク */}
      {filterProjectId && (
        <div className="flex flex-wrap items-center justify-between gap-2 -mt-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              絞り込み: <span className="font-medium text-foreground">{filterProjectName}</span>
            </span>
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={() => navigate("/studio/studio-calendar")}>
              解除
            </Button>
          </div>
          <ProjectQuickLinks
            projectId={filterProjectId}
            projectName={filterProjectName}
            currentPage="calendar"
          />
        </div>
      )}

      {/* Rooms admin dialog (system_admin only) */}
      {isAdmin && (
        <StudioRoomsManagerDialog
          open={roomsManagerOpen}
          onOpenChange={setRoomsManagerOpen}
          locations={locations}
        />
      )}

      {/* Calendar feeds dialog */}
      <CalendarFeedsDialog open={feedsOpen} onOpenChange={setFeedsOpen} />

      {/* Room filter panel */}
      {filterOpen && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">部屋フィルター</span>
              {selectedRoomIds.size > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilter}>
                  クリア
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {locations.map((loc) => (
                <div key={loc.id}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{loc.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {loc.rooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => toggleRoom(room.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all border ${
                          selectedRoomIds.has(room.id)
                            ? "border-transparent text-white shadow-sm"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                        style={
                          selectedRoomIds.has(room.id)
                            ? { backgroundColor: room.color }
                            : undefined
                        }
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: room.color }}
                        />
                        {room.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 直近 7 日の予定 */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/20">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-sm font-semibold truncate">直近の予定</h2>
            <span className="text-xs text-muted-foreground shrink-0">今日から 7 日間</span>
          </div>
          {totalUpcoming > 0 && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {totalUpcoming}件
            </Badge>
          )}
        </div>
        <CardContent className="p-0">
          {totalUpcoming === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              直近 7 日間に予定はありません
            </p>
          ) : (
            <ul className="divide-y">
              {upcomingDays.map((d) => (
                <li key={d.key} className="px-3 py-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-start sm:gap-4">
                  <div className="sm:w-32 shrink-0 mb-2 sm:mb-0 flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold shrink-0",
                      d.isToday
                        ? "bg-primary text-primary-foreground"
                        : d.isTomorrow
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}>
                      {d.isToday ? '今日' : d.isTomorrow ? '明日' : ''}
                    </span>
                    <span className="text-sm font-medium tabular-nums">{d.label}</span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {d.items.map((b) => {
                      const allDay = !!b.all_day;
                      const startTime = !allDay ? b.start_time.split('T')[1]?.slice(0, 5) : '';
                      const endTime = !allDay ? b.end_time.split('T')[1]?.slice(0, 5) : '';
                      const typeColor = BOOKING_TYPE_COLORS[b.booking_type] || '#6b7280';
                      const typeLabel = BOOKING_TYPE_LABELS[b.booking_type] || b.booking_type;
                      const tentative = b.status === 'tentative';
                      const displayTitle = b.title.replace(/^GLS[-A-Z0-9]*\s+/i, '').trim() || b.title;
                      const roomChain = b.rooms.length > 0 ? buildRoomChain(b.rooms as any) : (b.location_note || '');
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => { setDetailBooking(b); setDetailDialogOpen(true); }}
                          className={cn(
                            "w-full text-left rounded-lg border-l-4 bg-card hover:bg-accent/50 transition-colors",
                            "px-3 py-2 flex items-start gap-2 sm:items-center sm:gap-3 flex-wrap sm:flex-nowrap",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            tentative && "opacity-70",
                          )}
                          style={{ borderLeftColor: typeColor }}
                        >
                          <span
                            className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shrink-0"
                            style={{ backgroundColor: typeColor }}
                          >
                            {typeLabel}
                          </span>
                          <span className="font-medium text-sm flex-1 min-w-0 truncate">{displayTitle}</span>
                          {roomChain && (
                            <span className="text-xs text-muted-foreground truncate sm:max-w-[40%]">{roomChain}</span>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-full sm:w-auto sm:ml-auto">
                            {allDay ? '終日' : `${startTime}–${endTime}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(BOOKING_TYPE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: BOOKING_TYPE_COLORS[key] }} />
            {label}
          </div>
        ))}
        <span className="ml-2 italic opacity-70">※ 斜体・薄色は未確定の予約</span>
      </div>

      <CalToolbar
        view={view} onView={pickView} title={title} views={allowedViews}
        onPrev={() => step(-1)} onNext={() => step(1)} onToday={() => setAnchor(today)}
      />

      {/* 香盤（日表・PC のみ）— 部屋を縦に並べ、埋まり方をマスで見る */}
      {!isMobile && view === "day" ? (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="flex items-center justify-end gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={() => pickView("month")}>
                月カレンダーに戻る
              </Button>
            </div>
            {bookingsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <KoubanView
                date={new Date(`${anchor}T00:00:00`)}
                locations={locations}
                bookings={bookings}
                onDateChange={(d) => setAnchor(ymd(d))}
                onBookingClick={(booking) => {
                  setDetailBooking(booking);
                  setDetailDialogOpen(true);
                }}
                onSlotClick={(roomId, start, end) => {
                  setPresetDate({ start, end, allDay: false });
                  setPresetRoomIds([roomId]);
                  setEditingBooking(null);
                  setBookingDialogOpen(true);
                }}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {bookingsLoading && bookings.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {view === "month" ? (
            <MonthGrid
              anchor={`${anchor.slice(0, 7)}-01`} today={today} events={calEvents} holidays={holidayMap}
              onPickDay={(d) => { setAnchor(d); pickView("day"); }} onOpen={open}
            />
          ) : view === "list" ? (
            <EventTable events={calEvents} holidays={holidayMap} onOpen={open} emptyHint="部屋フィルターで絞り込みすぎていないか確かめてください。月を送ると別の期間を見られます。" />
          ) : (
            <TimeGrid
              days={view === "week" ? weekDays(anchor) : [anchor]}
              today={today} now={now} events={calEvents} holidays={holidayMap}
              onOpen={open}
              onPickDay={(d) => { setAnchor(d); pickView("day"); }}
            />
          )}
        </div>
      )}

      {/* Booking Dialog */}
      <StudioBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        locations={locations}
        editingBooking={editingBooking}
        presetDate={presetDate}
        presetRoomIds={presetRoomIds}
      />

      {/* Detail Dialog */}
      <StudioBookingDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        booking={detailBooking}
        onEdit={handleEditBooking}
        canEdit={canEdit}
        canDelete={canManage}
        onDelete={(id) => {
          if (confirm("この予約を削除しますか？")) deleteMutation.mutate(id);
        }}
      />
    </CalendarShell>
  );
}

// ============================================================
// カレンダー連携ダイアログ
// ============================================================
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, CheckCircle2, RotateCcw } from "lucide-react";

interface StudioFeedsData {
  calendar_feed_url: string;
  rooms: { room_id: string; room_name: string; location_name: string; room_type: string; signage_url: string }[];
}

function CalendarFeedsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["studio-feeds"],
    queryFn: async () => (await api.get("/studios/rooms/feeds")).data.data as StudioFeedsData,
    enabled: open,
  });

  const [copied, setCopied] = useState<string | null>(null);
  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const regenerateMutation = useMutation({
    mutationFn: async () => (await api.post("/studios/rooms/feeds/regenerate-token")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio-feeds"] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSync className="h-5 w-5" />
            カレンダー連携
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-4">
          下記のURLをGoogle Calendar / Outlook に1つ追加するだけで、全部屋の予約がまとめて自動同期されます。
        </p>

        {data && (
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 border rounded-lg bg-primary/5">
            <div className="w-full sm:flex-1 min-w-0">
              <p className="text-sm font-medium">カレンダー フィードURL（全部屋・共通）</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{data.calendar_feed_url}</p>
            </div>
            <Button
              size="sm"
              variant={copied === "cal" ? "default" : "outline"}
              onClick={() => copyUrl(data.calendar_feed_url, "cal")}
              className="shrink-0 w-full sm:w-auto"
            >
              {copied === "cal" ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied === "cal" ? "コピー済" : "URLコピー"}
            </Button>
          </div>
        )}

        {/* サイネージURL一覧 (物理ディスプレイ設置用なので部屋ごと) */}
        <div className="border-t pt-4 mt-4">
          <p className="text-sm font-semibold mb-3">サイネージURL（楽屋/会議室入口用）</p>
          <p className="text-xs text-muted-foreground mb-2">タブレットやモニターのブラウザで全画面表示（部屋ごとに個別のURLです）</p>
          <div className="space-y-2">
            {(data?.rooms ?? []).map((room) => (
              <div key={`signage-${room.room_id}`} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 border rounded-lg bg-muted/30">
                <div className="w-full sm:flex-1 min-w-0">
                  <p className="text-sm font-medium">{room.location_name} — {room.room_name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{room.signage_url}</p>
                </div>
                <Button
                  size="sm"
                  variant={copied === `s-${room.room_id}` ? "default" : "outline"}
                  onClick={() => copyUrl(room.signage_url, `s-${room.room_id}`)}
                  className="shrink-0 w-full sm:w-auto"
                >
                  {copied === `s-${room.room_id}` ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied === `s-${room.room_id}` ? "コピー済" : "URLコピー"}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-4 mt-4 space-y-3">
          <p className="text-sm font-semibold">カレンダー追加方法</p>
          <div className="text-xs text-muted-foreground space-y-2">
            <div>
              <p className="font-medium text-foreground">Google Calendar</p>
              <p>設定 → 「他のカレンダー」の＋ → 「URLで追加」→ コピーしたURLを貼り付け</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Outlook</p>
              <p>予定表 → 「予定表を追加」→ 「Webから」→ コピーしたURLを貼り付け</p>
            </div>
            <p className="text-amber-600">※ 同期間隔はカレンダーアプリ側の設定に依存します（通常数時間〜24時間）</p>
          </div>
        </div>

        <div className="border-t pt-4 mt-4">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={regenerateMutation.isPending}
            onClick={() => {
              if (window.confirm("フィードトークンを再生成しますか？\n既存のカレンダー登録・サイネージ表示はすべて無効になり、上記URLを登録し直す必要があります。")) {
                regenerateMutation.mutate();
              }
            }}
          >
            {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            フィードトークンを再生成
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">
            URLが外部に漏れた場合など、緊急時のみ実行してください。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
