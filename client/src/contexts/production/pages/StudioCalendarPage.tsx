import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import api from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Filter } from "lucide-react";
import type { DatesSetArg, EventClickArg, DateSelectArg } from "@fullcalendar/core";
import StudioBookingDialog from "../components/studio/StudioBookingDialog";
import StudioBookingDetailDialog from "../components/studio/StudioBookingDetailDialog";
import KoubanView from "../components/studio/KoubanView";
import StudioRoomsManagerDialog from "../components/studio/StudioRoomsManagerDialog";
import { useAuth } from "@/contexts/platform/AuthContext";
import { Settings, CalendarSync } from "lucide-react";

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
  room_color: string;
  room_type?: string;
  location_id: string;
  occupant?: string;
  usage_note?: string;
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
  project_event_end?: string | null;
  status?: string;
  rooms: BookingRoom[];
}

const bookingTypeColors: Record<string, string> = {
  performance: "#dc2626",   // 本番: 最も目立つ鮮やかな赤
  rehearsal: "#f59e0b",
  hold: "#3b82f6",
  consultation: "#10b981",
  maintenance: "#64748b",   // メンテ: 落ち着いたグレー（本番と区別）
  tour: "#8b5cf6",
  internal: "#0891b2",
  setup: "#d97706",         // 設営/準備: オレンジ
  other: "#6b7280",
};

const bookingTypeLabels: Record<string, string> = {
  performance: "本番",
  rehearsal: "リハーサル",
  hold: "仮押さえ",
  consultation: "相談",
  maintenance: "メンテナンス",
  tour: "内覧",
  internal: "社内利用",
  setup: "設営/準備",
  other: "その他",
};

