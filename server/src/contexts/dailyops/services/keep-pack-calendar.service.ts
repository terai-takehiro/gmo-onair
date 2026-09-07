/**
 * 定例報告パック — 9. 進捗状況の推移（2024-01〜）と、稼働カレンダー（当月・翌月）
 *
 * ── 推移（`trend`）────────────────────────────────────────────
 *   売上（グループ内／外部）… 確定売上（`status='confirmed'`）を計上月で足し、案件の
 *                             `customer_type`（**当時の値**）で分ける。`companies.is_gmo_group` の
 *                             いまの値で塗り替えない（§5.2）。案件の無い売上は外部に寄せる
 *   案件数                 … 本番の開始日がその月にある受注済み以降の案件（a_won / r_delivered / s_completed）
 *   営業日数・稼働日数・稼働率 … §5.4。数える種別・土曜は `keep_settings`（`getUtilizationSettings`）
 *   最後の点は会議の月（進行中）。前の月までが閉じた数字
 *
 * ── 稼働率の決めごと（§5.4・ご判断 2026-09-06）─────────────────
 *   稼働率 = スタジオ利用があった日数 ÷ 営業日数 × 100
 *   同じ日に複数の予定があっても 1 日。部屋数は掛けない。日をまたぐ予定はその日数ぶん数える。
 *   営業日は土日祝を除く（土曜は設定で足せる）。祝日はサーバーの `holidays.ts`。
 *
 * ── カレンダー（`calendars`）──────────────────────────────────
 *   会議の月と翌月。日 → 予定（種別と短い名前）。予定の種別（`booking_type`）はカレンダーの
 *   語彙そのまま（画面が色に変える）。仮押さえ・メンテナンスも**予定としては出す**（数えるかは設定）。
 */
import { queryAll } from '../../../shared/db/connection';
import { keepReportService } from '../../sales/services/keep-report.service';
import type { UtilizationSettings } from '../../sales/services/keep-report-rules';
import {
  addDays, addMonths, businessDaysInMonth, holidayPredicate, listMonthDays, utilizationRate, weekdayOf,
} from './keep-pack-calc';
import type { MonthlyTrendPoint, UtilizationCalendar } from './keep-pack.types';
import { perProjectRowsSql } from './keep-pack-sql';

/** 推移の始まり（資料の「売上高と稼働件数（2024/1〜）」） */
export const TREND_FROM = '2024-01';
const WON_STAGES = ['a_won', 'r_delivered', 's_completed'];

interface BookingRow {
  title: string | null;
  booking_type: string;
  start_time: string;
  end_time: string | null;
  project_name: string | null;
}

/** 稼働率の数え方（`keep_settings`）。無い鍵は既定で埋まる */
export async function loadUtilizationSettings(): Promise<UtilizationSettings> {
  const s = await keepReportService.getUtilizationSettings();
  return { counted_types: s.counted_types, count_saturday: s.count_saturday };
}

/** `from`〜`to`（`YYYY-MM-DD`・両端含む）に重なる予定 */
async function listBookings(from: string, to: string): Promise<BookingRow[]> {
  return await queryAll(
    `SELECT b.title, b.booking_type, b.start_time, b.end_time, p.name AS project_name
       FROM studio_bookings b
       LEFT JOIN projects p ON p.id = b.project_id
      WHERE b.deleted_at IS NULL
        AND NULLIF(b.start_time, '') IS NOT NULL
        AND substr(b.start_time, 1, 10) <= ?
        AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?
      ORDER BY b.start_time`,
    [to, from],
  ) as unknown as BookingRow[];
}

