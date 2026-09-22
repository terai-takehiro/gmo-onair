/**
 * 営業活動記録を**案件別のまとまり**で返す（`GET /activity-logs/by-project`）。
 *
 * ── なぜ別ファイルにしたか ────────────────────────────────
 *
 * `activity-log.service.ts` は既に 800 行近くあり、ここで足すのは
 * **1本の大きな集計 SQL とその読み替え**だけです。役割（1件の CRUD ／
 * 案件別の集計）が違うものを同じファイルに積むと、片方を直すたびに
 * もう片方を読む羽目になります（400 行の上限の趣旨）。
 *
 * ── 何を解いているか（利用者からのご指摘）──────────────────
 *
 * 「UI が分かりづらい。**案件別に見られないと分からない**。
 *   期限超過が分かりづらい。**期限超過でない案件もある**（全部を赤くしない）」
 *
 * 一覧が「活動記録1件＝1行」だと、同じ案件の記録が時系列でばらけ、
 * **いまその案件で何が残っているのか**が読めません。ここでは
 * **1案件＝1まとまり**にして、未完了の次のアクションを期限の区分ごとに数えます。
 *
 * ── 期限の4区分（画面と必ず同じ定義）────────────────────────
 *
 *   overdue … 期限 < 本日
 *   today   … 期限が 本日 または 本日+1（画面の名前は「本日・明日」）
 *   week    … 期限が 本日+2 〜 本日+7（画面の名前は「今週」）
 *   none    … 期限未設定（`next_action` はある）
 *
 * **本日+8 以降はどの区分にも入りません**（`later`）。絞り込みのチップを持たず、
 * 「すべて」にだけ出ます — 先の予定まで色で急かすと、本当に急ぐものが埋もれます。
 *
 * ⚠️ **`none`（期限未設定）だけ `OPEN_NEXT_ACTION_NO_DATE_SQL` を読みます。**
 * 「未対応の次回アクション」の正（`OPEN_NEXT_ACTION_SQL`）は
 * `next_action_date IS NOT NULL` を必須にしているため、そのまま使うと
 * **`none` は常に 0 件**になります。ところが整形器も取込も
 * **本文に期日が書かれていないときは期限を置かずにやることを立てる**ので、
 * それは「AI が期限を置けなかった分だけが誰の目にも触れない」という穴でした。
 * 既存の7つの呼び出し口の集合は1件も変えていません（`next-action-state.ts`）。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import {
  OPEN_NEXT_ACTION_SQL, OPEN_NEXT_ACTION_NO_DATE_SQL,
} from '../../../shared/services/next-action-state';
import { ACTIVITY_FORMAT_KIND, ACTIVITY_INTAKE_KIND } from './activity-corrections.service';

/** 期限の区分。`all` は絞り込みなし（`later` も含めて全部出す） */
export type DueBucket = 'overdue' | 'today' | 'week' | 'none' | 'all';

const DUE_BUCKETS: readonly string[] = ['overdue', 'today', 'week', 'none', 'all'];

/** クエリの `due` を安全に読む。知らない値は `all` に倒す（400 で止めるほどの話ではない） */
export function parseDueBucket(v: unknown): DueBucket {
  const s = String(v ?? '').trim();
  return (DUE_BUCKETS.includes(s) ? s : 'all') as DueBucket;
}

export interface ByProjectFilter {
  due: DueBucket;
  search?: string;
  /**
   * **活動を記録した人**（`activity_logs.user_id`）。時系列の一覧・MCP と同じ意味。
   * 理由は `OWNER_SQL` の頭注。
   */
  userId?: string;
}

/** 区分ごとの件数。`all` は「未完了の次のアクションすべて」（本日+8 以降の `later` も含む） */
export interface DueCounts {
  overdue: number;
  today: number;
  week: number;
  none: number;
  all: number;
}

