import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import ProjectQuickLinks from "@/contexts/shared/components/ProjectQuickLinks";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import api from "@/lib/api";
import { formatShortDate } from "@/lib/format";
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
import { Settings, CalendarSync, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { CalendarShell, loadCalState, saveCalState, clampView } from "../components/schedule/scheduleShared";

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

// 日本の祝日 (2025–2027)
const JP_HOLIDAYS = new Set([
  // 2025
  "2025-01-01","2025-01-13","2025-02-11","2025-02-23","2025-02-24",
  "2025-03-20","2025-04-29","2025-05-03","2025-05-04","2025-05-05",
  "2025-05-06","2025-07-21","2025-08-11","2025-09-15","2025-09-21",
  "2025-09-22","2025-09-23","2025-10-13","2025-11-03","2025-11-23",
  "2025-11-24",
  // 2026
  "2026-01-01","2026-01-12","2026-02-11","2026-02-23",
  "2026-03-20","2026-04-29","2026-05-03","2026-05-04","2026-05-05",
  "2026-05-06","2026-07-20","2026-08-11","2026-09-21","2026-09-22",
  "2026-09-23","2026-10-12","2026-11-03","2026-11-23",
  // 2027
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23",
  "2027-03-21","2027-03-22","2027-04-29","2027-05-03","2027-05-04","2027-05-05",
  "2027-07-19","2027-08-11","2027-09-20","2027-09-23",
  "2027-10-11","2027-11-03","2027-11-23",
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
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get("project_id") || "";
  const filterProjectName = searchParams.get("project_name") || "";
  const qc = useQueryClient();
  const isMobile = useIsMobile(1024);
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
      api.changeView("listMonth");
    } else if (!isMobile && (currentView === "listWeek" || currentView === "listMonth")) {
      api.changeView("dayGridMonth");
    }
  }, [isMobile]);

  // カレンダー間 (統合/スタジオ/パートナー/マイ) で表示中の月・ビューを共有し、
  // 切り替え時にリセットされないようにする
  const calState = useRef(loadCalState()).current;
  const allowedViews = isMobile
    ? ["listMonth", "timeGridDay"]
    : ["dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek"];
  const initialView = clampView(calState.view, allowedViews, isMobile ? "listMonth" : "dayGridMonth");

  // Track current FullCalendar view to prevent resets
  const [currentView, setCurrentView] = useState<string>(initialView);
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
    queryKey: ["studio-bookings", dateRange.from, dateRange.to, filterProjectId],
    queryFn: async () => {
      const params: Record<string, string> = { from: dateRange.from, to: dateRange.to };
      if (filterProjectId) params.project_id = filterProjectId;
      const res = await api.get("/studios/bookings", { params });
      return res.data.data;
    },
    placeholderData: (prev: any) => prev, // 期間移動/再取得中も前の表示を残す
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
      // 案件詳細の予約一覧も読み直す (消したのに残って見えると、もう一度消しに行くことになる)
      qc.invalidateQueries({ queryKey: ["project-studio-bookings"] });
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
      // Strip leading GLS number (e.g. "GLS-A005 番組名" → "番組名")
      const displayTitle = b.title.replace(/^GLS[-A-Z0-9]*\s+/i, "").trim() || b.title;

      if (b.rooms.length > 0) {
        // 月間ビュー: 案件単位で1イベントにまとめる
        const filteredRooms = selectedRoomIds.size > 0
          ? b.rooms.filter((r) => selectedRoomIds.has(r.room_id))
          : b.rooms;
        if (filteredRooms.length === 0) continue;

        const color = useTypeColor ? typeColor : filteredRooms[0].room_color;
        const roomsChain = buildRoomChain(filteredRooms);
        if (isMonthView) {
          // 月間ビュー: 案件名のみで簡潔に（多イベント時の視認性優先）
          events.push({
            id: `booking-${b.id}`,
            title: `${displayTitle}${dateSuffix}`,
            start: evStart,
            end: evEnd,
            allDay: evAllDay,
            backgroundColor: color,
            borderColor: color,
            textColor: "#ffffff",
            classNames: tentativeClass,
            extendedProps: {
              kind: "booking",
              bookingId: b.id,
              bookingType: b.booking_type,
              projectLine: `${displayTitle}${dateSuffix}`,
              roomsLine: roomsChain,
            },
          });
        } else {
          // 週/日ビュー: 案件名を主役に + 部屋は略称チェイン (eventContent で 2 行表示)
          events.push({
            id: `booking-${b.id}`,
            title: `${displayTitle}${dateSuffix}`,
            start: evStart,
            end: evEnd,
            allDay: evAllDay,
            backgroundColor: color,
            borderColor: color,
            textColor: "#ffffff",
            classNames: tentativeClass,
            extendedProps: {
              kind: "booking",
              bookingId: b.id,
              bookingType: b.booking_type,
              projectLine: `${displayTitle}${dateSuffix}`,
              roomsLine: roomsChain,
            },
          });
        }
      } else {
        // 外現場など部屋なし
        events.push({
          id: `booking-${b.id}`,
          title: `📍 ${displayTitle}${b.location_note ? ` (${b.location_note})` : ""}${dateSuffix}`,
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
    saveCalState(arg.view.type, arg.view.currentStart);
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

  // ── 直近 7 日間の予定 (今日起点) ───────────────────────────
  // 部屋フィルタ適用後の予約を、今日 +6 日 (計 7 日) の窓に絞ってグルーピング
  const upcomingDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const dayWeek = ['日', '月', '火', '水', '木', '金', '土'];
    const days: { key: string; date: Date; label: string; isToday: boolean; isTomorrow: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push({
        key: dateKey(d),
        date: d,
        label: `${d.getMonth() + 1}/${d.getDate()} (${dayWeek[d.getDay()]})`,
        isToday: i === 0,
        isTomorrow: i === 1,
      });
    }
    const filtered = selectedRoomIds.size > 0
      ? bookings.filter((b) => (b.rooms ?? []).some((r) => selectedRoomIds.has(r.room_id)))
      : bookings;
    const map = new Map<string, StudioBooking[]>();
    days.forEach((d) => map.set(d.key, []));
    for (const b of filtered) {
      const startDay = (b.start_time || '').split('T')[0];
      const endDay = (b.end_time || startDay).split('T')[0];
      // 期間予約 (start ≦ targetDay ≦ end) の各日にエントリ
      days.forEach((d) => {
        if (startDay && startDay <= d.key && d.key <= endDay) {
          map.get(d.key)!.push(b);
        }
      });
    }
    return days.map((d) => ({ ...d, items: map.get(d.key) ?? [] })).filter((d) => d.items.length > 0);
  }, [bookings, selectedRoomIds]);

  const totalUpcoming = upcomingDays.reduce((sum, d) => sum + d.items.length, 0);

  return (
    <CalendarShell
      current="studio"
      icon={CalendarDays}
      title="スタジオ予約"
      description="カレンダーをタップして予約を追加"
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
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={() => navigate("/studio/calendar")}>
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
                      const typeColor = bookingTypeColors[b.booking_type] || '#6b7280';
                      const typeLabel = bookingTypeLabels[b.booking_type] || b.booking_type;
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
          {bookingsLoading && bookings.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <div className="studio-calendar">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={initialView}
              initialDate={calState.dateStr}
              locale="ja"
              headerToolbar={isMobile ? {
                left: "prev,next",
                center: "title",
                right: "listMonth,timeGridDay",
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
              noEventsText="この期間に予定はありません"
              buttonIcons={false}
              events={calendarEvents}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              eventContent={(arg) => {
                const ext = arg.event.extendedProps as { projectLine?: string; roomsLine?: string; kind?: string };
                if (ext?.kind !== 'booking') return undefined; // default rendering
                const projectLine = ext.projectLine || arg.event.title;
                const roomsLine = ext.roomsLine || '';
                const timeText = arg.timeText;
                return (
                  <div className="overflow-hidden leading-tight px-1 py-0.5 text-[11px]">
                    {timeText && <div className="opacity-90 font-medium">{timeText}</div>}
                    <div className="font-semibold truncate">{projectLine}</div>
                    {roomsLine && <div className="opacity-90 truncate text-[10px]">{roomsLine}</div>}
                  </div>
                );
              }}
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
              firstDay={0}
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
