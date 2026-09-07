import { queryAll, queryOne } from '../../../shared/db/connection';
import { config } from '../../../config';
import { normalizeWeekStart, defaultWeekStart, addDays } from './ops-report.service';
/**
 * 見積金額（見積があれば見積・無ければ想定）の導出は **project.service.ts の
 * ESTIMATE_AMOUNT_LATERAL 単一定義**を使う（docs/project-ledger-phase-c-design.md
 * テーマ1 C-1a）。ここに書き写すと版・group_id の扱いが2か所に増え、ずれる。
 */
import { ESTIMATE_AMOUNT_LATERAL } from '../../sales/services/project.service';
/**
 * 「未対応の次回アクション」の判定は **1本だけ**（migration 245）。
 * 週報だけ違う集合を載せると、読んだ人が営業活動記録の画面と数を突き合わせられない。
 */
import { OPEN_NEXT_ACTION_SQL } from '../../../shared/services/next-action-state';

// ウィークリー活動報告の数値集計 (オンデマンド)。
// dashboard.routes の /kpi /sales-board /weekly-schedule と同じ流儀で集計する。
// AI (MCP の get_weekly_activity_stats) はこの結果を読んで文章化し、
// payload.stats として submit_ops_report に同梱する (画面はそのスナップショットを表示)。

export interface WeeklyStats {
  period: { week_start: string; week_end: string };
  new_projects: { count: number; ai_count: number; items: Record<string, unknown>[] };
  activities: { count: number; ai_count: number; by_type: Record<string, unknown>[] };
  pipeline: Record<string, unknown>[];
  revenue: { week_total: number; month_total: number; month: string };
  events_this_week: Record<string, unknown>[];
  next_week: {
    week_start: string;
    week_end: string;
    events: Record<string, unknown>[];
    next_actions: Record<string, unknown>[];
  };
  /**
   * 前週の同じ数値（主要指標の増減表示用・2026-09 の再設計）。
   *
   * 画面が読むのは `ops_reports.payload.stats` の**スナップショット**なので、
   * 比較する側の数値も同じスナップショットに入れておく必要がある
   * （画面から前週ぶんを引き直すと、確定後に前週の実績が動いたときに
   * 「確定時点の数字」という約束が崩れる）。
   * ⚠️ **確定済みの過去のレポートにはこの鍵が無い。** 画面は未定義を前提に描くこと。
   */
  prev_week: { week_start: string; new_projects: number; activities: number; revenue: number };
}

