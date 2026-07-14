import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, Users, CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";
import { cn } from "@/lib/utils";

// パートナースケジュール / マイカレンダー 共通の型・定数・小物。
// (StudioCalendarPage は既存 1000 行のため触らず、新ページ用にここへ集約)

export interface PartnerSchedule {
  id: string;
  user_id: string;
  user_name: string;
  schedule_type: string;
  title: string;
  all_day: number;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_by?: string | null;
}

export interface PersonalEvent {
  id: string;
  title: string;
  all_day: number;
  start_time: string;
  end_time: string;
  location: string | null;
  notes: string | null;
  source: "manual" | "ics";
  feed_id: string | null;
  feed_label?: string | null;
}

export interface IcsFeed {
  id: string;
  label: string;
  enabled: boolean;
  url_masked: string;
  last_synced_at: string | null;
  last_error: string | null;
  event_count: number | null;
}

export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  daikyu: "代休",
  paid_leave: "有給",
  business_trip: "出張",
  external: "社外活動",
  remote: "リモート",
  other: "その他",
};

export const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  daikyu: "#3b82f6",        // 青
  paid_leave: "#10b981",    // 緑
  business_trip: "#f59e0b", // オレンジ
  external: "#8b5cf6",      // 紫
  remote: "#0891b2",        // シアン
  other: "#6b7280",         // グレー
};

// 日本の祝日 (2025–2027) — StudioCalendarPage と同一セット
export const JP_HOLIDAYS = new Set([
  "2025-01-01","2025-01-13","2025-02-11","2025-02-23","2025-02-24",
  "2025-03-20","2025-04-29","2025-05-03","2025-05-04","2025-05-05",
  "2025-05-06","2025-07-21","2025-08-11","2025-09-15","2025-09-21",
  "2025-09-22","2025-09-23","2025-10-13","2025-11-03","2025-11-23",
  "2025-11-24",
  "2026-01-01","2026-01-12","2026-02-11","2026-02-23",
  "2026-03-20","2026-04-29","2026-05-03","2026-05-04","2026-05-05",
  "2026-05-06","2026-07-20","2026-08-11","2026-09-21","2026-09-22",
  "2026-09-23","2026-10-12","2026-11-03","2026-11-23",
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23",
  "2027-03-21","2027-03-22","2027-04-29","2027-05-03","2027-05-04","2027-05-05",
  "2027-07-19","2027-08-11","2027-09-20","2027-09-23",
  "2027-10-11","2027-11-03","2027-11-23",
]);

export function useIsMobile(breakpoint = 1024) {
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

/** 祝日/土日のセル背景 (FullCalendar dayCellDidMount 用) */
export function paintHolidayCell(arg: { date: Date; el: HTMLElement }) {
  const d = arg.date;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dow = d.getDay();
  if (JP_HOLIDAYS.has(dateStr) || dow === 0) {
    arg.el.style.backgroundColor = "rgba(239,68,68,0.08)";
  } else if (dow === 6) {
    arg.el.style.backgroundColor = "rgba(59,130,246,0.08)";
  }
}

/** 終日イベントの inclusive 終了日 → FullCalendar の exclusive end (+1 日、ローカル演算) */
export function toExclusiveEnd(endDate: string): string {
  const [y, m, d] = endDate.split("T")[0].split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/** スタジオ / パートナー / マイ の 3 カレンダー回遊ピル */
export function CalendarNavPills({ current }: { current: "studio" | "partners" | "my" }) {
  const { currentUser, hasPermission } = useAuth();
  const canPartner = currentUser?.role === "system_admin" || hasPermission("partner_schedule");
  const pills = [
    { key: "studio", label: "スタジオ", to: "/studio/calendar", icon: CalendarDays, show: true },
    { key: "partners", label: "パートナー", to: "/studio/partners", icon: Users, show: canPartner },
    { key: "my", label: "マイ", to: "/studio/my-calendar", icon: CalendarClock, show: canPartner },
  ].filter((p) => p.show);
  if (pills.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1">
      {pills.map((p) => (
        <NavLink
          key={p.key}
          to={p.to}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            current === p.key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <p.icon className="h-3.5 w-3.5" />
          {p.label}
        </NavLink>
      ))}
    </div>
  );
}
