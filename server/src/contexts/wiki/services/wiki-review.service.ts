/**
 * Wiki — 見直し（段F）。設計: `docs/design/v4/wiki.md` §6-⑦・§7-3 条件5・§10 #10。
 *
 * ── 「期限切れ」と言わないこと ──────────────────────────────
 *
 * ⚠️ **画面に出す言葉として「期限切れ」を使いません**（2026-09-22 のご指摘）。
 * Wiki のページは予定日を過ぎても**中身が無効になりません** — 過ぎたのは
 * 「そろそろ読み直そう」の目印だけです。バッジは「**要見直し**」。
 * **サーバーが返す文字列にも入れないこと**（`docs/wording.md`）。
 * 内部の鍵 `overdue` は API の区分の名前で、画面にはそのまま出しません。
 *
 * ── 3つのタブのうち、ここが持つのは①だけ ──────────────────
 *
 *   ① 見直し予定 … このファイル
 *   ② 足りないページ … 段E の `wiki-ai-gap.service.ts`（`listGaps` / `resolveGap`）
 *   ③ AI の直され方 … 段E の `wiki-ai-digest.service.ts`（`getWikiAiDigests`）
 *
 * ②③ を**ここで作り直しません**。同じ集計を2か所に持つと、片方を直した日に
 * 数字が食い違い、どちらが正か分からなくなります。
 *
 * ── 「見直した」で `updated_at` を動かさない ───────────────
 *
 * ⚠️ 見直しは**本文を変えない**できごとです。`savePageInternal` を通すと
 * 版（`rev`）が1つ増え、`updated_at` が今日になります。そうすると
 * 「最終更新」が本文を直した日を指さなくなり、この一覧の最終更新の列が
 * 「見直した日」の写しになって役に立ちません。予定日だけを直し、
 * **誰がいつ見直したかは `wiki_reviews`**（migration 306）に残します。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, withTransaction, type Row } from '../../../shared/db/connection';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { jstDate } from '../../../shared/utils/jst';
import type { NotifyInput } from '../../platform/services/notification.service';
import { template as notificationTemplate, fill } from '../../platform/services/notification.service';
import {
  assertReadablePage, canReadSpace, lockWritablePageTx, readableSpaceIds, wikiUserById, type WikiUser,
} from './wiki-access.service';
import { selectPageRow } from './wiki-page.service';
import { pathLabels } from './wiki-path.service';

/** 「まもなく」に入れる日数（§6-⑦「14日以内」） */
export const WIKI_REVIEW_SOON_DAYS = 14;

/**
 * 「見直した」で入れ直す既定の間隔（月）。
 *
 * 予定日そのものは**任意・既定なし**（§10 #10）なので、ここは
 * 「押したときに次をいつにするか」だけの既定です。画面が月数や日付を
 * 送ってくればそちらを使います。半年にしたのは、月1回の場で
 * 全ページを毎月読み直すのは現実的でないためです。
 */
export const WIKI_REVIEW_DEFAULT_MONTHS = 6;

/** 一覧の上限。**`counts` は切る前の数**を返す（検索の `counts` と同じ理由） */
const REVIEW_LIMIT = 300;

/** 「見直した」の記録を一覧に添える数 */
const REVIEW_LOG_LIMIT = 20;

/** 定時実行（`scheduler.service.ts`）が使う鍵。文字列を書き写さないこと */
export const WIKI_REVIEW_JOB_KEY = 'wiki_review_monthly';
export const WIKI_REVIEW_NOTIFY_TEMPLATE_ID = 'wiki_review_monthly';
/** 通知を押したときの行き先（段F の画面） */
export const WIKI_REVIEW_LINK = '/wiki/review';

export const WIKI_REVIEW_BUCKETS = ['overdue', 'soon', 'no_owner'] as const;
export type WikiReviewBucket = (typeof WIKI_REVIEW_BUCKETS)[number];

