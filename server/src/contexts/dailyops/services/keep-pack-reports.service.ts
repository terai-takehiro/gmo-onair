/**
 * 定例報告パック — ②案件実施報告・③定期内覧会・前回議事録サマリ（keep-report.md §5.2）
 *
 * ── 実施報告（`event_reports`）─────────────────────────────────
 * 「前回の会議日以降に本番を終えた案件」= `event_end`（無ければ `event_start`）が
 * 前回の会議日より後・今回の会議日以前 で、受注済み以降（a_won / r_delivered / s_completed）の案件。
 * ふりかえり（`event_reports`）は `report_status` を問わず載せる（下書きは印を出す）。
 * ページの中身（写真・お金・KPT）は `keep-pack-pages.service.ts` が組む。
 *
 * ── 内覧会（`inview_registrations`）──────────────────────────────
 * 会議日以前の直近の回。組数・人数は**受付した人**（`checked_in_at`）で数え、誰も受付していない回
 * （受付をアプリで取らなかった日）は申込で数える。分類は来場者の会社（**業種の列は無い**ので
 * 会社名。空は「未分類」）。ヨミ化件数は `promoted_project_id` の数。満足度は ONAiR に無いので
 * 手入力（`keep_report_inputs` の `inview_satisfaction` = `{ score }`）。
 *
 * ── 前回議事録（`meeting_minutes`）────────────────────────────────
 * 前回の会議日の行。無ければ null。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { ESTIMATE_AMOUNT_LATERAL } from '../../sales/services/project.service';
import { keepReportService } from '../../sales/services/keep-report.service';
import { PAGE_SOURCE_COLUMNS, ESTIMATE_COST_LATERAL, type PageSource } from './keep-pack-pages.service';
import { scopeWhere } from './keep-pack-pipeline.service';
import type { EntityScope, InviewSummary, KeepInput, KeepReportPack, SegmentScope } from './keep-pack.types';

const FIXED_COGS_CODE = 'FIXED-COGS';
const WON_STAGES = ['a_won', 'r_delivered', 's_completed'];
/** 分類の表に出す行数の上限（資料は上位いくつか。全部出すと表が収まらない） */
const MAX_CATEGORIES = 12;

/**
 * 会社分類の表は MAX_CATEGORIES 行まで。**はみ出た分は捨てずに「その他」に足す** —
 * 落とすと表の合計が参加者の合計と合わなくなる（pptx の「合計」行はこの配列を足して出す）
 */
function foldCategories(rows: Array<{ category: string; groups: number; people: number }>): Array<{ category: string; groups: number; people: number }> {
  if (rows.length <= MAX_CATEGORIES) return rows;
  const head = rows.slice(0, MAX_CATEGORIES - 1);
  const rest = rows.slice(MAX_CATEGORIES - 1);
  return [...head, {
    category: `その他（${rest.length}分類）`,
    groups: rest.reduce((a, r) => a + r.groups, 0),
    people: rest.reduce((a, r) => a + r.people, 0),
  }];
}

/** 前回の会議日より後・今回の会議日以前に本番を終えた案件（ふりかえりの有無を問わない） */
export async function listEventReportSources(opts: {
  previousMeetingDate: string | null; meetingDate: string; entity: EntityScope; segment: SegmentScope;
}): Promise<PageSource[]> {
  const scope = scopeWhere(opts.entity, opts.segment);
  const params: unknown[] = [FIXED_COGS_CODE, WON_STAGES, opts.meetingDate];
  let since = '';
  if (opts.previousMeetingDate) {
    since = " AND COALESCE(NULLIF(p.event_end, ''), p.event_start) > ?";
    params.push(opts.previousMeetingDate);
  }
  return await queryAll(
    `SELECT ${PAGE_SOURCE_COLUMNS}, er.headline, er.report_status
       FROM projects p
       LEFT JOIN companies c ON c.id = p.customer_id
       LEFT JOIN event_reports er ON er.project_id = p.id
       ${ESTIMATE_AMOUNT_LATERAL}
       ${ESTIMATE_COST_LATERAL}
      WHERE p.deleted_at IS NULL
        AND COALESCE(p.code, '') <> ?
        AND p.stage = ANY(?)
        AND NULLIF(p.event_start, '') IS NOT NULL
        AND COALESCE(NULLIF(p.event_end, ''), p.event_start) <= ?${since}${scope.sql}
      ORDER BY COALESCE(NULLIF(p.event_end, ''), p.event_start), p.name`,
    [...params, ...scope.params],
  ) as unknown as PageSource[];
}

