// 予定表 (香盤表) の型・定数・小さな道具 — v2.9.294 で SchedulePage.tsx から切り出し。
//
// **中身は 1 行も変えていない**（移動 + export のみ）。
// 祝日の一覧のように「調べて直すもの」がページの本文に埋まっていると、
// 直すたびに 1,500 行のファイルを開くことになる。
import { useEffect, useState } from 'react';

export interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
  color: string;
  sort_order: number;
  room_type: string;
}

export interface StudioLocation {
  id: string;
  name: string;
  sort_order: number;
  rooms: StudioRoom[];
}

export interface BookingRoom {
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
export function roomShortLabel(r: BookingRoom): string {
  const abbr = r.room_abbreviation?.trim();
  if (abbr) return abbr;
  return r.room_name.slice(0, 2);
}

// 部屋略称チェイン — 4 部屋以上は省略
export function buildRoomChain(rooms: BookingRoom[]): string {
  const labels = rooms.map(roomShortLabel);
  if (labels.length <= 3) return labels.join('・');
  return `${labels.slice(0, 3).join('・')} +${labels.length - 3}`;
}

export interface StudioBooking {
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

export const bookingTypeColors: Record<string, string> = {
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

export const bookingTypeLabels: Record<string, string> = {
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
export const JP_HOLIDAYS = new Set([
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

export function useIsMobile(breakpoint = 640) {
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

export type LayerKey = "studio" | "partner" | "me";
export const ALL_LAYERS: LayerKey[] = ["studio", "partner", "me"];
export const MANUAL_COLOR = "#2563eb";
export const ICS_COLOR = "#64748b";

/** 仮押さえの「期限が近い」= 本番日まであと何日か。切替期限の列は持っていない */
export interface HoldRow {
  id: string;
  title: string;
  start_date: string;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  customer_name: string | null;
  room_names: string | null;
}

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (date: string) =>
  Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${todayStr()}T00:00:00`)) / 86_400_000);