/**
 * 見直しの対象になるページ（§6-⑦）。
 *
 * - `no_owner` … 担当が空（**予定日の有無にかかわらず** — 見直す人がいない）
 * - `overdue` … 担当がいて、予定日を過ぎた（画面の表示は「要見直し」）
 * - `soon` … 担当がいて、予定日まで14日以内
 *
 * ⚠️ **担当が空かどうかを日付より先に見ます**（Codex レビュー指摘・#735）。
 * 日付を先に見ると、担当が空で予定日も過ぎているページが `overdue` に入り、
 * 「担当なし」の数と月初の通知が実態より少なく出ます。**担当を決めるのが先**
 * （見直す人がいないページは、予定日を入れ直しても誰も見ません）。
 *
 * ⚠️ **テンプレートとデータベースの行は外します。** テンプレートは
 * 「これから書く人の雛形」で読み直す中身がなく、行（データベースの子ページ）は
 * 1件ずつが記録なので、担当が空の行が数百並ぶと一覧が使えなくなります。
 * 見直しの単位はあくまで**ページ**です。
 *
 * ⚠️ 「今日」は**日本時間**で決めます（`jstDate`）。コンテナは UTC で動くので
 * `CURRENT_DATE` だと日本の朝9時までが前日扱いになります。
 */
function candidateCte(extraWhere: string): string {
  return `
    WITH cand AS (
      SELECT p.id, p.title, p.space_id, s.name AS space_name,
             s.owner_user_id AS space_owner_user_id,
             p.owner_user_id, ou.name AS owner_name,
             p.review_by::text AS review_by, p.updated_at,
             (SELECT MAX(r.reviewed_at) FROM wiki_reviews r WHERE r.page_id = p.id)
               AS last_reviewed_at,
             CASE
               WHEN p.owner_user_id IS NULL THEN 'no_owner'
               WHEN p.review_by IS NOT NULL AND p.review_by < ?::date THEN 'overdue'
               WHEN p.review_by IS NOT NULL
                    AND p.review_by <= (?::date + ${WIKI_REVIEW_SOON_DAYS}) THEN 'soon'
             END AS bucket
        FROM wiki_pages p
        JOIN wiki_spaces s ON s.id = p.space_id AND s.deleted_at IS NULL
        LEFT JOIN users ou ON ou.id = p.owner_user_id
        LEFT JOIN wiki_pages par ON par.id = p.parent_id AND par.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND p.status = 'published'
         AND p.is_template = FALSE
         AND COALESCE(par.kind, 'page') <> 'database'
         AND (p.review_by IS NOT NULL OR p.owner_user_id IS NULL)
         ${extraWhere}
    )
  `;
}

/** 区分の並び（要見直し → まもなく → 担当が空）。画面もこの順に出す */
const BUCKET_ORDER = `CASE bucket WHEN 'overdue' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END`;

export interface ListReviewInput {
  bucket?: WikiReviewBucket;
  limit?: number;
  /**
   * スペースで絞る。**SQL の `LIMIT` より先に当てます**（Codex レビュー指摘・#735）。
   * 画面側で返ってきた行を絞ると、**上限の先にある行は最初から手元に無い**ので、
   * そのスペースに見直すページがあっても「0件」に見えます。
   * 読めないスペースを指定されたときは 403 ではなく**空**で返します（§8）。
   */
  space_id?: string;
}

export interface WikiReviewList {
  rows: Row[];
  counts: Record<WikiReviewBucket, number>;
  recent_reviews: Row[];
}

/**
 * 見直し予定の一覧（§6-⑦ ①）。**読めるスペースだけ**（§8）。
 *
 * 権限は reader です。ここに出るのはその人が開けるページの題・担当・予定日で、
 * ページを開けば読めるものばかりなので、隠す意味がありません
 * （ホームの「あなたが担当で予定日を過ぎたページ」と同じ線引き）。
 * 「見直した」を押すのは editor（`markReviewed`）。
 */
