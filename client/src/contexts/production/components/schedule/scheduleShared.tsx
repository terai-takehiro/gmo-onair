import { useEffect, useRef, type ReactNode, type ElementType } from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, CalendarClock, Layers } from "lucide-react";
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

/**
 * 統合 / スタジオ / マイ のカレンダー回遊ピル。
 * モバイルで押し潰されて文字が縦折れしないよう、各ピルは whitespace-nowrap + shrink-0、
 * コンテナは横スクロール可 (overflow-x-auto) にしている。呼び出し側はヘッダーの
 * ボタン行に混ぜず、独立した行 (w-full) に置くこと。
 *
 * ⚠️ **「パートナー」のピルは削除した**（v3時代の遺物の棚卸し・2026-08）。
 * `/studio/partners` を削除し、① 予定（統合カレンダー）へ一本化したため
 * （作成・編集・人での絞り込みとも既に代替済みだった）。
 */
export function CalendarNavPills({ current }: { current: "all" | "studio" | "my" }) {
  const { currentUser, hasPermission } = useAuth();
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const isAdmin = currentUser?.role === "system_admin";
  const canStudio = isAdmin || hasPermission("studio");
  const canPartner = isAdmin || hasPermission("partner_schedule");

  // モバイルの横スクロール時、アクティブなピルが見切れないよう初期表示で寄せる
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [current]);

  // **v4 でカレンダーの URL が入れ替わった。**
  // `/studio/calendar` は v4 の ① 予定（統合＋レイヤー）になり、
  // `/studio/all` はそこへの転送になった。スタジオだけのカレンダーは
  // `/studio/studio-calendar` へ移った（予約を作る導線がそこにしかないので残してある）。
  // **直さないと「統合」と「スタジオ」が同じ画面に着く**（実ブラウザで確認した）
  const pills = [
    { key: "all", label: "予定（すべて）", to: "/studio/calendar", icon: Layers, show: canStudio || canPartner },
    { key: "studio", label: "スタジオ", to: "/studio/studio-calendar", icon: CalendarDays, show: canStudio },
    { key: "my", label: "マイ", to: "/studio/my-calendar", icon: CalendarClock, show: canPartner },
  ].filter((p) => p.show);
  if (pills.length <= 1) return null;
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border bg-muted/40 p-1">
      {pills.map((p) => (
        <NavLink
          key={p.key}
          to={p.to}
          ref={current === p.key ? activeRef : undefined}
          className={cn(
            // スマホは 44px（v4 の決めごと）。PC は今までどおり
            "min-h-tap flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors lg:min-h-0",
            current === p.key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <p.icon className="h-3.5 w-3.5 shrink-0" />
          {p.label}
        </NavLink>
      ))}
    </div>
  );
}

/**
 * 統合 / スタジオ / マイ の 3 カレンダーで共通のページ枠 (ヘッダー)。
 * 余白・タイトル位置・回遊ピルの配置を完全に統一することで、ページを切り替えても
 * 上部 (タイトル + ピル) がガタつかない (v2.9.188 の状態保持と合わせて滑らかに切替)。
 *   - 1 行目: アイコン + タイトル (flex-1) / アクション (sm:order-last)
 *   - 2 行目 (モバイル) or 右端 (sm+): 回遊ピル (w-full sm:w-auto)
 *   - 説明文は sm 以上のみ表示 (高さを一定に保つ)
 * ページ固有の 2 次コンテンツ (レイヤートグル / 部屋フィルタ / 凡例 / カレンダー本体) は children。
 */
export function CalendarShell({
  current, icon: Icon, title, description, actions, children,
}: {
  current: "all" | "studio" | "my";
  icon: ElementType;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="animate-in fade-in duration-200">
      <div className="space-y-4 p-4 sm:p-6">
        {/* ヘッダー: モバイルは「タイトル+アクション」「回遊ピル」の 2 行、sm 以上は 1 行 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="truncate text-lg font-bold sm:text-xl">{title}</h1>
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:order-last sm:gap-2">
              {actions}
            </div>
          )}
          <div className="flex w-full sm:w-auto">
            <CalendarNavPills current={current} />
          </div>
        </div>
        {description && (
          <p className="-mt-2 hidden text-sm text-muted-foreground sm:block">{description}</p>
        )}
        {children}
      </div>
    </div>
  );
}
