import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Layers, CalendarDays, Users, CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";
import { cn } from "@/lib/utils";
import StudioBookingDetailDialog from "../components/studio/StudioBookingDetailDialog";
import PartnerScheduleDialog from "../components/schedule/PartnerScheduleDialog";
import PersonalEventDialog from "../components/schedule/PersonalEventDialog";
import {
  SCHEDULE_TYPE_COLORS,
  BOOKING_TYPE_COLORS,
  useIsMobile, paintHolidayCell, toExclusiveEnd,
  loadCalState, saveCalState, clampView,
  CalendarShell, type PartnerSchedule, type PersonalEvent,
} from "../components/schedule/scheduleShared";

// 統合カレンダー — スタジオ予約 + パートナースケジュール + 個人予定 を 1 画面にマージ表示。
// レイヤーは権限のあるものだけ表示され、トグルで ON/OFF できる (localStorage に永続化)。
// 新規作成は種別が曖昧なためここでは行わず、各専用ページ (回遊ピル) で行う。
// クリック時: スタジオ予約 = 詳細ダイアログ (閲覧のみ) / パートナー・個人 = 編集ダイアログ。

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
  rooms: Array<{
    room_id: string; room_name: string; room_abbreviation?: string | null;
    room_color: string; room_type?: string; location_id: string;
    occupant?: string; usage_note?: string;
  }>;
}

const MANUAL_COLOR = "#2563eb";
const ICS_COLOR = "#64748b";

type LayerKey = "studio" | "partner" | "my";
const LAYERS_STORAGE_KEY = "unified-cal-layers";