export async function listReview(user: WikiUser, input: ListReviewInput = {}): Promise<WikiReviewList> {
  const empty: WikiReviewList = {
    rows: [], counts: { overdue: 0, soon: 0, no_owner: 0 }, recent_reviews: [],
  };
  const all = await readableSpaceIds(user);
  // 指定されたスペースは**読める範囲と重ねてから**使う（読めないスペースは空で返す）
  const spaceIds = input.space_id ? all.filter((id) => id === input.space_id) : all;
  if (spaceIds.length === 0) return empty;

  const today = jstDate();
  const limit = Math.min(Math.max(Number(input.limit) || REVIEW_LIMIT, 1), REVIEW_LIMIT);
  const cte = candidateCte('AND p.space_id = ANY(?)');
  const params = [today, today, spaceIds];

  const [countRows, rows, recent] = await Promise.all([
    // ⚠️ **上限で切る前に数える。** `rows` を数えると、上限を超えたときに
    //    区分の数字が実態より小さく出ます（検索の `counts` で踏んだのと同じ穴）
    queryAll(
      `${cte} SELECT bucket, COUNT(*)::int AS n FROM cand WHERE bucket IS NOT NULL GROUP BY bucket`,
      params,
    ),
    queryAll(
      `${cte}
       SELECT id, title, space_id, space_name, owner_user_id, owner_name,
              review_by, updated_at, last_reviewed_at, bucket
         FROM cand
        WHERE bucket IS NOT NULL
          ${input.bucket ? 'AND bucket = ?' : ''}
        ORDER BY ${BUCKET_ORDER}, review_by NULLS LAST, updated_at
        LIMIT ${limit}`,
      input.bucket ? [...params, input.bucket] : params,
    ),
    listRecentReviews(spaceIds),
  ]);

  const counts = { ...empty.counts };
  for (const r of countRows) {
    const key = String(r.bucket) as WikiReviewBucket;
    if (key in counts) counts[key] = Number(r.n ?? 0);
  }

  // どこにあるページかが分からないと直しに行けないので道を付ける（ホームと同じ）
  const paths = await pathLabels(rows.map((r) => String(r.id)));
  return {
    rows: rows.map((r) => ({ ...r, path: paths.get(String(r.id)) ?? String(r.space_name ?? '') })),
    counts,
    recent_reviews: recent,
  };
}

/**
 * 直近の「見直した」の記録（§7-3 条件5「担当の名前と『見直した』の記録」）。
 *
 * ⚠️ **公開ページの記録だけを出します**（Codex レビュー指摘・#735）。
 * `markReviewed` は `assertReadablePage` を通すので**自分の下書きでも押せます**が、
 * ここはスペース単位でしか絞っていなかったため、その1行を通じて
 * **下書きの題がスペースの全員に見えて**いました（§8「下書きは書いた本人・
 * 担当・管理者だけ」）。一覧（`candidateCte`）が公開ページだけを見るのと
 * 同じ線引きに揃えます。
 */
async function listRecentReviews(spaceIds: string[]): Promise<Row[]> {
  return queryAll(
    `SELECT r.id, r.page_id, p.title AS page_title, s.name AS space_name,
            r.reviewed_by, u.name AS reviewer_name, r.reviewed_at,
            r.prev_review_by::text AS prev_review_by,
            r.next_review_by::text AS next_review_by, r.note
       FROM wiki_reviews r
       JOIN wiki_pages p ON p.id = r.page_id AND p.deleted_at IS NULL
       JOIN wiki_spaces s ON s.id = p.space_id
       LEFT JOIN users u ON u.id = r.reviewed_by
      WHERE p.space_id = ANY(?)
        AND p.status = 'published'
      ORDER BY r.reviewed_at DESC
      LIMIT ${REVIEW_LOG_LIMIT}`,
    [spaceIds],
  );
}

