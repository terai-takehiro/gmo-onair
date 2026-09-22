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
  userId?: string;
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
 * 共通の CTE。**件数を数えるのと1ページ取ってくるのは必ず同じ式**にする
 * （別々に書くと「全12件」と言いながら 8 件しか出ない、という追いにくいずれ方をする）。
 */
function baseCte(filter: ByProjectFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let where = 'WHERE a.deleted_at IS NULL';
  if (filter.userId) { where += ' AND a.user_id = ?'; params.push(filter.userId); }
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
  const dueWhere = filter.due === 'all' ? '' : `WHERE ${DUE_FILTER_SQL[filter.due]}`;

  const totalRow = await queryOne(
    `${cte} SELECT COUNT(*)::int AS c FROM grouped g ${dueWhere}`, params,
  ) as { c: number } | undefined;

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

  return { rows, total: totalRow?.c ?? 0, page, limit };
}
