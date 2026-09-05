/**
 * ① ダッシュボードが読むデータの形。
 *
 * `DashboardPage.tsx`（PC のグリッド・Row 一覧）と、スマホ専用の
 * `KpiRail.tsx` / `LendingCards.tsx` / `MaintenanceCards.tsx` が
 * どちらもここを読む。書き写すと、片方だけ列を足したときに型が食い違う。
 */
export interface Stats {
  /** 本日・明日の持ち出し・返却 (migration 168)。持ち出しは予定・返却は返却予定日 */
  in_out: { out_today: number; out_tomorrow: number; in_today: number; in_tomorrow: number };
  /**
   * ⚠️ **機材台帳の既定表示（子機材を除いた親機材のみ）と揃えてある**
   * （UXレポート 2026-08-18 指摘。以前は子機材込みの全件で、台帳一覧の
   * 「機材 ◯点」と数字が食い違っていた）。子機材込みの総数は
   * `total_items_with_children` を見る
   */
  total_items: number;
  total_items_with_children: number;
  active_items: number;
  in_repair: number;
  lent_out: number;
  overdue: number;
  open_maintenance: number;
  pending_inventory: number;
  recent_lendings: {
    id: string; borrower_name: string; due_date: string | null; lent_at: string;
    equipment_name: string; unit_number: number | null;
    project_name: string | null; gls_number: string | null;
  }[];
  recent_maintenance: {
    id: string; title: string; record_type: string; status: string; equipment_name: string;
  }[];
}
