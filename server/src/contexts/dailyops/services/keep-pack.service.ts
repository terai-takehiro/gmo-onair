/**
 * 定例報告パック（KeepReportPack）— 会議1回ぶんの数字を1本の JSON に集める（keep-report.md §5）
 *
 * ── 何を集めるか（型は `keep-pack.types.ts`・正は shared/src/keepReport/types.ts）────
 *   landing   … **会議の前の月**の着地（9/4 の会議なら 8月）。閉じた月の数字
 *   forecast  … **会議の月**の着地見込（9/4 なら 9月）。確定 ＋ 受注前案件の確度加味
 *   trend     … 2024-01 〜 会議の月（最後の点は進行中）
 *   pipeline  … いま生きている案件のヨミ表（ネタを含む）と、「資料」に印を付けた案件のページ
 *   event_reports … 前回の会議日以降に本番を終えた案件
 *   calendars … 会議の月と翌月の稼働カレンダー（資料の「当月・翌月」）
 *   inview / minutes … 直近の内覧会・前回の議事録
 *
 * `scope`（計上会社 `entity_code`・お客様の区分）は ヨミ表・案件ページ・実施報告 に効く。数値報告の表は
 * 常に 全体／会社別（SCS・GSS・数字があれば GMO）の全部を持つ（資料が3組を並べるため）。
 *
 * ── 前回の会議日 ────────────────────────────────────────────
 *   1. `meeting_minutes` に会議日より前の行があればその最新
 *   2. 無ければ凍結済みのパックの会議日で最新
 *   3. どちらも無ければ 14 日前（隔週）
 *
 * 各部分は別ファイル（1ファイル 400 行の決めごと）。ここは呼び出しの並列化と組み立てだけ。
 */
import { queryOne } from '../../../shared/db/connection';
import { addDays, addMonths, todayStr, weekdayOf } from './keep-pack-calc';
import { buildPlByEntity } from './keep-pack-pl.service';
import { buildPipeline } from './keep-pack-pipeline.service';
import { buildProjectPages } from './keep-pack-pages.service';
import { buildCalendars, buildTrend, loadUtilizationSettings } from './keep-pack-calendar.service';
import { buildInview, buildMinutes, listEventReportSources } from './keep-pack-reports.service';
import { getInputs } from './keep-pack-inputs.service';
import type { EntityScope, KeepInput, KeepReportPack, SegmentScope } from './keep-pack.types';

export interface BuildPackOptions {
  meetingDate: string;
  entity?: EntityScope;
  segment?: SegmentScope;
  /** 手入力（満足度など）。渡さなければ `keep_report_inputs` から読む */
  inputs?: KeepInput[];
}

/** 隔週の間隔（前回の会議日が分からないときの既定） */
const BIWEEKLY_DAYS = 14;
/** 隔週キープの曜日（水曜）。次回の開催日が分からないときの既定 */
const MEETING_WEEKDAY = 3;

/** 会議日より前の、いちばん新しい会議日。§「前回の会議日」の順で引く */
export async function resolvePreviousMeetingDate(meetingDate: string): Promise<string> {
  const minutes = await queryOne(
    'SELECT meeting_date FROM meeting_minutes WHERE meeting_date < ? ORDER BY meeting_date DESC LIMIT 1',
    [meetingDate],
  ) as { meeting_date: string } | undefined;
  if (minutes?.meeting_date) return minutes.meeting_date;
  const frozen = await queryOne(
    'SELECT meeting_date FROM keep_report_packs WHERE frozen_at IS NOT NULL AND meeting_date < ? ORDER BY meeting_date DESC LIMIT 1',
    [meetingDate],
  ) as { meeting_date: string } | undefined;
  if (frozen?.meeting_date) return frozen.meeting_date;
  return addDays(meetingDate, -BIWEEKLY_DAYS);
}

/** 今日から見た次の水曜（今日が水曜なら今日） */
function nextMeetingWeekday(today: string): string {
  const delta = (MEETING_WEEKDAY - weekdayOf(today) + 7) % 7;
  return addDays(today, delta);
}