export interface MarkReviewedInput {
  /**
   * 次の予定日（`YYYY-MM-DD`）。
   * **`null` を送ると予定日を外します**（「このページはもう定期的には見直さない」）。
   * 送らなければ `months`（既定 6か月）で入れ直します。
   */
  review_by?: string | null;
  /** 今日から何か月後にするか（1〜60）。`review_by` を送ったときは見ません */
  months?: number;
  /** 「何を見たか」（任意）。記録に残る */
  note?: string | null;
}

/**
 * 「見直した」（editor・§6-⑦）。**次の予定日を入れ直します。**
 *
 * ⚠️ **本文は触りません**（版も `updated_at` も増えません。冒頭の注記）。
 * 記録は `wiki_reviews` に1行。予定日を外した場合も1行残します —
 * 「誰がいつ、もう見直さないと決めたか」が後から読めないと、
 * 抜け落ちたのか外したのかが分かりません。
 */
export async function markReviewed(
  user: WikiUser,
  pageId: string,
  input: MarkReviewedInput = {},
): Promise<Row> {
  // 読めないページは 404（存在ごと隠す・§8）。editor かどうかは route が見る
  await assertReadablePage(user, pageId);

  let months = WIKI_REVIEW_DEFAULT_MONTHS;
  if (input.months !== undefined && input.months !== null) {
    const n = Number(input.months);
    if (!Number.isInteger(n) || n < 1 || n > 60) {
      throw new ValidationError('次の見直しまでの月数は1〜60で入れてください。');
    }
    months = n;
  }
  const explicit = input.review_by !== undefined;
  if (explicit && input.review_by !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.review_by))) {
    throw new ValidationError('見直し予定は YYYY-MM-DD の形で入れてください。');
  }
  const note = input.note == null ? null : String(input.note).trim() || null;

  const today = jstDate();
  const reviewId = `wr-${uuid().slice(0, 8)}`;

  await withTransaction(async (tx) => {
    // 同じページへの「見直した」と保存を直列にする（`savePageInternal` と同じ行ロック）
    //   錠を取ったあとで読めるかも見直す（`lockWritablePageTx`）
    const cur = await lockWritablePageTx(tx, user, pageId);

    /*
     * 次の予定日は**DB に計算させます**。JS で月を足すと 1/31 + 1か月 が
     * 3/2 や 3/3 になる実装差（`setMonth` の繰り上がり）を踏みます。
     * Postgres の `date + interval 'N months'` は月末を月末に寄せます。
     */
    const nextSql = explicit ? '?::date' : `(?::date + (? || ' months')::interval)::date`;
    const nextParams = explicit ? [input.review_by ?? null] : [today, String(months)];

    await tx.execute(
      `UPDATE wiki_pages SET review_by = ${nextSql} WHERE id = ?`,
      [...nextParams, pageId],
    );
    await tx.execute(
      `INSERT INTO wiki_reviews (id, page_id, reviewed_by, prev_review_by, next_review_by, note)
       VALUES (?, ?, ?, ?::date, ${nextSql}, ?)`,
      [reviewId, pageId, user.id, cur.review_by ?? null, ...nextParams, note],
    );
  });

  const page = await selectPageRow(pageId);
  const review = await queryOne(
    `SELECT id, reviewed_at, prev_review_by::text AS prev_review_by,
            next_review_by::text AS next_review_by, note
       FROM wiki_reviews WHERE id = ?`,
    [reviewId],
  );
  return { ...page, last_reviewed_at: review?.reviewed_at ?? null, review };
}

/* ── 毎月1日の通知（§6-⑦「毎月1日に『今月の見直し』の通知」）───── */

/**
 * スペースごとの件数（担当が居るスペースだけ）。通知の本文に入れる数です。
 * 一覧（`listReview`）と**同じ判定**（`candidateCte`）を使います —
 * 通知の件数と画面の件数が食い違うと、開いた人が「もう誰かが直した？」と迷います。
 */