/**
 * 絞り込みチップに出す件数（`GET /activity-logs/by-project` の `summary`）。
 *
 * ── なぜ2種類返すか ──────────────────────────────────────────
 *
 * 以前の画面は `due` ごとに `limit=1` で5回問い合わせ、`pagination.total`
 * （**区分のやることを持つ案件の数**）をチップに出していました。ところが
 * チップの横に書いてあるのは「期限超過 3」のような**やることの件数**の読み方で、
 * 1案件に期限超過が3件あっても「1」と出ていました（#727 の宿題①）。
 *
 * - `actions`  … 未完了の次のアクションの件数（**チップに出すのはこちら**）
 * - `projects` … その区分のやることを1件以上持つ案件の数
 *               （`due` で絞ったときの `pagination.total` と同じ数。画面の「N案件」用）
 *
 * ⚠️ **`projects.all` は `due=all` の `pagination.total` と一致しません。**
 * `due=all` の一覧は「未完了のやることが1件も無い案件」（記録だけある案件）も
 * まとまりとして出すためです。`projects.all` は「やることを持つ案件」だけを数えます。
 */
export interface ByProjectSummary {
  actions: DueCounts;
  projects: DueCounts;
}

/** 1案件のまとまりにぶら下げる、未完了の次のアクション（最大5件） */
export interface ByProjectAction {
  id: string;
  /*
   * `subject` / `activity_date` / `activity_type` は `activity_logs` で **NOT NULL**（001b）。
   * 画面（`activityLog/byProject.ts`）も非 null で受けているので、ここも非 null にして
   * **両側の契約を一字一句そろえる**（片方だけ `| null` にすると、画面が
   * 「来ないこともある」前提の分岐を足してしまい、実際には通らない道が増える）。
   */
  subject: string;
  activity_date: string;
  activity_type: string;
  next_action: string | null;
  next_action_short: string | null;
  next_action_date: string | null;
  next_action_done_at: string | null;
  next_action_auto_closed_reason: string | null;
  /** 区分（`overdue` / `today` / `week` / `none` / `later`）。画面の色分けはこれを読む */
  due_bucket: string;
  /**
   * **このやることを AI が立てたか**（整形器 or 取込の出力に `next_action` が入っている）。
   *
   * 画面はこれで小さな印を出し、**印が付いている行の削除だけ**が
   * 「時効なしの `reject`」として `ai_corrections` に残ります。
   * 印が無いと、人が手で書いたやることを消したときにも「AI の間違い」を
   * 直しているつもりになり、**信号が1件も残らない回**が混ざります。
   */
  ai_generated: boolean;
}

/**
 * 本日を `YYYY-MM-DD` の文字列で作る式。
 *
 * ⚠️ **`CURRENT_DATE::text` を使わないこと。** 出力は `DateStyle` 次第で
 * `09-22-2026` にもなり、TEXT 列（`next_action_date`）との大小比較が静かに壊れます。
 */
const D = (offset: number) =>
  `to_char(CURRENT_DATE${offset ? ` + ${offset}` : ''}, 'YYYY-MM-DD')`;

/**
 * 区分を決める式。**上から順に当たる**ので並びを変えないこと。
 *
 * ⚠️ 空文字の期限（`''`）は `IS NOT NULL` を素通りするので、
 * **`none`（期限未設定）へ寄せます**。寄せないと `'' < 本日` が真になり、
 * **期限を入れていないだけの行が期限超過として赤く出ます**
 * （v4.6.19 で案件日の並べ替えが踏んだのと同じ穴）。
 */
const DUE_BUCKET_SQL = `CASE
        WHEN ${OPEN_NEXT_ACTION_NO_DATE_SQL} THEN 'none'
        WHEN (${OPEN_NEXT_ACTION_SQL}) AND NULLIF(btrim(a.next_action_date), '') IS NULL THEN 'none'
        WHEN (${OPEN_NEXT_ACTION_SQL}) AND a.next_action_date <  ${D(0)} THEN 'overdue'
        WHEN (${OPEN_NEXT_ACTION_SQL}) AND a.next_action_date <= ${D(1)} THEN 'today'
        WHEN (${OPEN_NEXT_ACTION_SQL}) AND a.next_action_date <= ${D(7)} THEN 'week'
        WHEN (${OPEN_NEXT_ACTION_SQL}) THEN 'later'
        ELSE NULL
      END`;

