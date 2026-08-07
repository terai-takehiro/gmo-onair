/**
 * 案件管理ダッシュボード (v4 ①) が出す数字。
 *
 * ── なぜ1本にまとめるか ──────────────────────────────────
 *
 * ダッシュボードは開いた瞬間に全部見えていないと意味がない画面なので、
 * **KPI 5つと「止まっている案件」を1回の呼び出しで返す**。
 * 5本に分けると、遅い1本のせいで画面が段階的に埋まっていく
 * (数字が後から差し替わると読み間違える)。
 *
 * ステージ別 (`/dashboard/pipeline`)・今週の現場 (`/dashboard/weekly-schedule`)・
 * 動いている案件 (`GET /projects?sort_by=last_move`) は**既にある物を使う**。
 * 同じ数字を2か所で数えると必ず食い違う。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';

/**
 * 「最後の動き」の式。**案件一覧 (`project.service`) と同じ考え方**で、
 * 案件そのもの・タスク・活動記録のいちばん新しい時刻を採る。
 *
 * `projects.updated_at` だけでは足りない — この数字を見る目的は
 * 「放っておかれていないか」なので、タスクを動かしただけでも「動いている」。
 *
 * 見積・請求は入れない (`revenues` は締め処理で一斉に更新されるので、
 * 誰も触っていない案件まで「たった今」になる)。
 */
const LAST_MOVE = `
  GREATEST(
    p.updated_at,
    COALESCE((SELECT MAX(t.updated_at) FROM project_tasks t
              WHERE t.project_id = p.id AND t.deleted_at IS NULL), p.updated_at),
    COALESCE((SELECT MAX(a.updated_at) FROM activity_logs a
              WHERE a.project_id = p.id AND a.deleted_at IS NULL), p.updated_at)
  )
`;

/** 何日動いていなければ「止まっている」とするか。モックの文言もこの日数 */
const STUCK_DAYS = 7;

/**
 * 「止まっている」理由。**ステージ変更の履歴 (migration 164) から言う。**
 *
 * モックの「見積を送ったまま連絡がありません」は、**いつそのステージになったか**が
 * 分かって初めて言える文です。履歴を持つようになったので、
 * 「そのステージになってから何日か」を添えます。
 *
 * **履歴が無い案件 (migration 164 より前から動いているもの) は日数を出しません。**
 * `updated_at` で代わりにすると、案件名を直しただけで「たった今そのステージになった」
 * ことになり、嘘の日数が出ます。
 */
const STUCK_WHY: Record<string, string> = {
  neta: 'ネタのまま動いていません',
  d_hold: '仮押さえのままです',
  c_proposal: '見積を出したまま返事がありません',
  b_verbal: '口頭決定のまま、書面が進んでいません',
  a_won: '受注してから動きがありません',
};

/** ステージになってからの日数を添える。分からなければ添えない（作り話をしない） */
function stuckWhy(stage: string, sinceDays: number | null): string {
  const base = STUCK_WHY[stage] ?? '動きがありません';
  return sinceDays == null ? base : `${base}（${sinceDays}日）`;
}

export interface StuckProject {
  id: string;
  name: string;
  customer_name: string | null;
  stage: string;
  days: number;
  why: string;
}