export async function getWeeklyStats(weekStartInput?: string): Promise<WeeklyStats> {
  const weekStart = weekStartInput ? normalizeWeekStart(weekStartInput) : defaultWeekStart();
  const weekEnd = addDays(weekStart, 6);
  const nextWeekStart = addDays(weekStart, 7);
  const nextWeekEnd = addDays(weekStart, 13);
  const month = weekStart.slice(0, 7);

  // 週内に作成された案件 (AI 起票判定は created_by=mcpActor OR 監査ログ照合 — OAuth 本人名義でも検出)
  const newProjects = await queryAll(
    `SELECT p.id, p.gls_number, p.name, p.stage, p.expected_amount,
            COALESCE(est.amount, 0) AS estimate_amount, p.created_by,
            c.name AS customer_name,
            ai.requested_by AS ai_requested_by,
            (p.created_by = ? OR ai.audit_id IS NOT NULL) AS is_ai_created
     FROM projects p
     LEFT JOIN companies c ON c.id = p.customer_id
     LEFT JOIN LATERAL (
       SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
       WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = p.id
       ORDER BY m.created_at ASC
       LIMIT 1
     ) ai ON TRUE
     ${ESTIMATE_AMOUNT_LATERAL}
     WHERE p.deleted_at IS NULL
       AND p.created_at >= ?::date AND p.created_at < (?::date + INTERVAL '1 day')
     ORDER BY p.created_at ASC
     LIMIT 20`,
    [config.mcpActorId, weekStart, weekEnd],
  );
  const newProjectCounts = await queryOne(
    `SELECT COUNT(*) AS c,
            COUNT(*) FILTER (WHERE created_by = ? OR EXISTS (
              SELECT 1 FROM mcp_audit_log m
              WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = projects.id
            )) AS ai_c
     FROM projects
     WHERE deleted_at IS NULL
       AND created_at >= ?::date AND created_at < (?::date + INTERVAL '1 day')`,
    [config.mcpActorId, weekStart, weekEnd],
  );

  // 週内の営業活動 (activity_date は TEXT の日付)。
  // AI 取込判定は監査ログ照合のみ — 活動の created_by は常に実担当者 (MCP は user_id を渡す) のため
  // 旧判定 (created_by=mcpActor) では AI 件数が常に 0 だった既存バグを修正。
  const activityCounts = await queryOne(
    `SELECT COUNT(*) AS c,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM mcp_audit_log m
              WHERE m.tool_name = 'create_activity_log' AND m.result_summary->>'created_id' = activity_logs.id
            )) AS ai_c
     FROM activity_logs
     WHERE deleted_at IS NULL AND activity_date BETWEEN ? AND ?`,
    [weekStart, weekEnd],
  );
  const activityByType = await queryAll(
    `SELECT activity_type, COUNT(*) AS count
     FROM activity_logs
     WHERE deleted_at IS NULL AND activity_date BETWEEN ? AND ?
     GROUP BY activity_type
     ORDER BY count DESC`,
    [weekStart, weekEnd],
  );

  // パイプライン現況 (stage 遷移履歴は無いため現時点スナップショット)
  const pipeline = await queryAll(
    `SELECT stage, COUNT(*) AS count, COALESCE(SUM(expected_amount), 0) AS expected_amount
     FROM projects
     WHERE deleted_at IS NULL AND stage NOT IN ('r_delivered', 's_completed', 'e_lost')
     GROUP BY stage
     ORDER BY CASE stage
       WHEN 'a_won' THEN 1 WHEN 'b_verbal' THEN 2 WHEN 'c_proposal' THEN 3
       WHEN 'd_hold' THEN 4 WHEN 'neta' THEN 5 ELSE 6 END`,
  );

  // 売上 (計上日ベース): 週内合計 + 当月累計
  const weekRevenue = await queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues
     WHERE deleted_at IS NULL AND recognition_date BETWEEN ? AND ?`,
    [weekStart, weekEnd],
  );
  const monthRevenue = await queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues
     WHERE deleted_at IS NULL AND substr(recognition_date, 1, 7) = ?`,
    [month],
  );

  // 前週の同じ数値 (主要指標の増減表示用)。出すのは件数と金額だけなので3本で足りる
  const prevWeekStart = addDays(weekStart, -7);
  const prevWeekEnd = addDays(weekStart, -1);
  const prevNewProjects = await queryOne(
    `SELECT COUNT(*) AS c FROM projects
      WHERE deleted_at IS NULL
        AND created_at >= ?::date AND created_at < (?::date + INTERVAL '1 day')`,
    [prevWeekStart, prevWeekEnd],
  );
  const prevActivities = await queryOne(
    `SELECT COUNT(*) AS c FROM activity_logs
      WHERE deleted_at IS NULL AND activity_date BETWEEN ? AND ?`,
    [prevWeekStart, prevWeekEnd],
  );
  const prevRevenue = await queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues
      WHERE deleted_at IS NULL AND recognition_date BETWEEN ? AND ?`,
    [prevWeekStart, prevWeekEnd],
  );

  // 今週 / 来週のイベント (GLS 発番済案件のイベント期間が週に重なるもの)
  const eventsInRange = (from: string, to: string) => queryAll(
    `SELECT p.id, p.gls_number, p.name, p.stage, p.event_start, p.event_end,
            c.name AS customer_name
     FROM projects p
     LEFT JOIN companies c ON c.id = p.customer_id
     WHERE p.deleted_at IS NULL AND p.gls_number IS NOT NULL
       AND NULLIF(p.event_start, '') IS NOT NULL
       AND p.event_start <= ?
       AND COALESCE(NULLIF(p.event_end, ''), p.event_start) >= ?
     ORDER BY p.event_start ASC
     LIMIT 30`,
    [to, from],
  );
  const eventsThisWeek = await eventsInRange(weekStart, weekEnd);
  const eventsNextWeek = await eventsInRange(nextWeekStart, nextWeekEnd);

  // 来週期限の未対応 next_action。
  // ⚠️ **判定は共通の1本**（`OPEN_NEXT_ACTION_SQL`・migration 245）。前は式を写していて
  // 終了案件の除外が抜けており、**週報に「失注した案件のやること」が毎週載っていた**
  const nextActions = await queryAll(
    `SELECT a.id, a.next_action, a.next_action_date, a.subject,
            p.id AS project_id, p.gls_number, p.name AS project_name,
            u.name AS user_name
     FROM activity_logs a
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE ${OPEN_NEXT_ACTION_SQL}
       AND a.next_action_date BETWEEN ? AND ?
     ORDER BY a.next_action_date ASC
     LIMIT 30`,
    [nextWeekStart, nextWeekEnd],
  );

  return {
    period: { week_start: weekStart, week_end: weekEnd },
    new_projects: {
      count: Number(newProjectCounts?.c ?? 0),
      ai_count: Number(newProjectCounts?.ai_c ?? 0),
      items: newProjects,
    },
    activities: {
      count: Number(activityCounts?.c ?? 0),
      ai_count: Number(activityCounts?.ai_c ?? 0),
      by_type: activityByType,
    },
    pipeline,
    revenue: {
      week_total: Number(weekRevenue?.total ?? 0),
      month_total: Number(monthRevenue?.total ?? 0),
      month,
    },
    prev_week: {
      week_start: prevWeekStart,
      new_projects: Number(prevNewProjects?.c ?? 0),
      activities: Number(prevActivities?.c ?? 0),
      revenue: Number(prevRevenue?.total ?? 0),
    },
    events_this_week: eventsThisWeek,
    next_week: {
      week_start: nextWeekStart,
      week_end: nextWeekEnd,
      events: eventsNextWeek,
      next_actions: nextActions,
    },
  };
}
