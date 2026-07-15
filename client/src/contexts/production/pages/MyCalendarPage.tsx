import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg, DateSelectArg } from "@fullcalendar/core";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, CalendarClock, CloudDownload } from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";
import PersonalEventDialog from "../components/schedule/PersonalEventDialog";
import IcsFeedsDialog from "../components/schedule/IcsFeedsDialog";
import {
  SCHEDULE_TYPE_COLORS, SCHEDULE_TYPE_LABELS,
  useIsMobile, paintHolidayCell, toExclusiveEnd,
  loadCalState, saveCalState, clampView,
  CalendarNavPills, type PersonalEvent, type PartnerSchedule,
} from "../components/schedule/scheduleShared";

// マイカレンダー — 本人のみに表示される個人カレンダー。
//   ・手入力の個人予定 (青)
//   ・Outlook/Google から ICS 購読で同期した予定 (グレー)
//   ・自分のパートナースケジュール (代休/有給等・種別色) も参考表示
const MANUAL_COLOR = "#2563eb";
const ICS_COLOR = "#64748b";
const GOOGLE_COLOR = "#16a34a";
const OUTLOOK_COLOR = "#0078d4";

export default function MyCalendarPage() {
  const isMobile = useIsMobile(1024);
  const calendarRef = useRef<any>(null);
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [googleNotice, setGoogleNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  // OAuth コールバックからの戻り (?google=linked|error / ?outlook=linked|error) を検知
  useEffect(() => {
    const g = searchParams.get("google");
    const o = searchParams.get("outlook");
    if (!g && !o) return;
    const provider = g ? "Google" : "Outlook";
    const status = g || o;
    if (status === "linked") {
      setGoogleNotice({ ok: true, msg: `${provider} カレンダーと連携しました。予定を取り込みました。` });
      qc.invalidateQueries({ queryKey: ["personal-events"] });
      qc.invalidateQueries({ queryKey: ["google-cal-status"] });
      qc.invalidateQueries({ queryKey: ["ms-cal-status"] });
    } else if (status === "error") {
      setGoogleNotice({ ok: false, msg: `${provider} 連携に失敗しました。もう一度お試しください。` });
    }
    // URL からパラメータを除去
    searchParams.delete("google");
    searchParams.delete("outlook");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, qc]);

  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split("T")[0],
  });
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [feedsDialogOpen, setFeedsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalEvent | null>(null);
  const [presetRange, setPresetRange] = useState<{ start: string; end: string; allDay: boolean } | null>(null);

  // カレンダー間で表示中の月・ビューを共有 (切り替え時にリセットしない)
  const calState = useRef(loadCalState()).current;
  const allowedViews = isMobile
    ? ["listMonth", "timeGridDay"]
    : ["dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek"];
  const initialView = clampView(calState.view, allowedViews, isMobile ? "listMonth" : "dayGridMonth");

  const { data: events = [], isLoading } = useQuery<PersonalEvent[]>({
    queryKey: ["personal-events", dateRange.from, dateRange.to],
    queryFn: async () =>
      (await api.get(`/schedule/personal?from=${dateRange.from}&to=${dateRange.to}`)).data.data,
    placeholderData: (prev) => prev,
  });

  // 自分のパートナー予定 (代休/有給等) も参考表示
  const { data: mySchedules = [] } = useQuery<PartnerSchedule[]>({
    queryKey: ["my-partner-schedules", dateRange.from, dateRange.to, currentUser?.id],
    queryFn: async () =>
      (await api.get(`/schedule/partner?from=${dateRange.from}&to=${dateRange.to}&user_id=${currentUser!.id}`)).data.data,
    enabled: !!currentUser?.id,
    placeholderData: (prev) => prev,
  });

  const calendarEvents = useMemo(() => {
    const list: any[] = events.map((e) => {
      const isAllDay = !!e.all_day;
      const color = e.source === "google" ? GOOGLE_COLOR : e.source === "outlook" ? OUTLOOK_COLOR : e.source === "ics" ? ICS_COLOR : MANUAL_COLOR;
      return {
        id: `pe-${e.id}`,
        title: e.source === "ics" && e.feed_label ? `${e.title}｜${e.feed_label}` : e.title,
        start: isAllDay ? e.start_time.split("T")[0] : e.start_time,
        end: isAllDay ? toExclusiveEnd(e.end_time) : e.end_time,
        allDay: isAllDay,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { kind: "personal", eventId: e.id },
      };
    });
    for (const s of mySchedules) {
      const color = SCHEDULE_TYPE_COLORS[s.schedule_type] || SCHEDULE_TYPE_COLORS.other;
      const isAllDay = !!s.all_day;
      list.push({
        id: `ps-${s.id}`,
        title: `【${SCHEDULE_TYPE_LABELS[s.schedule_type] || "予定"}】${s.title}`,
        start: isAllDay ? s.start_time.split("T")[0] : s.start_time,
        end: isAllDay ? toExclusiveEnd(s.end_time) : s.end_time,
        allDay: isAllDay,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { kind: "partner" },
      });
    }
    return list;
  }, [events, mySchedules]);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setDateRange({ from: fmt(info.start), to: fmt(info.end) });
    saveCalState(info.view.type, info.view.currentStart);
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const props = info.event.extendedProps as { kind: string; eventId?: string };
    if (props.kind !== "personal") return; // パートナー予定はパートナースケジュール画面で編集
    const e = events.find((x) => x.id === props.eventId);
    if (e) { setEditing(e); setPresetRange(null); setEventDialogOpen(true); }
  }, [events]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    if (info.allDay) {
      // FullCalendar の終日 select end は exclusive → inclusive に -1 日
      const endD = new Date(info.end.getTime() - 24 * 3600_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const start = fmt(info.start);
      const end = fmt(endD);
      setPresetRange({ start, end: end < start ? start : end, allDay: true });
    } else {
      setPresetRange({ start: info.startStr.slice(0, 16), end: info.endStr.slice(0, 16), allDay: false });
    }
    setEditing(null);
    setEventDialogOpen(true);
  }, []);

  return (
    <div className="animate-in fade-in duration-200">
      <div className="space-y-4 p-4 sm:p-6">
        {/* ヘッダー: モバイルは「タイトル+ボタン」「回遊ピル」の 2 行、sm 以上は 1 行 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CalendarClock className="h-6 w-6 text-primary shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold truncate">マイカレンダー</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:order-last">
            <Button size="sm" variant="outline" onClick={() => setFeedsDialogOpen(true)}>
              <CloudDownload className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">外部カレンダー連携</span>
              <span className="sm:hidden">連携</span>
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setPresetRange(null); setEventDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">予定を登録</span>
              <span className="sm:hidden">登録</span>
            </Button>
          </div>
          <div className="w-full sm:w-auto flex">
            <CalendarNavPills current="my" />
          </div>
        </div>
        <p className="hidden sm:block text-sm text-muted-foreground -mt-2">
          あなただけに表示される個人カレンダーです。Outlook/Google の予定を連携して取り込めます。
        </p>

        {googleNotice && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              googleNotice.ok
                ? "border-green-600/30 bg-green-50 text-green-800"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            <span className="flex-1">{googleNotice.msg}</span>
            <button type="button" className="text-xs underline" onClick={() => setGoogleNotice(null)}>閉じる</button>
          </div>
        )}

        {/* 凡例 (モバイルは横スクロールで 1 行に収める) */}
        <div className="flex items-center gap-3 overflow-x-auto text-[11px] text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MANUAL_COLOR }} />
            個人予定
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: GOOGLE_COLOR }} />
            Google カレンダー
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: OUTLOOK_COLOR }} />
            Outlook カレンダー
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ICS_COLOR }} />
            ICS 購読
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SCHEDULE_TYPE_COLORS.daikyu }} />
            パートナー予定（自分の分）
          </span>
        </div>

        {/* カレンダー */}
        <Card>
          <CardContent className="relative p-2 sm:p-4">
            {isLoading && events.length === 0 && (
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
                buttonText={{ prev: "＜", next: "＞", today: "今日", month: "月", week: "週", day: "日", list: "一覧" }}
                noEventsText="この期間に予定はありません"
                buttonIcons={false}
                events={calendarEvents}
                datesSet={handleDatesSet}
                eventClick={handleEventClick}
                select={handleDateSelect}
                selectable={true}
                selectMirror={true}
                height="auto"
                eventDisplay="block"
                dayMaxEvents={isMobile ? 3 : 5}
                slotMinTime="06:00:00"
                slotMaxTime="24:00:00"
                slotDuration={isMobile ? "01:00:00" : "00:30:00"}
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

        <PersonalEventDialog
          open={eventDialogOpen}
          onOpenChange={(v) => { setEventDialogOpen(v); if (!v) setEditing(null); }}
          editing={editing}
          presetRange={presetRange}
        />
        <IcsFeedsDialog open={feedsDialogOpen} onOpenChange={setFeedsDialogOpen} />
      </div>
    </div>
  );
}