/** 絞り込みの区分 → まとまりを残す条件。`all` は絞り込まない */
const DUE_FILTER_SQL: Record<Exclude<DueBucket, 'all'>, string> = {
  overdue: 'g.overdue_count > 0',
  today: 'g.today_count > 0',
  week: 'g.week_count > 0',
  none: 'g.none_count > 0',
};

/**
 * 担当者の絞り込み。**活動を記録した人**（`activity_logs.user_id`）で絞る。
 *
 * ── なぜ「案件の担当者」（`projects.assigned_to`）ではないか（統合時の判断）──
 *
 * 案件別のまとまりは見出しに案件の担当者を出すので、そちらで絞る案もありました。
 * しかし同じ `?user=` を受ける**時系列（`GET /activity-logs`）**、「今後の予定」の帯
 * （`/activity-logs/upcoming`）、MCP の `list_activity_logs` の `user_id` は、
 * どれも**記録した人**を「担当者」と呼んでいます。案件別だけ意味を変えると、
 * **並びを切り替えた瞬間に同じ絞り込みで違う行の集まりが出る**ことになり、
 * どちらが「自分の分」なのか画面から見分けが付きません。
 * 画面のシートにも「活動を記録した人で絞り込みます」と書いてあるので、そちらに揃えます。
 *
 * 案件の担当者で絞りたいという要望が出たら、**別の引数名**（例 `owner_id`）で足すこと
 * （`user_id` の意味を口ごとに変えない）。
 */
const OWNER_SQL = 'a.user_id';

/**
 * 共通の CTE。**件数を数えるのと1ページ取ってくるのは必ず同じ式**にする
 * （別々に書くと「全12件」と言いながら 8 件しか出ない、という追いにくいずれ方をする）。
 *
 * 効かせるのは `search` と `userId` だけ。**`due` はここに入れません** —
 * `summary` は選んでいる区分にかかわらず全区分の件数を出すので、
 * `due` の絞り込みは一覧を取る側（`grouped` の外）で掛けます。
 */
function baseCte(filter: ByProjectFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let where = 'WHERE a.deleted_at IS NULL';
  if (filter.userId) { where += ` AND ${OWNER_SQL} = ?`; params.push(filter.userId); }
  // 検索の範囲は既存の一覧（`list()`）と同じ — 案件名・クライアント名・件名・本文
  if (filter.search) {
    where += ' AND (p.name ILIKE ? OR c.name ILIKE ? OR a.subject ILIKE ? OR a.description ILIKE ?)';
    const like = `%${filter.search}%`;
    params.push(like, like, like, like);
  }

  const sql = `WITH base AS (
      SELECT a.id, a.project_id, a.user_id, a.activity_date, a.activity_type, a.subject,
             a.created_at, a.next_action, a.next_action_short, a.next_action_date,
             a.next_action_done_at, a.next_action_auto_closed_reason,
             ${DUE_BUCKET_SQL} AS due_bucket
        FROM activity_logs a
        LEFT JOIN projects p ON p.id = a.project_id
        LEFT JOIN companies c ON c.id = a.customer_id
        ${where}
    ),
    last_act AS (
      SELECT DISTINCT ON (project_id) project_id, activity_date, activity_type, subject
        FROM base
       ORDER BY project_id, activity_date DESC, created_at DESC
    ),
    grouped AS (
      SELECT project_id,
             COUNT(*)::int AS activity_count,
             COUNT(*) FILTER (WHERE due_bucket = 'overdue')::int AS overdue_count,
             COUNT(*) FILTER (WHERE due_bucket = 'today')::int   AS today_count,
             COUNT(*) FILTER (WHERE due_bucket = 'week')::int    AS week_count,
             COUNT(*) FILTER (WHERE due_bucket = 'none')::int    AS none_count,
             -- 未完了の次のアクションすべて（later も含む）。summary の all が読む
             COUNT(*) FILTER (WHERE due_bucket IS NOT NULL)::int AS open_count,
             -- 並べ替え用の最短期限。**期限未設定は入れない**（NULLS LAST で最後に回る）
             MIN(next_action_date) FILTER (
               WHERE due_bucket IN ('overdue', 'today', 'week', 'later')
             ) AS next_due,
             MAX(activity_date) AS last_activity_date
        FROM base
       GROUP BY project_id
    )`;
  return { sql, params };
}