function loadLayerPrefs(): Record<LayerKey, boolean> {
  try {
    const raw = localStorage.getItem(LAYERS_STORAGE_KEY);
    if (raw) return { studio: true, partner: true, my: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { studio: true, partner: true, my: true };
}

export default function UnifiedCalendarPage() {
  const isMobile = useIsMobile(1024);
  const calendarRef = useRef<any>(null);
  const qc = useQueryClient();
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";
  const canStudio = isAdmin || hasPermission("studio");
  const canPartner = isAdmin || hasPermission("partner_schedule");
  const canPersonal = isAdmin || hasPermission("partner_schedule", "editor");
  const isPartnerManager = isAdmin || hasPermission("partner_schedule", "manager");
  const canDeleteBooking = isAdmin || hasPermission("studio", "manager");

  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split("T")[0],
  });
  // カレンダー間で表示中の月・ビューを共有 (切り替え時にリセットしない)
  const calState = useRef(loadCalState()).current;
  const allowedViews = isMobile
    ? ["listMonth", "dayGridMonth"]
    : ["dayGridMonth", "timeGridWeek", "listWeek"];
  const initialView = clampView(calState.view, allowedViews, isMobile ? "listMonth" : "dayGridMonth");

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(loadLayerPrefs);
  const toggleLayer = (key: LayerKey) => {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // ダイアログ state
  const [detailBooking, setDetailBooking] = useState<StudioBooking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<PartnerSchedule | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PersonalEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);

  // ── データ取得 (権限のあるレイヤーのみ) ─────────────────────────────
  const { data: bookings = [], isLoading: l1 } = useQuery<StudioBooking[]>({
    queryKey: ["studio-bookings", dateRange.from, dateRange.to, ""],
    queryFn: async () =>
      (await api.get(`/studios/bookings?from=${dateRange.from}&to=${dateRange.to}`)).data.data,
    enabled: canStudio,
    placeholderData: (prev) => prev,
  });

  const { data: schedules = [], isLoading: l2 } = useQuery<PartnerSchedule[]>({
    queryKey: ["partner-schedules", dateRange.from, dateRange.to],
    queryFn: async () =>
      (await api.get(`/schedule/partner?from=${dateRange.from}&to=${dateRange.to}`)).data.data,
    enabled: canPartner,
    placeholderData: (prev) => prev,
  });

  const { data: personalEvents = [], isLoading: l3 } = useQuery<PersonalEvent[]>({
    queryKey: ["personal-events", dateRange.from, dateRange.to],
    queryFn: async () =>
      (await api.get(`/schedule/personal?from=${dateRange.from}&to=${dateRange.to}`)).data.data,
    enabled: canPersonal,
    placeholderData: (prev) => prev,
  });

  const isLoading = l1 || l2 || l3;

  // ── イベントのマージ ────────────────────────────────────────────────
  const calendarEvents = useMemo(() => {
    const list: any[] = [];
    if (canStudio && layers.studio) {
      for (const b of bookings) {
        const color = BOOKING_TYPE_COLORS[b.booking_type] || BOOKING_TYPE_COLORS.other;
        const isAllDay = !!b.all_day;
        const displayTitle = b.title.replace(/^GLS[-A-Z0-9]*\s+/i, "").trim() || b.title;
        list.push({
          id: `bk-${b.id}`,
          title: displayTitle,
          start: isAllDay ? b.start_time.split("T")[0] : b.start_time,
          end: isAllDay ? toExclusiveEnd(b.end_time) : b.end_time,
          allDay: isAllDay,
          backgroundColor: color,
          borderColor: color,
          extendedProps: { kind: "booking", refId: b.id },
        });
      }
    }
    if (canPartner && layers.partner) {
      for (const s of schedules) {
        const color = SCHEDULE_TYPE_COLORS[s.schedule_type] || SCHEDULE_TYPE_COLORS.other;
        const isAllDay = !!s.all_day;
        list.push({
          id: `ps-${s.id}`,
          title: `${s.user_name}: ${s.title}`,
          start: isAllDay ? s.start_time.split("T")[0] : s.start_time,
          end: isAllDay ? toExclusiveEnd(s.end_time) : s.end_time,
          allDay: isAllDay,
          backgroundColor: color,
          borderColor: color,
          extendedProps: { kind: "partner", refId: s.id },
        });
      }
    }
    if (canPersonal && layers.my) {
      for (const e of personalEvents) {
        const color = e.source === "ics" ? ICS_COLOR : MANUAL_COLOR;
        const isAllDay = !!e.all_day;
        list.push({
          id: `pe-${e.id}`,
          title: e.source === "ics" && e.feed_label ? `${e.title}｜${e.feed_label}` : e.title,
          start: isAllDay ? e.start_time.split("T")[0] : e.start_time,
          end: isAllDay ? toExclusiveEnd(e.end_time) : e.end_time,
          allDay: isAllDay,
          backgroundColor: color,
          borderColor: color,
          extendedProps: { kind: "personal", refId: e.id },
        });
      }
    }
    return list;
  }, [bookings, schedules, personalEvents, layers, canStudio, canPartner, canPersonal]);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setDateRange({ from: fmt(info.start), to: fmt(info.end) });
    saveCalState(info.view.type, info.view.currentStart);
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const props = info.event.extendedProps as { kind: string; refId: string };
    if (props.kind === "booking") {
      const b = bookings.find((x) => x.id === props.refId);
      if (b) { setDetailBooking(b); setDetailOpen(true); }
    } else if (props.kind === "partner") {
      const s = schedules.find((x) => x.id === props.refId);
      if (s) { setEditingSchedule(s); setScheduleDialogOpen(true); }
    } else if (props.kind === "personal") {
      const e = personalEvents.find((x) => x.id === props.refId);
      if (e) { setEditingEvent(e); setEventDialogOpen(true); }
    }
  }, [bookings, schedules, personalEvents]);

  // スタジオ予約の削除 (詳細ダイアログから。studio manager のみボタン表示)
  const deleteBookingMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/studios/bookings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-bookings"] });
      setDetailOpen(false);
    },
  });

  const layerChips: Array<{ key: LayerKey; label: string; icon: React.ElementType; show: boolean; color: string }> = [
    { key: "studio", label: "スタジオ予約", icon: CalendarDays, show: canStudio, color: BOOKING_TYPE_COLORS.performance },
    { key: "partner", label: "パートナー", icon: Users, show: canPartner, color: SCHEDULE_TYPE_COLORS.daikyu },
    { key: "my", label: "マイ（個人）", icon: CalendarClock, show: canPersonal, color: MANUAL_COLOR },
  ];

  return (
    <CalendarShell
      current="all"
      icon={Layers}
      title="統合カレンダー"
      description="スタジオ予約・パートナースケジュール・個人予定をまとめて表示します。予定の新規登録は各カレンダーで行ってください。"
    >
        {/* レイヤートグル */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {layerChips.filter((c) => c.show).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleLayer(c.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                layers[c.key]
                  ? "border-transparent text-white"
                  : "text-muted-foreground opacity-60 hover:bg-accent"
              )}
              style={layers[c.key] ? { backgroundColor: c.color } : undefined}
            >
              <c.icon className="h-3.5 w-3.5 shrink-0" />
              {c.label}
            </button>
          ))}
        </div>

        {/* カレンダー */}
        <Card>
          <CardContent className="relative p-2 sm:p-4">
            {isLoading && calendarEvents.length === 0 && (
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
                  right: "listMonth,dayGridMonth",
                } : {
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,listWeek",
                }}
                buttonText={{ prev: "＜", next: "＞", today: "今日", month: "月", week: "週", day: "日", list: "一覧" }}
                noEventsText="この期間に予定はありません"
                buttonIcons={false}
                events={calendarEvents}
                datesSet={handleDatesSet}
                eventClick={handleEventClick}
                selectable={false}
                height="auto"
                eventDisplay="block"
                dayMaxEvents={isMobile ? 3 : 5}
                firstDay={0}
                allDaySlot={true}
                allDayText="終日"
                nowIndicator={true}
                stickyHeaderDates={true}
                eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: false, hour12: false }}
                titleFormat={isMobile ? { month: "short", day: "numeric" } : undefined}
                dayCellDidMount={paintHolidayCell}
              />
            </div>
          </CardContent>
        </Card>

        {/* スタジオ予約: 詳細 (編集はスタジオカレンダーで行うため閲覧のみ) */}
        <StudioBookingDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          booking={detailBooking as any}
          onEdit={() => { /* 統合ビューでは編集しない */ }}
          onDelete={(id) => { if (confirm("この予約を削除しますか？")) deleteBookingMutation.mutate(id); }}
          canEdit={false}
          canDelete={canDeleteBooking}
        />

        {/* パートナー予定: 編集ダイアログ */}
        <PartnerScheduleDialog
          open={scheduleDialogOpen}
          onOpenChange={(v) => { setScheduleDialogOpen(v); if (!v) setEditingSchedule(null); }}
          editing={editingSchedule}
          presetRange={null}
          isManager={isPartnerManager}
        />

        {/* 個人予定: 編集ダイアログ */}
        <PersonalEventDialog
          open={eventDialogOpen}
          onOpenChange={(v) => { setEventDialogOpen(v); if (!v) setEditingEvent(null); }}
          editing={editingEvent}
          presetRange={null}
        />
    </CalendarShell>
  );
}