// 日本の祝日 (2025–2026)
const JP_HOLIDAYS = new Set([
  "2025-01-01","2025-01-13","2025-02-11","2025-02-23","2025-02-24",
  "2025-03-20","2025-04-29","2025-05-03","2025-05-04","2025-05-05",
  "2025-05-06","2025-07-21","2025-08-11","2025-09-15","2025-09-21",
  "2025-09-22","2025-09-23","2025-10-13","2025-11-03","2025-11-23",
  "2025-11-24","2026-01-01","2026-01-12","2026-02-11","2026-02-23",
  "2026-03-20","2026-04-29","2026-05-03","2026-05-04","2026-05-05",
  "2026-05-06","2026-07-20","2026-08-11","2026-09-21","2026-09-22",
  "2026-09-23","2026-10-12","2026-11-03","2026-11-23",
]);

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function StudioCalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const calendarRef = useRef<any>(null);

  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split("T")[0],
  });

  // モバイル/デスクトップ切り替え時にビューを変更
  useEffect(() => {
    const api = calendarRef.current?.getApi?.();
    if (!api) return;
    const currentView = api.view.type;
    if (isMobile && currentView === "dayGridMonth") {
      api.changeView("listWeek");
    } else if (!isMobile && (currentView === "listWeek" || currentView === "listMonth")) {
      api.changeView("dayGridMonth");
    }
  }, [isMobile]);

  // Track current FullCalendar view to prevent resets
  const [currentView, setCurrentView] = useState<string>(isMobile ? "listWeek" : "dayGridMonth");
  // Track current date for 香盤 view
  const [koubanDate, setKoubanDate] = useState<Date>(new Date());

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
  const [presetProjectId, setPresetProjectId] = useState<string>("");
  const [roomsManagerOpen, setRoomsManagerOpen] = useState(false);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";
  const canEdit = hasPermission("studio", "editor");
  const canManage = hasPermission("studio", "manager");

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
  // Fetch bookings
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ["studio-bookings", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await api.get("/studios/bookings", {
        params: { from: dateRange.from, to: dateRange.to },
      });
      return res.data.data;
    },
  });

  // Fetch project calendar events (existing)
  const { data: projectEventsData } = useQuery({
    queryKey: ["calendar-events", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await api.get("/calendar/events", {
        params: { from: dateRange.from, to: dateRange.to },
      });
      return res.data.data;
    },
  });

  const bookings: StudioBooking[] = bookingsData ?? [];

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-bookings"] });
      setDetailDialogOpen(false);
    },
  });

  // Calendar events
  const calendarEvents = useMemo(() => {
    const events: any[] = [];
    const isMonthView = currentView === "dayGridMonth";

    // Studio bookings
    for (const b of bookings) {
      const typeColor = bookingTypeColors[b.booking_type] || "#6b7280";
      const isTentative = b.status === "tentative";
      const tentativeClass = isTentative ? ["tentative-booking"] : [];

      const toTimedRange = (startStr: string, endStr: string, isAllDay: boolean) => {
        if (!isAllDay) return { start: startStr, end: endStr, allDay: false };
        // FullCalendarのend日付はexclusive（表示上は end-1 が最終日）
        // ローカル日付演算で+1日（toISOString()のUTC変換によるズレを防ぐ）
        const [ey, em, ed] = endStr.split("T")[0].split("-").map(Number);
        const next = new Date(ey, em - 1, ed + 1);
        const pad2 = (n: number) => String(n).padStart(2, "0");
        const exclusiveEnd = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
        return { start: startStr.split("T")[0], end: exclusiveEnd, allDay: true };
      };
      const { start: evStart, end: evEnd, allDay: evAllDay } = toTimedRange(b.start_time, b.end_time, !!b.all_day);
      const useTypeColor = ["performance", "rehearsal", "maintenance", "tour", "setup"].includes(b.booking_type);

      const dateSuffix = b.project_event_end ? ` (${formatShortDate(b.project_event_end)})` : "";

      if (b.rooms.length > 0) {
        // 月間ビュー: 案件単位で1イベントにまとめる
        const filteredRooms = selectedRoomIds.size > 0
          ? b.rooms.filter((r) => selectedRoomIds.has(r.room_id))
          : b.rooms;
        if (filteredRooms.length === 0) continue;

        if (isMonthView) {
          const color = useTypeColor ? typeColor : filteredRooms[0].room_color;
          events.push({
            id: `booking-${b.id}`,
            title: `${b.title}${dateSuffix}`,
            start: evStart,
            end: evEnd,
            allDay: evAllDay,
            backgroundColor: color,
            borderColor: color,
            textColor: "#ffffff",
            classNames: tentativeClass,
            extendedProps: { kind: "booking", bookingId: b.id, bookingType: b.booking_type },
          });
        } else {
          // 週/日ビュー: 部屋ごとに個別表示
          for (const room of filteredRooms) {
            const color = useTypeColor ? typeColor : room.room_color;
            events.push({
              id: `booking-${b.id}-${room.room_id}`,
              title: `${room.room_name} | ${b.title}${dateSuffix}`,
              start: evStart,
              end: evEnd,
              allDay: evAllDay,
              backgroundColor: color,
              borderColor: color,
              textColor: "#ffffff",
              classNames: tentativeClass,
              extendedProps: { kind: "booking", bookingId: b.id, bookingType: b.booking_type },
            });
          }
        }
      } else {
        // 外現場など部屋なし
        events.push({
          id: `booking-${b.id}`,
          title: `📍 ${b.title}${b.location_note ? ` (${b.location_note})` : ""}${dateSuffix}`,
          start: evStart,
          end: evEnd,
          allDay: evAllDay,
          backgroundColor: typeColor,
          borderColor: typeColor,
          textColor: "#ffffff",
          classNames: tentativeClass,
          extendedProps: { kind: "booking", bookingId: b.id, bookingType: b.booking_type },
        });
      }
    }

    // Project events (recording/broadcast from existing calendar API)
    const projEvents = projectEventsData ?? [];
    for (const e of projEvents as any[]) {
      if (e.type === "recording" || e.type === "broadcast") {
        events.push({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: true,
          backgroundColor: e.type === "recording" ? "#8b5cf620" : "#06b6d420",
          borderColor: e.type === "recording" ? "#8b5cf6" : "#06b6d4",
          textColor: e.type === "recording" ? "#8b5cf6" : "#06b6d4",
          display: "background",
          extendedProps: {
            kind: "episode",
            project_id: e.project_id,
          },
        });
      }
    }

    return events;
  }, [bookings, projectEventsData, selectedRoomIds, currentView]);

  // 案件編集ページからのナビゲーション state を受け取って予約ダイアログを開く
  useEffect(() => {
    const state = location.state as {
      presetRoomIds?: string[];
      presetDate?: { start: string; end: string; allDay: boolean };
      presetProjectId?: string;
    } | null;
    if (state?.presetDate || (state?.presetRoomIds && state.presetRoomIds.length > 0)) {
      setPresetRoomIds(state.presetRoomIds ?? []);
      setPresetDate(state.presetDate ?? null);
      setPresetProjectId(state.presetProjectId ?? "");
      setEditingBooking(null);
      setBookingDialogOpen(true);
      window.history.replaceState({}, document.title);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      from: arg.startStr.split("T")[0],
      to: arg.endStr.split("T")[0],
    });
    // Track the current view so we don't reset on re-render
    setCurrentView(arg.view.type);
    // Sync kouban date with calendar's current date
    if (arg.view.type === "timeGridDay") {
      setKoubanDate(arg.start);
    }
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const props = info.event.extendedProps;
    if (props.kind === "booking") {
      const booking = bookings.find((b) => b.id === props.bookingId);
      if (booking) {
        setDetailBooking(booking);
        setDetailDialogOpen(true);
      }
    } else if (props.kind === "episode" && props.project_id) {
      navigate(`/sales/projects/${props.project_id}`);
    }
  }, [bookings, navigate]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    setPresetDate({
      start: info.startStr,
      end: info.endStr,
      allDay: info.allDay,
    });
    setPresetRoomIds([]);
    setEditingBooking(null);
    setBookingDialogOpen(true);
  }, []);

  const handleNewBooking = () => {
    setPresetDate(null);
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

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold">スタジオ予約</h1>
          <p className="hidden sm:block text-sm text-muted-foreground">カレンダーをタップして予約を追加</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
        </div>
      </div>

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

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(bookingTypeLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: bookingTypeColors[key] }} />
            {label}
          </div>
        ))}
        <span className="ml-2 italic opacity-70">※ 斜体・薄色は未確定の予約</span>
      </div>

      {/* 香盤 View (PC day view) */}
      {!isMobile && currentView === "timeGridDay" ? (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="flex items-center justify-end gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentView("dayGridMonth");
                  const calApi = calendarRef.current?.getApi?.();
                  if (calApi) calApi.changeView("dayGridMonth");
                }}
              >
                月カレンダーに戻る
              </Button>
            </div>
            {bookingsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <KoubanView
                date={koubanDate}
                locations={locations}
                bookings={bookings}
                onDateChange={(d) => {
                  setKoubanDate(d);
                  // Update date range so bookings are fetched for the new date
                  const from = new Date(d);
                  from.setDate(from.getDate() - 1);
                  const to = new Date(d);
                  to.setDate(to.getDate() + 2);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const toLocal = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
                  setDateRange({
                    from: toLocal(from),
                    to: toLocal(to),
                  });
                  // Sync FullCalendar date
                  const calApi = calendarRef.current?.getApi?.();
                  if (calApi) calApi.gotoDate(d);
                }}
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
      ) : null}

      {/* Calendar */}
      <Card className={!isMobile && currentView === "timeGridDay" ? "hidden" : ""}>
        <CardContent className="p-2 sm:p-4 relative">
          {bookingsLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <div className="studio-calendar">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={isMobile ? "listWeek" : "dayGridMonth"}
              locale="ja"
              headerToolbar={isMobile ? {
                left: "prev,next",
                center: "title",
                right: "listWeek,listMonth,timeGridDay",
              } : {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }}
              buttonText={{
                prev: "＜",
                next: "＞",
                today: "今日",
                month: "月",
                week: "週",
                day: "日",
                list: "一覧",
              }}
              views={{
                listWeek: { buttonText: "週一覧" },
                listMonth: { buttonText: "月一覧" },
                timeGridDay: { buttonText: "日" },
              }}
              buttonIcons={false}
              events={calendarEvents}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              select={handleDateSelect}
              selectable={true}
              selectMirror={true}
              height={isMobile ? "auto" : "auto"}
              contentHeight={isMobile ? "auto" : undefined}
              eventDisplay="block"
              dayMaxEvents={isMobile ? 2 : 4}
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              slotDuration={isMobile ? "01:00:00" : "00:30:00"}
              firstDay={1}
              allDaySlot={true}
              allDayText="終日"
              nowIndicator={true}
              expandRows={!isMobile}
              stickyHeaderDates={true}
              eventTimeFormat={{
                hour: "2-digit",
                minute: "2-digit",
                meridiem: false,
                hour12: false,
              }}
              titleFormat={isMobile ? { month: "short", day: "numeric" } : undefined}
              dayCellDidMount={(arg) => {
                const d = arg.date;
                const pad = (n: number) => String(n).padStart(2, "0");
                const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                const dow = d.getDay();
                if (JP_HOLIDAYS.has(dateStr) || dow === 0) {
                  arg.el.style.backgroundColor = "rgba(239,68,68,0.08)";
                } else if (dow === 6) {
                  arg.el.style.backgroundColor = "rgba(59,130,246,0.08)";
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Booking Dialog */}
      <StudioBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        locations={locations}
        editingBooking={editingBooking}
        presetDate={presetDate}
        presetRoomIds={presetRoomIds}
        presetProjectId={presetProjectId}
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
    </div>
    </PageTransition>
  );
}

// ============================================================
// カレンダー連携ダイアログ
// ============================================================
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, CheckCircle2 } from "lucide-react";

function CalendarFeedsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data } = useQuery({
    queryKey: ["studio-feeds"],
    queryFn: async () => (await api.get("/studios/rooms/feeds")).data.data as { room_id: string; room_name: string; location_name: string; room_type: string; feed_url: string }[],
    enabled: open,
  });

  const [copied, setCopied] = useState<string | null>(null);
  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

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
          各部屋のフィードURLをGoogle Calendar / Outlook に追加すると、予約が自動同期されます。
        </p>

        <div className="space-y-2">
          {(data ?? []).map((feed) => (
            <div key={feed.room_id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{feed.location_name} — {feed.room_name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{feed.feed_url}</p>
              </div>
              <Button
                size="sm"
                variant={copied === feed.room_id ? "default" : "outline"}
                onClick={() => copyUrl(feed.feed_url, feed.room_id)}
                className="shrink-0"
              >
                {copied === feed.room_id ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied === feed.room_id ? "コピー済" : "URLコピー"}
              </Button>
            </div>
          ))}
        </div>

        {/* サイネージURL一覧 */}
        <div className="border-t pt-4 mt-4">
          <p className="text-sm font-semibold mb-3">サイネージURL（楽屋/会議室入口用）</p>
          <p className="text-xs text-muted-foreground mb-2">タブレットやモニターのブラウザで全画面表示</p>
          <div className="space-y-2">
            {(data ?? []).map((feed) => {
              const baseUrl = new URL(feed.feed_url).origin;
              const roomId = feed.room_id;
              const token = new URL(feed.feed_url).searchParams.get('token') || '';
              const sUrl = `${baseUrl}/signage/${roomId}?token=${token}`;
              return (
                <div key={`signage-${feed.room_id}`} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{feed.location_name} — {feed.room_name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{sUrl}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={copied === `s-${feed.room_id}` ? "default" : "outline"}
                    onClick={() => copyUrl(sUrl, `s-${feed.room_id}`)}
                    className="shrink-0"
                  >
                    {copied === `s-${feed.room_id}` ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copied === `s-${feed.room_id}` ? "コピー済" : "URLコピー"}
                  </Button>
                </div>
              );
            })}
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
      </DialogContent>
    </Dialog>
  );
}
