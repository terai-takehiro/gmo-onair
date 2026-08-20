/**
 * パートナースケジュール（v4・FullCalendar を撤去した回）
 *
 * ① 予定（統合カレンダー）と同じ描画部品（`calendar/`）に載せ替えた。
 * データの取り方・ダイアログ・メンバー絞り込みは1行も変えていない —
 * 変えたのは**マス目の描き方**だけ（FullCalendar → 自前描画）。
 *
 * **クリック&ドラッグでの新規作成は無くした**（① 予定と同じ判断）。
 * 「予定を登録」ボタンから入れる形に統一している。
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Users } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PartnerScheduleDialog from "../components/schedule/PartnerScheduleDialog";
import {
  SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS,
  useIsMobile, CalendarShell, type PartnerSchedule,
} from "../components/schedule/scheduleShared";
import { useAuth } from "@/contexts/platform/AuthContext";
import {
  ymd, addDays, addMonths, startOfWeek, weekDays, type CalEvent,
} from "./calendar/calendarLayout";
import { CalToolbar, type CalView } from "./calendar/CalToolbar";
import { MonthGrid } from "./calendar/MonthGrid";
import { TimeGrid } from "./calendar/TimeGrid";
import { EventTable } from "./calendar/EventTable";
import type { Holiday } from "./calendar/useCalendarEvents";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function PartnerSchedulePage() {
  const isMobile = useIsMobile();
  const { currentUser, hasPermission } = useAuth();
  const isManager = currentUser?.role === "system_admin" || hasPermission("partner_schedule", "manager");
  const canEdit = currentUser?.role === "system_admin" || hasPermission("partner_schedule", "editor");

  const today = ymd(new Date());
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalView>(isMobile ? "list" : "month");
  const [anchor, setAnchor] = useState(today);
  const [memberFilter, setMemberFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerSchedule | null>(null);

  // **月・週・日は 375px だとマスが数ミリ角になる**（① 予定と同じ理由）。
  // スマホでは一覧だけにする（強制はしない — 一度PCで開いた続きに来た人まで奪わない）
  const allowedViews: CalView[] = isMobile ? ["list"] : ["month", "week", "day", "list"];
  const pickView = (v: CalView) => setView(allowedViews.includes(v) ? v : "list");

  const { from, to } = useMemo(() => {
    if (view === "week") { const w = weekDays(anchor); return { from: w[0], to: `${w[6]}T23:59` }; }
    if (view === "day") return { from: anchor, to: `${anchor}T23:59` };
    const first = `${anchor.slice(0, 7)}-01`;
    return { from: addDays(startOfWeek(first), -1), to: `${addDays(addMonths(first, 1), 7)}T23:59` };
  }, [view, anchor]);

  const { data: schedules = [], isLoading } = useQuery<PartnerSchedule[]>({
    queryKey: ["partner-schedules", from, to],
    queryFn: async () => (await api.get(`/schedule/partner?from=${from}&to=${to}`)).data.data,
    placeholderData: (prev) => prev, // 期間移動/再取得中も前の表示を残す
  });

  const { data: partnerUsers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["partner-schedule-users"],
    queryFn: async () => (await api.get("/users/by-module/partner_schedule")).data.data,
    staleTime: 5 * 60 * 1000,
  });

  const holidays = useQuery<Holiday[]>({
    queryKey: ["calendar-holidays", from, to],
    queryFn: async () => (await api.get("/business-hours/holidays", { params: { from, to } })).data.data,
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const holidayMap = useMemo(() => new Map((holidays.data ?? []).map((h) => [h.date, h])), [holidays.data]);

  const filtered = useMemo(
    () => schedules.filter((s) => !memberFilter || s.user_id === memberFilter),
    [schedules, memberFilter],
  );

  const events = useMemo<CalEvent[]>(() => filtered.map((s) => ({
    key: `ps-${s.id}`,
    id: s.id,
    layer: "partner",
    title: s.title,
    color: SCHEDULE_TYPE_COLORS[s.schedule_type] || SCHEDULE_TYPE_COLORS.other,
    typeLabel: SCHEDULE_TYPE_LABELS[s.schedule_type] ?? "その他",
    sub: s.user_name,
    source: "",
    allDay: !!s.all_day,
    start: s.start_time.slice(0, 16),
    end: s.end_time.slice(0, 16),
    tentative: false,
  })), [filtered]);

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
    const s = filtered.find((x) => x.id === e.id);
    if (s) setEditing(s);
  };

  return (
    <CalendarShell
      current="partners"
      icon={Users}
      title="パートナースケジュール"
      description="代休・有給・出張・社外活動などをパートナー間で共有します（この画面はパートナースケジュール権限を持つメンバーのみ閲覧できます）。"
      actions={canEdit ? (
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
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

      <CalToolbar
        view={view} onView={pickView} title={title} views={allowedViews}
        onPrev={() => step(-1)} onNext={() => step(1)} onToday={() => setAnchor(today)}
      />

      {isLoading && schedules.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : view === "month" ? (
        <MonthGrid
          anchor={`${anchor.slice(0, 7)}-01`} today={today} events={events} holidays={holidayMap}
          onPickDay={(d) => { setAnchor(d); pickView("day"); }} onOpen={open}
        />
      ) : view === "list" ? (
        <EventTable events={events} holidays={holidayMap} onOpen={open} emptyHint="メンバーの絞り込みを外していないか確かめてください。月を送ると別の期間を見られます。" />
      ) : (
        <TimeGrid
          days={view === "week" ? weekDays(anchor) : [anchor]}
          today={today} now={now} events={events} holidays={holidayMap}
          onOpen={open}
          onPickDay={(d) => { setAnchor(d); pickView("day"); }}
        />
      )}

      <PartnerScheduleDialog
        open={dialogOpen || !!editing}
        onOpenChange={(v) => { if (!v) { setDialogOpen(false); setEditing(null); } }}
        editing={editing}
        presetRange={editing ? null : { start: anchor, end: anchor }}
        isManager={isManager}
      />
    </CalendarShell>
  );
}