/** 手入力の満足度（`{ score: 3.9 }`）。無い・数でなければ null */
export function satisfactionOf(inputs: KeepInput[]): number | null {
  const row = inputs.find((i) => i.key === 'inview_satisfaction');
  const score = Number(row?.value?.score);
  return Number.isFinite(score) ? score : null;
}

/** 会議日以前の直近の定期内覧会。1回も無ければ null */
export async function buildInview(meetingDate: string, inputs: KeepInput[]): Promise<InviewSummary | null> {
  const latest = await queryOne(
    `SELECT session_date,
            COUNT(*)::int AS applied_groups,
            COALESCE(SUM(party_size), 0)::int AS applied_people,
            COUNT(checked_in_at)::int AS checked_groups,
            COALESCE(SUM(party_size) FILTER (WHERE checked_in_at IS NOT NULL), 0)::int AS checked_people,
            COUNT(DISTINCT promoted_project_id)::int AS promoted
       FROM inview_registrations
      WHERE deleted_at IS NULL AND NULLIF(session_date, '') IS NOT NULL AND session_date <= ?
      GROUP BY session_date
      ORDER BY session_date DESC
      LIMIT 1`,
    [meetingDate],
  ) as {
    session_date: string; applied_groups: number; applied_people: number;
    checked_groups: number; checked_people: number; promoted: number;
  } | undefined;
  if (!latest) return null;

  // 受付した人が1人でもいればその日は受付で数える。無ければ申込で数える
  const useCheckedIn = Number(latest.checked_groups) > 0;
  const checkedWhere = useCheckedIn ? ' AND checked_in_at IS NOT NULL' : '';
  const [categories, next] = await Promise.all([
    queryAll(
      `SELECT COALESCE(NULLIF(TRIM(company), ''), '未分類') AS category,
              COUNT(*)::int AS groups, COALESCE(SUM(party_size), 0)::int AS people
         FROM inview_registrations
        WHERE deleted_at IS NULL AND session_date = ?${checkedWhere}
        GROUP BY 1
        ORDER BY people DESC, groups DESC, category`,
      [latest.session_date],
    ) as Promise<{ category: string; groups: number; people: number }[]>,
    queryOne(
      `SELECT session_date, COUNT(*)::int AS applied_groups
         FROM inview_registrations
        WHERE deleted_at IS NULL AND NULLIF(session_date, '') IS NOT NULL AND session_date > ?
        GROUP BY session_date
        ORDER BY session_date ASC
        LIMIT 1`,
      [meetingDate],
    ) as Promise<{ session_date: string; applied_groups: number } | undefined>,
  ]);

  return {
    session_date: latest.session_date,
    groups: Number(useCheckedIn ? latest.checked_groups : latest.applied_groups),
    people: Number(useCheckedIn ? latest.checked_people : latest.applied_people),
    satisfaction: satisfactionOf(inputs),
    promoted_projects: Number(latest.promoted),
    by_category: foldCategories(categories.map((c) => ({ category: c.category, groups: Number(c.groups), people: Number(c.people) }))),
    next_session: next ? { date: next.session_date, applied_groups: Number(next.applied_groups) } : null,
  };
}

/** 前回議事録サマリの材料。前回の会議日が無い・行が無ければ null */
export async function buildMinutes(previousMeetingDate: string | null): Promise<KeepReportPack['minutes']> {
  if (!previousMeetingDate) return null;
  const row = await keepReportService.getMinutes(previousMeetingDate);
  if (!row) return null;
  const decisions = Array.isArray(row.decisions) ? (row.decisions as unknown[]).map(String) : [];
  const topics = Array.isArray(row.topics)
    ? (row.topics as Array<{ area?: unknown; text?: unknown }>).map((t) => ({ area: String(t?.area ?? ''), text: String(t?.text ?? '') }))
    : [];
  return { decisions, topics, next_meeting_date: (row.next_meeting_date as string | null) ?? null };
}
