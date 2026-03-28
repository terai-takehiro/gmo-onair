import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Filter } from "lucide-react";
import type { DatesSetArg, EventClickArg, DateSelectArg } from "@fullcalendar/core";
import StudioBookingDialog from "../components/studio/StudioBookingDialog";
import StudioBookingDetailDialog from "../components/studio/StudioBookingDetailDialog";

interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
  color: string;
  sort_order: number;
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
  location_id: string;
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
  rooms: BookingRoom[];
}

const bookingTypeColors: Record<string, string> = {
  project: "#3b82f6",
  maintenance: "#ef4444",
  tour: "#8b5cf6",
  internal: "#f59e0b",
  other: "#6b7280",
};

const bookingTypeLabels: Record<string, string> = {
  project: "案件",
  maintenance: "メンテナンス",
  tour: "内覧",
  internal: "社内利用",
  other: "その他",
};

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
      api.changeView("timeGridDay");
    } else if (!isMobile && currentView === "listWeek") {
      api.changeView("dayGridMonth");
    }
  }, [isMobile]);

  // Filter state
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  // Dialog state
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<StudioBooking | null>(null);
  const [detailBooking, setDetailBooking] = useState<StudioBooking | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [presetDate, setPresetDate] = useState<{ start: string; end: string; allDay: boolean } | null>(null);

  // Fetch locations & rooms
  const { data: locationsData } = useQuery({
    queryKey: ["studio-locations"],
    queryFn: async () => (await api.get("/studios/locations")).data,
  });
  const locations: StudioLocation[] = locationsData?.data ?? [];
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

    // Studio bookings — 部屋ごとに1イベントとして表示
    for (const b of bookings) {
      const typeColor = b.booking_type === "maintenance" ? "#ef4444"
        : b.booking_type === "tour" ? "#8b5cf6"
        : b.booking_type === "internal" ? "#f59e0b"
        : bookingTypeColors[b.booking_type] || "#6b7280";

      if (b.rooms.length > 0) {
        // 部屋ごとに個別イベント
        for (const room of b.rooms) {
          if (selectedRoomIds.size > 0 && !selectedRoomIds.has(room.room_id)) continue;

          const color = b.booking_type === "maintenance" || b.booking_type === "tour"
            ? typeColor : room.room_color;

          events.push({
            id: `booking-${b.id}-${room.room_id}`,
            title: `${room.room_name} | ${b.title}`,
            start: b.start_time,
            end: b.all_day ? addOneDay(b.end_time) : b.end_time,
            allDay: !!b.all_day,
            backgroundColor: color,
            borderColor: color,
            textColor: "#ffffff",
            extendedProps: {
              kind: "booking",
              bookingId: b.id,
              bookingType: b.booking_type,
            },
          });
        }
      } else {
        // 外現場など部屋なし
        events.push({
          id: `booking-${b.id}`,
          title: `📍 ${b.title}${b.location_note ? ` (${b.location_note})` : ""}`,
          start: b.start_time,
          end: b.all_day ? addOneDay(b.end_time) : b.end_time,
          allDay: !!b.all_day,
          backgroundColor: typeColor,
          borderColor: typeColor,
          textColor: "#ffffff",
          extendedProps: {
            kind: "booking",
            bookingId: b.id,
            bookingType: b.booking_type,
          },
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
  }, [bookings, projectEventsData, selectedRoomIds]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      from: arg.startStr.split("T")[0],
      to: arg.endStr.split("T")[0],
    });
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
      navigate(`/projects/${props.project_id}`);
    }
  }, [bookings, navigate]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    setPresetDate({
      start: info.startStr,
      end: info.endStr,
      allDay: info.allDay,
    });
    setEditingBooking(null);
    setBookingDialogOpen(true);
  }, []);

  const handleNewBooking = () => {
    setPresetDate(null);
    setEditingBooking(null);
    setBookingDialogOpen(true);
  };

  const handleEditBooking = (booking: StudioBooking) => {
    setEditingBooking(booking);
    setPresetDate(null);
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
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">スタジオ予約</h1>
          <p className="hidden sm:block text-sm text-muted-foreground">カレンダーをタップして予約を追加</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterOpen(!filterOpen)}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            部屋
            {selectedRoomIds.size > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {selectedRoomIds.size}
              </Badge>
            )}
          </Button>
          <Button size="sm" onClick={handleNewBooking}>
            <Plus className="h-4 w-4 mr-1" />
            予約追加
          </Button>
        </div>
      </div>

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
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: "#8b5cf6", opacity: 0.3 }} />
          収録日(背景)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: "#06b6d4", opacity: 0.3 }} />
          放送日(背景)
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {bookingsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="studio-calendar">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                initialView={isMobile ? "timeGridDay" : "dayGridMonth"}
                locale="ja"
                headerToolbar={isMobile ? {
                  left: "prev,next",
                  center: "title",
                  right: "timeGridDay,listWeek,dayGridMonth",
                } : {
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
                }}
                buttonText={{
                  today: "今日",
                  month: "月",
                  week: "週",
                  day: "日",
                  list: "一覧",
                }}
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
                slotMinTime="06:00:00"
                slotMaxTime="24:00:00"
                slotDuration={isMobile ? "01:00:00" : "00:30:00"}
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
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booking Dialog */}
      <StudioBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        locations={locations}
        editingBooking={editingBooking}
        presetDate={presetDate}
      />

      {/* Detail Dialog */}
      <StudioBookingDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        booking={detailBooking}
        onEdit={handleEditBooking}
        onDelete={(id) => {
          if (confirm("この予約を削除しますか？")) deleteMutation.mutate(id);
        }}
      />
    </div>
  );
}

// Helper: add one day for allDay events (FullCalendar exclusive end date)
function addOneDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