/**
 * 並び順: **期限超過を持つ案件が先 → 最短期限が近い順 → 最終活動日の新しい順**。
 * 案件にひも付かない記録（`project_id IS NULL`）は1つのまとまりにして最後。
 */
const ORDER_BY = `ORDER BY (g.project_id IS NULL) ASC,
                           (g.overdue_count > 0) DESC,
                           g.next_due ASC NULLS LAST,
                           g.last_activity_date DESC NULLS LAST`;

export async function listByProject(
  filter: ByProjectFilter, page: number, limit: number, offset: number,
) {
  const { sql: cte, params } = baseCte(filter);
  const dueCond = filter.due === 'all' ? '' : DUE_FILTER_SQL[filter.due];
  const dueWhere = dueCond ? `WHERE ${dueCond}` : '';

  /*
   * 総数と `summary` を**同じ1本の集計**で出す。
   *
   * - 総数（`pagination.total`）だけが `due` を効かせる（`FILTER (WHERE …)`）
   * - `summary` は `due` を無視し、`search` / `userId` だけを効かせる（CTE の WHERE）
   *
   * 区分ごとに問い合わせ直すと、区分の数だけ同じ CTE を回すうえ、
   * 問い合わせの合間に記録が増えると**チップ同士の数が食い違います**。
   * 1本にしておけば、チップの数と一覧の総数は必ず同じ瞬間の値になります。
   *
   * ⚠️ `SUM` は `bigint` を返し、`pg` は `bigint` を**文字列**で渡します。
   * 画面が `"3" + 1 = "31"` を踏まないよう、必ず `::int` に落とします。
   */
  const agg = await queryOne(
    `${cte}
     SELECT COUNT(*) ${dueCond ? `FILTER (WHERE ${dueCond})` : ''}::int AS total,
            COALESCE(SUM(g.overdue_count), 0)::int AS a_overdue,
            COALESCE(SUM(g.today_count), 0)::int   AS a_today,
            COALESCE(SUM(g.week_count), 0)::int    AS a_week,
            COALESCE(SUM(g.none_count), 0)::int    AS a_none,
            COALESCE(SUM(g.open_count), 0)::int    AS a_all,
            -- 案件数は grouped の行を数える。GROUP BY project_id は NULL を1つにまとめるので、
            -- 案件にひも付かない記録は**まとめて1件**になる（一覧のまとまりと同じ数え方）
            COUNT(*) FILTER (WHERE ${DUE_FILTER_SQL.overdue})::int AS p_overdue,
            COUNT(*) FILTER (WHERE ${DUE_FILTER_SQL.today})::int   AS p_today,
            COUNT(*) FILTER (WHERE ${DUE_FILTER_SQL.week})::int    AS p_week,
            COUNT(*) FILTER (WHERE ${DUE_FILTER_SQL.none})::int    AS p_none,
            COUNT(*) FILTER (WHERE g.open_count > 0)::int          AS p_all
       FROM grouped g`,
    params,
  ) as Record<string, unknown> | undefined;

  const rows = await queryAll(
    `${cte}
     SELECT g.project_id,
            p.name        AS project_name,
            p.gls_number  AS project_gls,
            p.code        AS project_code,
            p.stage       AS stage,
            p.customer_id AS customer_id,
            c.name        AS customer_name,
            u.name        AS owner_name,
            -- 実施日は project_dates ＋ projects.event_start / event_end の**重複を除いた数**。
            -- 画面は「1日なら 10/24（金）・複数日なら 10/24 ほか2日」と書き分ける
            COALESCE(ed.day_count, 0) AS event_day_count,
            COALESCE(ed.first_day, NULLIF(btrim(p.event_start), '')) AS event_start,
            g.activity_count, g.overdue_count, g.today_count, g.week_count, g.none_count,
            la.activity_date AS last_activity_date,
            la.activity_type AS last_activity_type,
            la.subject       AS last_activity_subject,
            COALESCE(act.actions, '[]'::json) AS actions
       FROM grouped g
       LEFT JOIN projects  p ON p.id = g.project_id
       LEFT JOIN companies c ON c.id = p.customer_id
       LEFT JOIN users     u ON u.id = p.assigned_to
       LEFT JOIN last_act la ON la.project_id IS NOT DISTINCT FROM g.project_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS day_count, MIN(d) AS first_day
           FROM (
             SELECT pd.date AS d FROM project_dates pd
              WHERE pd.project_id = p.id AND NULLIF(btrim(pd.date), '') IS NOT NULL
             UNION
             SELECT btrim(p.event_start) WHERE NULLIF(btrim(p.event_start), '') IS NOT NULL
             UNION
             SELECT btrim(p.event_end)   WHERE NULLIF(btrim(p.event_end), '') IS NOT NULL
           ) days
       ) ed ON TRUE
       LEFT JOIN LATERAL (
         -- **N+1 にしない**（案件ごとに API を呼び直させない）。1案件あたり
         -- 上位5件までを期限の近い順で畳んで返す。期限未設定は最後
         SELECT json_agg(t) AS actions FROM (
           SELECT b.id, b.subject, b.activity_date, b.activity_type,
                  b.next_action, b.next_action_short, b.next_action_date,
                  b.next_action_done_at, b.next_action_auto_closed_reason,
                  b.due_bucket,
                  EXISTS (
                    SELECT 1 FROM ai_outputs o
                     WHERE o.target_table = 'activity_logs' AND o.target_id = b.id
                       AND o.kind IN ('${ACTIVITY_FORMAT_KIND}', '${ACTIVITY_INTAKE_KIND}')
                       AND COALESCE(o.payload_snapshot->>'next_action', '') <> ''
                  ) AS ai_generated
             FROM base b
            WHERE b.project_id IS NOT DISTINCT FROM g.project_id
              AND b.due_bucket IS NOT NULL
            ORDER BY (b.next_action_date IS NULL) ASC,
                     b.next_action_date ASC, b.activity_date DESC, b.created_at DESC
            LIMIT 5
         ) t
       ) act ON TRUE
       ${dueWhere}
       ${ORDER_BY}
       LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return { rows, total: toCount(agg?.total), summary: summaryFromRow(agg), page, limit };
}

/** 集計の1値を件数に読む。行が無い・値が欠けたときは 0（チップを空欄にしない） */
function toCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 集計の1行（`a_*` = やること件数 / `p_*` = 案件数）を `summary` の形に読み替える。
 * 列名の対応をここ1か所に閉じておく（画面の型 `ByProjectSummary` と必ず一致させるため）。
 */
export function summaryFromRow(row: Record<string, unknown> | undefined): ByProjectSummary {
  const pick = (prefix: 'a' | 'p'): DueCounts => ({
    overdue: toCount(row?.[`${prefix}_overdue`]),
    today: toCount(row?.[`${prefix}_today`]),
    week: toCount(row?.[`${prefix}_week`]),
    none: toCount(row?.[`${prefix}_none`]),
    all: toCount(row?.[`${prefix}_all`]),
  });
  return { actions: pick('a'), projects: pick('p') };
}
