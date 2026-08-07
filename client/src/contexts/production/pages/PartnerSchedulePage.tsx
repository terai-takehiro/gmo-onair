import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg, DateSelectArg } from "@fullcalendar/core";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Users } from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";
import { cn } from "@/lib/utils";
import PartnerScheduleDialog from "../components/schedule/PartnerScheduleDialog";
import {
  SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS,
  useIsMobile, paintHolidayCell, toExclusiveEnd,
  loadCalState, saveCalState, clampView,
  CalendarShell, type PartnerSchedule,
} from "../components/schedule/scheduleShared";

// パートナー (従業員) スケジュール — 代休/有給/出張/社外活動 等をパートナー間で共有する。
// 権限モジュール 'partner_schedule' の保持者のみ (ルートは PermissionRoute でガード)。

export default function PartnerSchedulePage() {
  const isMobile = useIsMobile();
  const calendarRef = useRef<any>(null);
  const { currentUser, hasPermission } = useAuth();
  const isManager = currentUser?.role === "system_admin" || hasPermission("partner_schedule", "manager");
  const canEdit = currentUser?.role === "system_admin" || hasPermission("partner_schedule", "editor");

  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split("T")[0],
  });
  const [memberFilter, setMemberFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerSchedule | null>(null);
  const [presetRange, setPresetRange] = useState<{ start: string; end: string } | null>(null);

  // カレンダー間で表示中の月・ビューを共有 (切り替え時にリセットしない)
  const calState = useRef(loadCalState()).current;
  const allowedViews = isMobile
    ? ["listMonth", "dayGridMonth"]
    : ["dayGridMonth", "timeGridWeek", "listWeek"];
  const initialView = clampView(calState.view, allowedViews, isMobile ? "listMonth" : "dayGridMonth");

  const { data: schedules = [], isLoading } = useQuery<PartnerSchedule[]>({
    queryKey: ["partner-schedules", dateRange.from, dateRange.to],
    queryFn: async () =>
      (await api.get(`/schedule/partner?from=${dateRange.from}&to=${dateRange.to}`)).data.data,
    placeholderData: (prev) => prev, // 期間移動/再取得中も前の表示を残す
  });

  const { data: partnerUsers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["partner-schedule-users"],
    queryFn: async () => (await api.get("/users/by-module/partner_schedule")).data.data,
    staleTime: 5 * 60 * 1000,
  });

  const calendarEvents = useMemo(() => {
    return schedules
      .filter((s) => !memberFilter || s.user_id === memberFilter)
      .map((s) => {
        const color = SCHEDULE_TYPE_COLORS[s.schedule_type] || SCHEDULE_TYPE_COLORS.other;
        const isAllDay = !!s.all_day;
        return {
          id: s.id,
          title: `${s.user_name}: ${s.title}`,
          start: isAllDay ? s.start_time.split("T")[0] : s.start_time,
          end: isAllDay ? toExclusiveEnd(s.end_time) : s.end_time,
          allDay: isAllDay,
          backgroundColor: color,
          borderColor: color,
          extendedProps: { scheduleId: s.id },
        };
      });
  }, [schedules, memberFilter]);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setDateRange({ from: fmt(info.start), to: fmt(info.end) });
    saveCalState(info.view.type, info.view.currentStart);
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const s = schedules.find((x) => x.id === info.event.extendedProps.scheduleId);
    if (s) { setEditing(s); setPresetRange(null); setDialogOpen(true); }
  }, [schedules]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    if (!canEdit) return;
    // FullCalendar の select end は exclusive → inclusive に -1 日
    const endD = new Date(info.end.getTime() - 24 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const start = fmt(info.start);
    const end = fmt(endD);
    setEditing(null);
    setPresetRange({ start, end: end < start ? start : end });
    setDialogOpen(true);
  }, [canEdit]);

  return (
    <CalendarShell
      current="partners"
      icon={Users}
      title="パートナースケジュール"
      description="代休・有給・出張・社外活動などをパートナー間で共有します（この画面はパートナースケジュール権限を持つメンバーのみ閲覧できます）。"
      actions={canEdit ? (
        <Button size="sm" onClick={() => { setEditing(null); setPresetRange(null); setDialogOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">予定を登録</span>
          <span className="sm:hidden">登録</span>
        </Button>
      ) : undefined}
    >
        {/* メンバー絞り込み + 凡例 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMemberFilter("")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              !memberFilter ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground hover:bg-accent"
            )}
          >
            全員
          </button>
          {partnerUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setMemberFilter(memberFilter === u.id ? "" : u.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                memberFilter === u.id ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {u.name}
            </button>
          ))}
          <div className="ml-auto hidden sm:flex flex-wrap items-center gap-2">
            {Object.entries(SCHEDULE_TYPE_LABELS).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SCHEDULE_TYPE_COLORS[key] }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* カレンダー */}
        <Card>
          <CardContent className="relative p-2 sm:p-4">
            {isLoading && schedules.length === 0 && (
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
                select={handleDateSelect}
                selectable={canEdit}
                selectMirror={true}
                height="auto"
                eventDisplay="block"
                dayMaxEvents={isMobile ? 3 : 6}
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

        <PartnerScheduleDialog
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
          editing={editing}
          presetRange={presetRange}
          isManager={isManager}
        />
    </CalendarShell>
  );
}