async function reviewCountsBySpace(today: string): Promise<Row[]> {
  return queryAll(
    `${candidateCte('')}
     SELECT space_id, space_name, space_owner_user_id,
            COUNT(*) FILTER (WHERE bucket = 'overdue')::int  AS overdue,
            COUNT(*) FILTER (WHERE bucket = 'soon')::int     AS soon,
            COUNT(*) FILTER (WHERE bucket = 'no_owner')::int AS no_owner
       FROM cand
      WHERE bucket IS NOT NULL AND space_owner_user_id IS NOT NULL
      GROUP BY space_id, space_name, space_owner_user_id
      ORDER BY space_name`,
    [today, today],
  );
}

/**
 * 毎月1日の「今月の見直し」（`scheduler.service.ts` から呼ばれる）。
 * 宛先は**各スペースの担当**（`wiki_spaces.owner_user_id`・§6-⑦）。
 *
 * ⚠️ **見直すものが1件も無いスペースには出しません。** 月初に「0件です」が
 * 全員に届くと、そのうち誰もベルを見なくなります（`notification.service.ts` 冒頭の
 * 「ゴミ通知」の学び）。担当が空のスペースにも出しません — 宛先が居ないためです
 * （そのスペースのページは画面の「担当が空」に出ます）。
 *
 * ⚠️ 二重送信は2段で止めます: `scheduled_job_runs`（その日1回）と
 * `notifications` の一意索引（人 × ひな形 × 対象 × `ref_date`）。
 * `ref_date` は対象月（`YYYY-MM`）なので、同じ月に何度流しても1通です。
 */
export async function runWikiReviewNoticeIfDue(today: string): Promise<NotifyInput[]> {
  // 毎月1日だけ（15分ポーリングに乗せる。制作・営業の月次レビューと同じ作法）
  if (!today.endsWith('-01')) return [];

  const tpl = await notificationTemplate(WIKI_REVIEW_NOTIFY_TEMPLATE_ID);
  // ひな形が無効なら出さない（設定 ⑦ の画面で止められる）。
  // scheduler.service.ts も同じ検査をするが、ここでも見るのは
  // 「いま流す」（force）から呼ばれたときに素通りしないため
  if (!tpl?.enabled) return [];

  const periodKey = today.slice(0, 7);
  const out: NotifyInput[] = [];
  for (const row of await reviewCountsBySpace(today)) {
    const overdue = Number(row.overdue ?? 0);
    const soon = Number(row.soon ?? 0);
    const noOwner = Number(row.no_owner ?? 0);
    const total = overdue + soon + noOwner;
    if (total === 0) continue;

    /*
     * ⚠️ **担当が「いまそのスペースを読める」ときだけ送ります**（#735 の再レビュー・Codex 指摘）。
     * 担当は閲覧の許可ではない（`wiki-access.service.ts`）ので、「メンバーだけ」のスペースの
     * 担当がメンバーから外れた・Wiki の権限を外されたあとも id は残り、そのまま送ると
     * **開けないスペースの名前と件数**がベルに届きます。コメントの通知と同じ絞り方です。
     */
    const recipient = await wikiUserById(String(row.space_owner_user_id));
    if (!recipient || !(await canReadSpace(recipient, String(row.space_id)))) continue;

    const vars = {
      'スペース名': String(row.space_name ?? ''),
      '件数': total,
      // ⚠️ 「期限切れ」と言わない（§10 #10）
      '要見直し': overdue,
      'まもなく': soon,
      '担当なし': noOwner,
    };
    out.push({
      userId: String(row.space_owner_user_id),
      templateId: WIKI_REVIEW_NOTIFY_TEMPLATE_ID,
      title: fill(tpl.subject, vars),
      body: fill(tpl.body, vars),
      link: WIKI_REVIEW_LINK,
      refType: 'wiki_space',
      refId: String(row.space_id),
      refDate: periodKey,
    });
  }
  return out;
}