/** 予定が掛かる日（`from`〜`to` に収まる範囲だけ）。終了が開始より前の壊れた行は開始日だけ */
function daysOf(b: BookingRow, from: string, to: string): string[] {
  const start = b.start_time.slice(0, 10);
  let end = (b.end_time || b.start_time).slice(0, 10);
  if (end < start) end = start;
  const out: string[] = [];
  for (let d = start < from ? from : start; d <= end && d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * その日を営業日として数えるか（分母と同じ決まり）。
 * 分子（利用があった日）も営業日に限る — 土日の利用まで数えると分母を超えて 100% を越えるため。
 */
function isBusinessDay(day: string, settings: UtilizationSettings, isHoliday: (d: string) => boolean): boolean {
  const w = weekdayOf(day);
  if (w === 0) return false;
  if (w === 6 && !settings.count_saturday) return false;
  return !isHoliday(day);
}

/** 月ごとの「利用があった営業日」の集合 */
function activeDaysByMonth(
  bookings: BookingRow[], settings: UtilizationSettings, isHoliday: (d: string) => boolean, from: string, to: string,
): Map<string, Set<string>> {
  const counted = new Set(settings.counted_types);
  const out = new Map<string, Set<string>>();
  for (const b of bookings) {
    if (!counted.has(b.booking_type)) continue;
    for (const day of daysOf(b, from, to)) {
      if (!isBusinessDay(day, settings, isHoliday)) continue;
      const ym = day.slice(0, 7);
      const set = out.get(ym) ?? new Set<string>();
      set.add(day);
      out.set(ym, set);
    }
  }
  return out;
}

function monthsBetween(fromYm: string, toYm: string): string[] {
  const out: string[] = [];
  for (let ym = fromYm; ym <= toYm; ym = addMonths(ym, 1)) out.push(ym);
  return out;
}

/** 2024-01 〜 会議の月の推移 */
export async function buildTrend(meetingMonth: string, settings: UtilizationSettings): Promise<MonthlyTrendPoint[]> {
  const months = monthsBetween(TREND_FROM, meetingMonth);
  const from = `${TREND_FROM}-01`;
  const to = `${meetingMonth}-31`;
  const [revRows, countRows, bookings] = await Promise.all([
    queryAll(
      // グループ内／外部はお客様の区分（案件の customer_type）で切るので、按分（グループ請求）は
      // allocation の額を各案件へ割ってから見る（perProjectRowsSql）。行の代表案件で切ると按分先が片方に寄る
      `SELECT substr(x.recognition_date, 1, 7) AS ym,
              CASE WHEN p.customer_type = 'internal' THEN 'internal' ELSE 'external' END AS seg,
              COALESCE(SUM(x.amount), 0)::bigint AS total
         FROM (${perProjectRowsSql('revenues', "AND t.status = 'confirmed'")}) x
         LEFT JOIN projects p ON p.id = x.project_id
        GROUP BY 1, 2`,
      [from, to, from, to],
    ) as Promise<{ ym: string; seg: string; total: unknown }[]>,
    queryAll(
      `SELECT substr(p.event_start, 1, 7) AS ym,
              CASE WHEN p.customer_type = 'internal' THEN 'internal' ELSE 'external' END AS seg,
              COUNT(*)::int AS n
         FROM projects p
        WHERE p.deleted_at IS NULL AND p.stage = ANY(?)
          AND NULLIF(p.event_start, '') IS NOT NULL
          AND p.event_start >= ? AND p.event_start <= ?
        GROUP BY 1, 2`,
      [WON_STAGES, from, to],
    ) as Promise<{ ym: string; seg: string; n: unknown }[]>,
    listBookings(from, to),
  ]);
  const rev = new Map<string, number>();
  for (const r of revRows) rev.set(`${r.ym}:${r.seg}`, Number(r.total) || 0);
  const cnt = new Map<string, number>();
  for (const r of countRows) cnt.set(`${r.ym}:${r.seg}`, Number(r.n) || 0);
  const isHoliday = holidayPredicate(Number(TREND_FROM.slice(0, 4)), Number(meetingMonth.slice(0, 4)));
  const active = activeDaysByMonth(bookings, settings, isHoliday, from, to);

  return months.map((ym) => {
    const businessDays = businessDaysInMonth(ym, { countSaturday: settings.count_saturday, isHoliday });
    const activeDays = active.get(ym)?.size ?? 0;
    return {
      year_month: ym,
      revenue_internal: rev.get(`${ym}:internal`) ?? 0,
      revenue_external: rev.get(`${ym}:external`) ?? 0,
      project_count_internal: cnt.get(`${ym}:internal`) ?? 0,
      project_count_external: cnt.get(`${ym}:external`) ?? 0,
      business_days: businessDays,
      active_days: activeDays,
      utilization: utilizationRate(activeDays, businessDays),
    };
  });
}

/** 指定した月（当月・翌月）の稼働カレンダー */
export async function buildCalendars(months: string[], settings: UtilizationSettings): Promise<UtilizationCalendar[]> {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const from = `${sorted[0]}-01`;
  const to = `${sorted[sorted.length - 1]}-31`;
  const bookings = await listBookings(from, to);
  const counted = new Set(settings.counted_types);
  const years = sorted.map((ym) => Number(ym.slice(0, 4)));
  const isHoliday = holidayPredicate(Math.min(...years), Math.max(...years));

  return months.map((ym) => {
    const monthDays = listMonthDays(ym);
    const first = monthDays[0];
    const last = monthDays[monthDays.length - 1];
    const days: UtilizationCalendar['days'] = {};
    const activeDays = new Set<string>();
    for (const b of bookings) {
      const label = (b.title || b.project_name || '').trim() || b.booking_type;
      for (const day of daysOf(b, first, last)) {
        (days[day] ??= []).push({ kind: b.booking_type, label });
        if (counted.has(b.booking_type) && isBusinessDay(day, settings, isHoliday)) activeDays.add(day);
      }
    }
    const businessDays = businessDaysInMonth(ym, { countSaturday: settings.count_saturday, isHoliday });
    return {
      year_month: ym,
      utilization: utilizationRate(activeDays.size, businessDays),
      days,
      counted_kinds: [...settings.counted_types],
    };
  });
}
