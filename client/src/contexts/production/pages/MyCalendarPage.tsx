/**
 * マイカレンダー（v4・FullCalendar を撤去した回）
 *
 * ① 予定（統合カレンダー）と同じ描画部品（`calendar/`）に載せ替えた。
 * データの取り方（個人予定 + 自分のパートナー予定を重ねる）・ダイアログ・
 * OAuth コールバックの受け口は1行も変えていない — 変えたのは
 * **マス目の描き方**だけ（FullCalendar → 自前描画）。
 *
 * **色分けは① 予定より詳しいまま残した**（Google/Outlook/ICS/共有を別色に）。
 * ① 予定の3層モデルは「自分の予定」を1層としてしか扱わず、取込元の区別は
 * 「取込元」の札だけに畳んでいる。マイカレンダーは元々ここが本人にとって
 * 一番大事な区別（自分で入れたか外部同期か）なので、ここだけは崩さない。
 *
 * **クリック&ドラッグでの新規作成は無くした**（① 予定と同じ判断）。
 * 「予定を登録」ボタンから入れる形に統一している。
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, CalendarClock, CloudDownload } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/platform/AuthContext";
import PersonalEventDialog from "../components/schedule/PersonalEventDialog";
import IcsFeedsDialog from "../components/schedule/IcsFeedsDialog";
import {
  SCHEDULE_TYPE_COLORS, SCHEDULE_TYPE_LABELS,
  useIsMobile, CalendarShell, type PersonalEvent, type PartnerSchedule,
} from "../components/schedule/scheduleShared";
import {
  ymd, addDays, addMonths, startOfWeek, weekDays, type CalEvent,
} from "./calendar/calendarLayout";
import { CalToolbar, type CalView } from "./calendar/CalToolbar";
import { MonthGrid } from "./calendar/MonthGrid";
import { TimeGrid } from "./calendar/TimeGrid";
import { EventTable } from "./calendar/EventTable";
import type { Holiday } from "./calendar/useCalendarEvents";

// マイカレンダー — 本人のみに表示される個人カレンダー。
//   ・手入力の個人予定 (青)
//   ・Outlook/Google から ICS 購読で同期した予定 (グレー)
//   ・自分のパートナースケジュール (代休/有給等・種別色) も参考表示
const MANUAL_COLOR = "#2563eb";
const ICS_COLOR = "#64748b";
const GOOGLE_COLOR = "#16a34a";
const OUTLOOK_COLOR = "#0078d4";
const SHARED_COLOR = "#9333ea"; // 共有予定 (自分が共有した/された) は紫で区別

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function MyCalendarPage() {
  const isMobile = useIsMobile();
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

  const today = ymd(new Date());
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalView>(isMobile ? "list" : "month");
  const [anchor, setAnchor] = useState(today);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [feedsDialogOpen, setFeedsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalEvent | null>(null);

  // **月・週・日は 375px だとマスが数ミリ角になる**（① 予定と同じ理由）
  const allowedViews: CalView[] = isMobile ? ["list"] : ["month", "week", "day", "list"];
  const pickView = (v: CalView) => setView(allowedViews.includes(v) ? v : "list");

  const { from, to } = useMemo(() => {
    if (view === "week") { const w = weekDays(anchor); return { from: w[0], to: `${w[6]}T23:59` }; }
    if (view === "day") return { from: anchor, to: `${anchor}T23:59` };
    const first = `${anchor.slice(0, 7)}-01`;
    return { from: addDays(startOfWeek(first), -1), to: `${addDays(addMonths(first, 1), 7)}T23:59` };
  }, [view, anchor]);

  const { data: events = [], isLoading } = useQuery<PersonalEvent[]>({
    queryKey: ["personal-events", from, to],
    queryFn: async () => (await api.get(`/schedule/personal?from=${from}&to=${to}`)).data.data,
    placeholderData: (prev) => prev,
  });

  // 自分のパートナー予定 (代休/有給等) も参考表示
  const { data: mySchedules = [] } = useQuery<PartnerSchedule[]>({
    queryKey: ["my-partner-schedules", from, to, currentUser?.id],
    queryFn: async () => (await api.get(`/schedule/partner?from=${from}&to=${to}&user_id=${currentUser!.id}`)).data.data,
    enabled: !!currentUser?.id,
    placeholderData: (prev) => prev,
  });

  const holidays = useQuery<Holiday[]>({
    queryKey: ["calendar-holidays", from, to],
    queryFn: async () => (await api.get("/business-hours/holidays", { params: { from, to } })).data.data,
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const holidayMap = useMemo(() => new Map((holidays.data ?? []).map((h) => [h.date, h])), [holidays.data]);

  const calEvents = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = events.map((e) => {
      const isAllDay = !!e.all_day;
      const isSharedIn = e.is_owner === false;
      const isShared = !!e.shared;
      const color = isShared ? SHARED_COLOR
        : e.source === "google" ? GOOGLE_COLOR : e.source === "outlook" ? OUTLOOK_COLOR : e.source === "ics" ? ICS_COLOR : MANUAL_COLOR;
      const base = e.source === "ics" && e.feed_label ? `${e.title}｜${e.feed_label}` : e.title;
      const title = isSharedIn ? `👥 ${base}（${e.owner_name || "共有"}）` : isShared ? `👥 ${base}` : base;
      return {
        key: `pe-${e.id}`,
        id: e.id,
        layer: "my",
        title,
        color,
        typeLabel: isShared ? "共有" : "自分",
        sub: e.location || e.feed_label || (e.owner_name ?? ""),
        source: e.source === "google" ? "Google" : e.source === "outlook" ? "Outlook" : e.source === "ics" ? "ICS" : "",
        allDay: isAllDay,
        start: e.start_time.slice(0, 16),
        end: e.end_time.slice(0, 16),
        tentative: false,
      };
    });
    for (const s of mySchedules) {
      const isAllDay = !!s.all_day;
      list.push({
        key: `ps-${s.id}`,
        id: s.id,
        layer: "partner",
        title: `【${SCHEDULE_TYPE_LABELS[s.schedule_type] || "予定"}】${s.title}`,
        color: SCHEDULE_TYPE_COLORS[s.schedule_type] || SCHEDULE_TYPE_COLORS.other,
        typeLabel: SCHEDULE_TYPE_LABELS[s.schedule_type] ?? "その他",
        sub: "",
        source: "",
        allDay: isAllDay,
        start: s.start_time.slice(0, 16),
        end: s.end_time.slice(0, 16),
        tentative: false,
      });
    }
    return list;
  }, [events, mySchedules]);

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
    // パートナー予定はここでは編集しない（パートナースケジュール画面で編集する）
    if (e.layer !== "my") return;
    const found = events.find((x) => x.id === e.id);
    if (found) setEditing(found);
  };

  return (
    <CalendarShell
      current="my"
      icon={CalendarClock}
      title="マイカレンダー"
      description="あなただけに表示される個人カレンダーです。Outlook/Google の予定を連携し、双方向で同期できます。会議予定などはメンバーに共有できます。"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => setFeedsDialogOpen(true)}>
            <CloudDownload className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">外部カレンダー連携</span>
            <span className="sm:hidden">連携</span>
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setEventDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">予定を登録</span>
            <span className="sm:hidden">登録</span>
          </Button>
        </>
      }
    >
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
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SHARED_COLOR }} />
          共有予定
        </span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SCHEDULE_TYPE_COLORS.daikyu }} />
          パートナー予定（自分の分）
        </span>
      </div>

      <CalToolbar
        view={view} onView={pickView} title={title} views={allowedViews}
        onPrev={() => step(-1)} onNext={() => step(1)} onToday={() => setAnchor(today)}
      />

      {isLoading && events.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : view === "month" ? (
        <MonthGrid
          anchor={`${anchor.slice(0, 7)}-01`} today={today} events={calEvents} holidays={holidayMap}
          onPickDay={(d) => { setAnchor(d); pickView("day"); }} onOpen={open}
        />
      ) : view === "list" ? (
        <EventTable events={calEvents} holidays={holidayMap} onOpen={open} emptyHint="月を送ると別の期間を見られます。" />
      ) : (
        <TimeGrid
          days={view === "week" ? weekDays(anchor) : [anchor]}
          today={today} now={now} events={calEvents} holidays={holidayMap}
          onOpen={open}
          onPickDay={(d) => { setAnchor(d); pickView("day"); }}
        />
      )}

      <PersonalEventDialog
        open={eventDialogOpen || !!editing}
        onOpenChange={(v) => { if (!v) { setEventDialogOpen(false); setEditing(null); } }}
        editing={editing}
        presetRange={editing ? null : { start: anchor, end: anchor, allDay: false }}
      />
      <IcsFeedsDialog open={feedsDialogOpen} onOpenChange={setFeedsDialogOpen} />
    </CalendarShell>
  );
}
