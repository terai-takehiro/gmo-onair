// パートナースケジュール / マイカレンダー 共通の型・定数・小物。
// (StudioCalendarPage は既存 1000 行のため触らず、新ページ用にここへ集約)
//
// ⚠️ **`CalendarShell`／`CalendarNavPills`（統合・スタジオ・マイの回遊ピル）は
// 2026-08・v4ネイティブUI化のバックログBでここから削除した。** 旧スタジオ
// カレンダー・旧マイカレンダー（この2画面だけの部品だった）を退役させたため、
// 呼び出し元が無くなった。復元するなら git 履歴からこのファイルの旧版を参照

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
  source: "manual" | "ics" | "google" | "outlook";
  feed_id: string | null;
  feed_label?: string | null;
  // 書き戻し (ONAiR→外部) の反映先
  external_provider?: string | null;
  // 共有関連 (GET /schedule/personal が付与)
  is_owner?: boolean;
  shared?: boolean;
  owner_id?: string;
  owner_name?: string;
  shared_with?: Array<{ id: string; name: string }>;
  can_edit?: boolean;
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

// スタジオ予約種別の色/ラベル — StudioCalendarPage と同一セット (統合ビューで使用)
export const BOOKING_TYPE_COLORS: Record<string, string> = {
  performance: "#dc2626",
  rehearsal: "#f59e0b",
  hold: "#3b82f6",
  consultation: "#10b981",
  maintenance: "#64748b",
  tour: "#8b5cf6",
  internal: "#0891b2",
  setup: "#d97706",
  other: "#6b7280",
};

export const BOOKING_TYPE_LABELS: Record<string, string> = {
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

/**
 * スマホ幅か。**実装は `shared/src/client-v4/mobile.ts` の1本だけ**にする。
 *
 * ここには同じものが独立して書かれており（引数つき・既定 1024）、
 * `StudioCalendarPage` にも**3つ目の写し**（既定 640）がありました。
 * 呼び出しは全部 1024 だったので挙動は同じでしたが、
 * **CSS の `lg` と揃っているかを確かめる場所が3つ**あることになります。
 * 再エクスポートに畳んで、直す場所を1つにしました。
 */
export { useIsMobile } from "@gmo-onair/shared/src/client-v4/mobile";

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

// ─── カレンダー間で共有する 表示ビュー + 表示日付 ──────────────────────────
// 統合/スタジオ/パートナー/マイ を切り替えても「同じ月・同じビュー」を維持して
// 切り替え時のリセット感 (ガタつき) を無くすための永続化。
const CAL_STATE_KEY = "gmo_cal_view_state";

export interface SharedCalState {
  view?: string;    // FullCalendar のビュー名 (dayGridMonth 等)
  dateStr?: string; // 表示期間の代表日 (YYYY-MM-DD, ローカル)
}

export function loadCalState(): SharedCalState {
  try {
    const raw = localStorage.getItem(CAL_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function saveCalState(view: string, date: Date) {
  try {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    localStorage.setItem(CAL_STATE_KEY, JSON.stringify({ view, dateStr }));
  } catch { /* ignore */ }
}

/** 保存されたビューが対象ページで使えない場合はフォールバックに丸める */
export function clampView(view: string | undefined, allowed: string[], fallback: string): string {
  return view && allowed.includes(view) ? view : fallback;
}

/** 終日イベントの inclusive 終了日 → FullCalendar の exclusive end (+1 日、ローカル演算) */
export function toExclusiveEnd(endDate: string): string {
  const [y, m, d] = endDate.split("T")[0].split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

