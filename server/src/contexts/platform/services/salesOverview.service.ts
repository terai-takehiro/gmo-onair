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
import { jstDate, jstMonthRange, shiftYmd } from '../../../shared/utils/jst';
/**
 * 「最後の動き」と「止まっている」の定義は **project-health.ts の1か所だけ**が持つ
 * （docs/core-redesign-plan.md §3-7）。以前はここに `LAST_MOVE` と `STUCK_DAYS = 7`
 * を書き写していて、しきい値を変えると一覧・並び順・この画面が黙ってずれる形だった。
 */
import {
  LAST_MOVE_SQL, healthSql, STUCK_DAYS_BY_STAGE,
} from '../../sales/services/project-health';

const LAST_MOVE = LAST_MOVE_SQL;

/**
 * 「今週動いた」の窓。**停滞のしきい値ではない**（あちらはステージ別で
 * `STUCK_DAYS_BY_STAGE`）。この KPI は文字どおり「直近1週間に動いたか」を数える。
 */
const MOVED_WINDOW_DAYS = 7;

/**
 * **この画面は GLS-A（案件）だけを数える** (migration 179・決め⑩)。
 *
 * GLS-B はプロジェクト管理の持ち物で、**自社構築は売上が立ちません**。
 * 混ぜると受注率と平均単価が意味を持たなくなります
 * （売上 0 の構築案件が「受注」に並ぶ）。
 *
 * **財務・決算・週報・MCP はここと違って GLS-B も数えます** — あちらは
 * 「実際に出入りしたお金」を見る場所で、売上 0・仕入ありの案件も対象です。
 * 数え方が違うこと自体はもともとそうです（財務は確定売上、営業はステージ）。
 */
const ONLY_A = `p.gls_category = 'A'`;

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

/*
 * ⚠️ ここには `ymd()` があり、こう書いてあった:
 *   「**ローカル日付で作る** — `toISOString()` は UTC なので日本時間の朝が前日になる」
 * 危険は正しく見えていたのに、**コンテナのローカルがそもそも UTC** なので
 * 直っていなかった（`TZ` はどこにも設定していない）。`jst.ts` に寄せた。
 */