/**
 * 次回・前回の開催日。`meeting_minutes` の最新の行の `next_meeting_date` と、今日以前の最新の
 * `meeting_date`。無ければ 次の水曜 と その 14 日前（人が入れ直せるよう画面は既定として出す）。
 */
export async function resolveMeetings(today: string = todayStr()): Promise<{ next_meeting_date: string; previous_meeting_date: string }> {
  const [latest, previous] = await Promise.all([
    queryOne('SELECT next_meeting_date FROM meeting_minutes ORDER BY meeting_date DESC LIMIT 1') as Promise<{ next_meeting_date: string | null } | undefined>,
    queryOne('SELECT meeting_date FROM meeting_minutes WHERE meeting_date <= ? ORDER BY meeting_date DESC LIMIT 1', [today]) as Promise<{ meeting_date: string } | undefined>,
  ]);
  const next = latest?.next_meeting_date && latest.next_meeting_date >= today
    ? latest.next_meeting_date
    : nextMeetingWeekday(today);
  const prev = previous?.meeting_date ?? addDays(next, -BIWEEKLY_DAYS);
  return { next_meeting_date: next, previous_meeting_date: prev };
}

/**
 * 週報の週（月曜〜日曜）にある会議日。その週に開催日（`meeting_minutes.meeting_date` か
 * `next_meeting_date`）が無ければ、次の開催日（`resolveMeetings`）。
 */
export async function resolveMeetingDateForWeek(weekStart: string): Promise<string> {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = await queryOne(
    `SELECT d FROM (
       SELECT meeting_date AS d FROM meeting_minutes WHERE meeting_date BETWEEN ? AND ?
       UNION ALL
       SELECT next_meeting_date AS d FROM meeting_minutes WHERE next_meeting_date BETWEEN ? AND ?
     ) x ORDER BY d LIMIT 1`,
    [weekStart, weekEnd, weekStart, weekEnd],
  ) as { d: string } | undefined;
  if (inWeek?.d) return inWeek.d;
  return (await resolveMeetings(weekStart)).next_meeting_date;
}

/** 「いまの数字」で会議1回ぶんのパックを組む（`frozen_at: null`）。凍結は `keep-pack-store.service.ts` */
export async function buildPack(opts: BuildPackOptions): Promise<KeepReportPack> {
  const meetingDate = opts.meetingDate;
  const entity: EntityScope = opts.entity ?? 'all';
  const segment: SegmentScope = opts.segment ?? 'all';
  const meetingMonth = meetingDate.slice(0, 7);
  const landingMonth = addMonths(meetingMonth, -1);
  const nextMonth = addMonths(meetingMonth, 1);

  const [previousMeetingDate, settings, inputs] = await Promise.all([
    resolvePreviousMeetingDate(meetingDate),
    loadUtilizationSettings(),
    opts.inputs ? Promise.resolve(opts.inputs) : getInputs(meetingDate),
  ]);

  const [landing, forecast, trend, calendars, pipelineBuild, eventSources, inview, minutes] = await Promise.all([
    buildPlByEntity(landingMonth, 'landing'),
    buildPlByEntity(meetingMonth, 'forecast'),
    buildTrend(meetingMonth, settings),
    buildCalendars([meetingMonth, nextMonth], settings),
    buildPipeline({ previousMeetingDate, entity, segment }),
    listEventReportSources({ previousMeetingDate, meetingDate, entity, segment }),
    buildInview(meetingDate, inputs),
    buildMinutes(previousMeetingDate),
  ]);
  const [projectPages, eventReports] = await Promise.all([
    buildProjectPages(pipelineBuild.picked, 'project_page'),
    buildProjectPages(eventSources, 'event_report'),
  ]);

  return {
    version: 1,
    meeting_date: meetingDate,
    previous_meeting_date: previousMeetingDate,
    generated_at: new Date().toISOString(),
    frozen_at: null,
    scope: { entity, customer_segment: segment },
    landing,
    forecast,
    trend,
    pipeline: pipelineBuild.pipeline,
    project_pages: projectPages,
    event_reports: eventReports,
    calendars,
    inview,
    minutes,
  };
}