/** YYYY-MM-DD。**ローカル日付で作る** — `toISOString()` は UTC なので日本時間の朝が前日になる */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getSalesOverview(now = new Date()) {
  const today = ymd(now);
  const weekEnd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

  const [moves, week, quotes, revenue, stuckRows, won, history] = await Promise.all([
    // ── 進行中の件数と、そのうち直近7日に動いたもの / 止まっているもの ──
    // 1回のスキャンで3つ数える (3本に分けると同じ式を3回書くことになる)
    queryOne(
      `SELECT
         COUNT(*)::int AS active,
         COUNT(*) FILTER (WHERE ${LAST_MOVE} >= NOW() - INTERVAL '${STUCK_DAYS} days')::int AS moved,
         COUNT(*) FILTER (WHERE ${LAST_MOVE} <  NOW() - INTERVAL '${STUCK_DAYS} days')::int AS stuck
       FROM projects p
       WHERE p.deleted_at IS NULL AND p.stage NOT IN ('s_completed','e_lost')`
    ),

    // ── 今週の実施 ── 日付は TEXT なので文字列比較 (ISO 表記なので順序は正しい)。
    // 期間を持つ案件は「重なっていれば今週」。終了日が空なら開始日と同じ日とみなす
    queryOne(
      `SELECT
         COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE p.event_start <= ?
                            AND COALESCE(NULLIF(p.event_end,''), p.event_start) >= ?)::int AS today
       FROM projects p
       WHERE p.deleted_at IS NULL AND p.stage NOT IN ('e_lost')
         AND p.event_start IS NOT NULL AND p.event_start <> ''
         AND p.event_start <= ?
         AND COALESCE(NULLIF(p.event_end,''), p.event_start) >= ?`,
      [today, today, weekEnd, today]
    ),

    // ── 見積の返事待ち ── 出した (`sent`) まま決まっていない版だけ。
    // 値引きは単価を下げず別建てなので、合計は subtotal から引く
    queryOne(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(subtotal - discount),0)::int AS amount
       FROM estimates WHERE status = 'sent' AND deleted_at IS NULL`
    ),

    // ── 今月の売上 ── **`status='confirmed'` で必ず絞る。**
    // これを外すと見積段階の行まで足される (`revenues` を読む 41 か所が
    // status を見ておらず、実際に混ざっていた)。
    // `group_id IS NULL` は按分の親行を二重に数えないため (既存の集計と同じ形)
    queryOne(
      `SELECT COALESCE(SUM(amount),0)::int AS amount, COUNT(*)::int AS n
       FROM revenues
       WHERE status = 'confirmed' AND deleted_at IS NULL AND group_id IS NULL
         AND recognition_date BETWEEN ? AND ?`,
      [monthStart, monthEnd]
    ),

    // ── 止まっている案件 ── 長く止まっている順に5件。
    // **いまのステージになった時刻**も採る (migration 164)。無ければ NULL のまま
    queryAll(
      `SELECT p.id, p.name, p.stage, c.name AS customer_name,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - ${LAST_MOVE})) / 86400)::int AS days,
              (SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - sc.changed_at)) / 86400)::int
                 FROM project_stage_changes sc
                WHERE sc.project_id = p.id AND sc.to_stage = p.stage
                ORDER BY sc.changed_at DESC LIMIT 1) AS stage_days
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.deleted_at IS NULL AND p.stage NOT IN ('s_completed','e_lost')
         AND ${LAST_MOVE} < NOW() - INTERVAL '${STUCK_DAYS} days'
       ORDER BY ${LAST_MOVE} ASC
       LIMIT 5`
    ),

    // ── 今月の受注 ── **`projects.won_at` で数える** (migration 164)。
    // モックの KPI はここ。`updated_at` では代われない (名前を直しただけでも動く)
    queryOne(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(expected_amount),0)::int AS amount
         FROM projects
        WHERE deleted_at IS NULL AND won_at IS NOT NULL
          AND won_at >= ?::date AND won_at < (?::date + INTERVAL '1 month')`,
      [monthStart, monthStart]
    ),

    // ── いつから記録しているか ── 「ここより前は数えていません」と画面に出すため。
    // **設定表には持たない** — 履歴そのものの最初の1件が答えになる
    queryOne('SELECT MIN(changed_at) AS since FROM project_stage_changes'),
  ]);

  const stuck: StuckProject[] = (stuckRows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    customer_name: (r.customer_name as string) ?? null,
    stage: r.stage as string,
    days: r.days as number,
    why: stuckWhy(r.stage as string, (r.stage_days as number | null) ?? null),
  }));

  return {
    stuck_days: STUCK_DAYS,
    kpi: {
      active_projects: (moves as any)?.active ?? 0,
      moved_this_week: (moves as any)?.moved ?? 0,
      stuck_projects: (moves as any)?.stuck ?? 0,
      week_events: (week as any)?.n ?? 0,
      today_events: (week as any)?.today ?? 0,
      quote_waiting: (quotes as any)?.n ?? 0,
      quote_waiting_amount: (quotes as any)?.amount ?? 0,
      month_revenue: (revenue as any)?.amount ?? 0,
      month_revenue_count: (revenue as any)?.n ?? 0,
      /** 今月 受注になった案件 (migration 164 以降のぶんだけ) */
      month_won_count: (won as any)?.n ?? 0,
      month_won_amount: (won as any)?.amount ?? 0,
    },
    /**
     * ステージの記録を始めた日 (`YYYY-MM-DD`)。**画面はこれを出す** —
     * これより前に受注した案件は「今月の受注」に入らないので、
     * 書かないと「受注が 0 件になった＝壊れた」と読まれる
     */
    stage_history_since: (history as any)?.since
      ? new Date((history as any).since as string).toISOString().slice(0, 10)
      : null,
    stuck,
  };
}
