/**
 * トップページのアプリタイルに出す件数 (v4)
 *
 * モックは各アプリに数字を出しますが、説明は「**あなたが押せば片づくもの**の件数」です。
 * 「そのアプリにある物の総数」ではありません — 総数を出しても、押す理由になりません。
 *
 * ── 数えられないものは出さない ──────────────────────────────
 *
 * 案件管理と日常業務のぶんは**ここでは数えません**。受信箱 (`GET /dashboard/inbox`) が
 * 同じものを既に数えているので、ここでも数えると**2か所で数えることになり、
 * いつか必ず食い違います**。画面はあちらの `counts` を使います。
 *
 * 設定とプロジェクト管理には数字を出しません（前者は片づける物という概念が無く、
 * 後者はまだ画面がありません）。
 *
 * ── 権限が無いアプリは数えない ──────────────────────────────
 *
 * 見えないアプリの件数を返すと、**タイルが出ないのに数字だけ知られる**ことになります
 * (「その部署に未払いが3件ある」等)。権限のあるものだけを SQL に入れます。
 */
import { queryOne } from '../../../shared/db/connection';

export interface AppBadges {
  /** 財務管理: 請求書を出したのに入金が無いもの */
  budget?: number;
  /** カレンダー: 本予約に変えていない仮押さえ */
  calendar?: number;
  /** 機材管理: 返却期限を過ぎている貸出 */
  equipment?: number;
}

interface Access {
  role?: string;
  permissions?: Record<string, string> | null;
}

function can(access: Access, moduleName: string): boolean {
  return access.role === 'system_admin' || !!access.permissions?.[moduleName];
}

export async function getAppBadges(access: Access): Promise<AppBadges> {
  // `budget` / `calendar` は権限モデル単純化で `sales` に統合済み。
  // レスポンスのキー名は元々どちらもタイルの対応表として変えていなかったが、
  // 2026-08-22 に calendar 側だけアプリの AppKey 改名 (`studio` → `calendar`) に合わせて
  // `studio` から `calendar` へ変更した。`budget` は引き続き歴史的な名前のまま
  const wantBudget = can(access, 'sales');
  const wantCalendar = can(access, 'sales');
  const wantEquipment = can(access, 'equipment');

  if (!wantBudget && !wantCalendar && !wantEquipment) return {};

  // **1本のクエリにまとめる。** 3本に分けると遅い1本のせいで数字が後から差し替わり、
  // 見ている途中でタイルの数字が動く (salesOverview.service と同じ考え方)。
  // 権限の無いものは `NULL` を選び、画面ではキーごと出さない。
  const row = (await queryOne(
    `SELECT
       ${wantBudget ? `(SELECT COUNT(*) FROM revenues r
           WHERE r.deleted_at IS NULL AND r.status = 'confirmed' AND r.group_id IS NULL
             AND r.invoice_issued = true AND r.paid_date IS NULL)` : 'NULL'} AS budget,
       ${wantCalendar ? `(SELECT COUNT(*) FROM studio_bookings b
           WHERE b.deleted_at IS NULL AND b.booking_type = 'hold'
             AND substr(b.start_time, 1, 10) >= to_char(NOW(), 'YYYY-MM-DD'))` : 'NULL'} AS calendar,
       ${wantEquipment ? `(SELECT COUNT(*) FROM equipment_lendings l
           WHERE l.returned_at IS NULL AND l.due_date IS NOT NULL
             AND l.due_date < to_char(NOW(), 'YYYY-MM-DD'))` : 'NULL'} AS equipment`
  )) as Record<string, string | null> | null;

  const out: AppBadges = {};
  if (wantBudget) out.budget = Number(row?.budget ?? 0);
  if (wantCalendar) out.calendar = Number(row?.calendar ?? 0);
  if (wantEquipment) out.equipment = Number(row?.equipment ?? 0);
  return out;
}