export async function getSalesOverview(now = new Date()) {
  // ⚠️ **日本の壁時計で数える。** ここは以前 `now.getFullYear()` のような
  // ローカル時刻の取得を使っていたが、コンテナは **UTC で動く**ので
  // **JST の 00:00〜08:59 は「今日」が前日**になり、月初は先月の集計が出ていた
  // （画面のヘッダーは端末の時計なので今日の日付。数字だけ前日という食い違い方をする）。
  // 週の終わりは**日付の足し算**で出す — `new Date(y, m, d + 6)` は
  // サーバーの時間帯で解釈されるので、ここでも時差が混じる
  const today = jstDate(now);
  const weekEnd = shiftYmd(today, 6);
  const { start: monthStart, end: monthEnd } = jstMonthRange(now);

  const [moves, week, quotes, revenue, stuckRows, won, history] = await Promise.all([
    // ── 進行中の件数と、そのうち直近7日に動いたもの / 止まっているもの ──
    // 1回のスキャンで3つ数える (3本に分けると同じ式を3回書くことになる)
    // 「止まっている」は健全性の単一定義（project-health）の 'stalled' —
    // ステージ別しきい値・生存証拠・スヌーズをすべて通したもの。
    // 一覧の停滞バッジと**同じ式**なので、KPI の数字と一覧の行数が食い違わない
    queryOne(
      `SELECT
         COUNT(*)::int AS active,
         COUNT(*) FILTER (WHERE ${LAST_MOVE} >= NOW() - INTERVAL '${MOVED_WINDOW_DAYS} days')::int AS moved,
         COUNT(*) FILTER (WHERE (${healthSql()}) = 'stalled')::int AS stuck
       FROM projects p
       WHERE p.deleted_at IS NULL AND ${ONLY_A} AND p.stage NOT IN ('r_delivered','s_completed','e_lost')`
    ),

    // ── 今週の実施 ── 日付は TEXT なので文字列比較 (ISO 表記なので順序は正しい)。
    // 期間を持つ案件は「重なっていれば今週」。終了日が空なら開始日と同じ日とみなす
    queryOne(
      `SELECT
         COUNT(*)::int AS n,
         COUNT(*) FILTER (WHERE p.event_start <= ?
                            AND COALESCE(NULLIF(p.event_end,''), p.event_start) >= ?)::int AS today
       FROM projects p
       WHERE p.deleted_at IS NULL AND ${ONLY_A} AND p.stage NOT IN ('e_lost')
         AND p.event_start IS NOT NULL AND p.event_start <> ''
         AND p.event_start <= ?
         AND COALESCE(NULLIF(p.event_end,''), p.event_start) >= ?`,
      [today, today, weekEnd, today]
    ),

    // ── 見積の返事待ち ── 出した (`sent`) まま決まっていない版だけ。
    // 値引きは単価を下げず別建てなので、合計は subtotal から引く。
    //
    // **`gls_category = 'A'` を必ず付ける** (migration 179)。
    // `estimates` はプロジェクト管理（GLS-B）の見積も入るので、
    // 外すと **案件管理のダッシュボードにプロジェクトの見積が足されます**。
    // `revenues` を読む 41 か所が `status` を見ていなかったのと同じ形の穴で、
    // ここは実測して**この1か所だけ**だと確かめてある
    // （migration 179 より前は `project_id IS NOT NULL` が同じ役目をしていた）
    queryOne(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(e.subtotal - e.discount),0)::int AS amount
       FROM estimates e JOIN projects p ON p.id = e.project_id
       WHERE e.status = 'sent' AND e.deleted_at IS NULL
         AND p.gls_category = 'A' AND p.deleted_at IS NULL`
    ),

    // ── 今月の売上 ── **`status='confirmed'` で必ず絞る。**
    // これを外すと見積段階の行まで足される (`revenues` を読む 41 か所が
    // status を見ておらず、実際に混ざっていた)。
    // `group_id IS NULL` は按分の親行を二重に数えないため (既存の集計と同じ形)
    queryOne(
      `SELECT COALESCE(SUM(r.amount),0)::int AS amount, COUNT(*)::int AS n
       FROM revenues r JOIN projects p ON p.id = r.project_id
       WHERE r.status = 'confirmed' AND r.deleted_at IS NULL AND r.group_id IS NULL
         AND ${ONLY_A} AND p.deleted_at IS NULL
         AND r.recognition_date BETWEEN ? AND ?`,
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
       LEFT JOIN companies c ON c.id = p.customer_id
       WHERE p.deleted_at IS NULL AND ${ONLY_A} AND p.stage NOT IN ('r_delivered','s_completed','e_lost')
         AND (${healthSql()}) = 'stalled'
       ORDER BY ${LAST_MOVE} ASC
       LIMIT 5`
    ),

    // ── 今月の受注 ── **`projects.won_at` で数える** (migration 164)。
    // モックの KPI はここ。`updated_at` では代われない (名前を直しただけでも動く)
    queryOne(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(expected_amount),0)::int AS amount
         FROM projects p
        WHERE p.deleted_at IS NULL AND ${ONLY_A} AND p.won_at IS NOT NULL
          AND p.won_at >= ?::date AND p.won_at < (?::date + INTERVAL '1 month')`,
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
    /**
     * 互換のため残す（client の文言が読む）。停滞のしきい値は**ステージ別**に
     * なったので、単一の数字としては**いちばん短いもの**を返す。
     * 画面がステージ別に言いたいときは `stuck_days_by_stage` を読む。
     */
    stuck_days: Math.min(...Object.values(STUCK_DAYS_BY_STAGE)),
    stuck_days_by_stage: STUCK_DAYS_BY_STAGE,
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
