/**
 * Wiki — コメント（段F）。設計: `docs/design/v4/wiki.md` §6-⑧・§7-3 の「穴」・§8。
 *
 * ── 何のためにあるか ────────────────────────────────────────
 *
 * 手順書は**書いた人より使う人のほうが間違いに気づきます**（「この機材はもう無い」
 * 「先に電源を切らないと落ちる」）。コメントはその場で残す口で、
 * **そのページの担当に通知**します（§6-⑧）。担当に届かないコメントは、
 * 書いた人だけが満足して終わり、ページは直りません。
 *
 * ⚠️ **読めないページのコメントは 403 ではなく 404**（§8「存在ごと見えない」）。
 * 判定は `wiki-access.service.ts` の `assertReadablePage` が持っていて、
 * ここでは**必ず先に通します**。403 を返すと「そこに何かがある」ことが伝わります。
 *
 * ⚠️ **消せるのは書いた本人か manager だけ**（`deleted_at` を入れる・行は残す）。
 * 人の指摘を第三者が黙って消せると、現場の「違う」が記録から消えます。
 * ここは**読めるかどうかとは別の話**なので、403（`FORBIDDEN`）を返します —
 * 本人はその行が見えているので、404 にしても何も隠せません。
 *
 * ── §7-3 の「穴」の代替指標 ────────────────────────────────
 *
 * 「AI の答えが現場で正しかったか」は取れません（`wiki-ai-outcomes.service.ts` の注記）。
 * 代替として **AI から生まれたページに付いたコメントの数**を数えます（§7-3）。
 * `commentOutcome()` がそれで、**`wiki-ai-outcomes.service.ts` には足しません** —
 * あちらは「AI の出力から数える」側で、こちらは「コメントから数える」側です。
 * 同じ数字を2か所で作ると、片方を直した日に食い違います。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, type Row } from '../../../shared/db/connection';
import { ForbiddenError, NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { notify, template as notificationTemplate, fill } from '../../platform/services/notification.service';
import {
  assertReadablePage, isWikiManager, readableSpaceIds, type WikiUser,
} from './wiki-access.service';

/** 通知のひな形（migration 306）。設定 ⑦ の画面から止められる */
export const WIKI_COMMENT_TEMPLATE_ID = 'wiki_comment';

/**
 * 1件の長さの上限。**超えたら切らずに断ります** — 黙って切ると、
 * 現場が書いた指摘の後半が消えたことに誰も気づけません。
 */
export const WIKI_COMMENT_MAX_CHARS = 5_000;

/** 1ページに出すコメントの上限（返信を含む） */
const COMMENT_LIMIT = 500;

/** 成果の一覧に出す上位の数 */
const OUTCOME_TOP = 10;

const COMMENT_SELECT = `
  SELECT c.id, c.page_id, c.parent_id, c.body_md,
         c.created_by, cu.name AS creator_name, c.created_at,
         c.resolved_at, c.resolved_by, ru.name AS resolver_name
    FROM wiki_comments c
    LEFT JOIN users cu ON cu.id = c.created_by
    LEFT JOIN users ru ON ru.id = c.resolved_by
`;

/** コメント1本 ＋ そのページ（読めるかの判定に要る分だけ） */
async function commentWithPage(commentId: string): Promise<Row> {
  const row = await queryOne(
    `SELECT c.id, c.page_id, c.created_by, c.resolved_at, c.deleted_at
       FROM wiki_comments c
      WHERE c.id = ?`,
    [commentId],
  );
  // 消したコメントも「無い」として扱う（消したことを伝える相手がいない）
  if (!row || row.deleted_at) throw new NotFoundError('コメントが見つかりません');
  return row;
}

/** `wc-…`。`wp-`（ページ）・`wv-`（版）・`wg-`（足りないページ）と同じ作り方 */
function newCommentId(): string {
  return `wc-${uuid().slice(0, 8)}`;
}

/**
 * そのページのコメント（返信つき・古い順）。
 *
 * ⚠️ **入れ子は1段だけ**です。親が消されている返信は**親の無い返信として
 * 上に並べます** — 親ごと隠すと、現場が残した指摘が道連れで消えます。
 *
 * ⚠️ 上に上げた返信は **`parent_id` を `null` にして返します**
 * （Codex レビュー指摘・#735）。`parent_id` を持ったまま根に並べると、
 * 画面は「根＝返信できる」と見て返信欄を出すのに、`addComment` が
 * 「返信への返信」と見て 400 で断る、という食い違いが起きます。
 * サーバー側（`addComment`）も、**親が消えている返信は根として扱います**。
 */
export async function listComments(user: WikiUser, pageId: string): Promise<Row[]> {
  await assertReadablePage(user, pageId);
  const rows = await queryAll(
    `${COMMENT_SELECT}
      WHERE c.page_id = ? AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT ${COMMENT_LIMIT}`,
    [pageId],
  );
  const manager = isWikiManager(user);
  const decorate = (r: Row): Row => ({
    ...r,
    can_delete: manager || r.created_by === user.id,
  });

  const byId = new Map<string, Row>();
  for (const r of rows) byId.set(String(r.id), { ...decorate(r), replies: [] as Row[] });

  const top: Row[] = [];
  for (const r of rows) {
    const node = byId.get(String(r.id))!;
    const parent = r.parent_id ? byId.get(String(r.parent_id)) : undefined;
    // 親が消えている／同じページに無い返信は、根に上げて必ず見えるようにする
    if (parent && parent !== node) (parent.replies as Row[]).push(node);
    else {
      // 上げた以上は根として扱う（`parent_id` を残すと返信欄だけ出て 400 になる）
      node.parent_id = null;
      top.push(node);
    }
  }
  return top;
}

export interface AddCommentInput {
  body_md: string;
  /** 返信先。**入れ子は1段だけ**（返信への返信は断る） */
  parent_id?: string | null;
}

/**
 * コメントを1件書く（reader）。**読めないページは 404。**
 *
 * 通知は**そのページの担当**へ（§6-⑧）。返信のときは元のコメントを書いた人にも。
 * **best-effort** — 通知に失敗してもコメントは残します（記録のために
 * 利用者が書いた文を落とさない。`task-comments.service.ts` と同じ作法）。
 */
export async function addComment(
  user: WikiUser,
  pageId: string,
  input: AddCommentInput,
): Promise<Row> {
  await assertReadablePage(user, pageId);

  const body = String(input.body_md ?? '').trim();
  if (!body) throw new ValidationError('コメントを入力してください。');
  if (body.length > WIKI_COMMENT_MAX_CHARS) {
    throw new ValidationError(
      `コメントが長すぎます（${WIKI_COMMENT_MAX_CHARS.toLocaleString()}字まで）。分けて書いてください。`,
    );
  }

  let parentId: string | null = null;
  if (input.parent_id) {
    const parent = await queryOne(
      'SELECT id, page_id, parent_id FROM wiki_comments WHERE id = ? AND deleted_at IS NULL',
      [input.parent_id],
    );
    // 別のページのコメントに返信させない（id を打ち替えれば他のページに書けてしまう）
    if (!parent || String(parent.page_id) !== pageId) {
      throw new NotFoundError('返信先のコメントが見つかりません');
    }
    if (parent.parent_id) {
      // 親の親が**まだ生きている**ときだけ断る。消えているなら、その返信は
      // `listComments` が根に上げたもの（画面にも根として出ている）なので受ける
      const grand = await queryOne(
        'SELECT id FROM wiki_comments WHERE id = ? AND deleted_at IS NULL',
        [parent.parent_id],
      );
      if (grand) {
        throw new ValidationError('返信への返信はできません。元のコメントに返信してください。');
      }
    }
    parentId = String(parent.id);
  }

  const id = newCommentId();
  await execute(
    `INSERT INTO wiki_comments (id, page_id, parent_id, body_md, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, pageId, parentId, body, user.id],
  );

  await notifyComment(user, pageId, id, parentId, body);

  const row = await queryOne(`${COMMENT_SELECT} WHERE c.id = ?`, [id]);
  return { ...(row ?? {}), can_delete: true, replies: [] };
}

/**
 * コメントが付いたことを担当に伝える（§6-⑧）。**best-effort**。
 *
 * ⚠️ `refDate` にコメントの id を入れます。一意索引（人 × ひな形 × 対象 × 日）は
 * ここを変えないと**2通目以降が消えます** — コメントは同じページに何度も付くので、
 * 1件ごとに届かないと会話になりません（`dg_comment` と同じ判断）。
 */
async function notifyComment(
  user: WikiUser,
  pageId: string,
  commentId: string,
  parentId: string | null,
  body: string,
): Promise<void> {
  try {
    const tpl = await notificationTemplate(WIKI_COMMENT_TEMPLATE_ID);
    if (!tpl?.enabled) return;

    const page = await queryOne(
      'SELECT title, owner_user_id FROM wiki_pages WHERE id = ? AND deleted_at IS NULL',
      [pageId],
    );
    if (!page) return;

    const to = new Set<string>();
    if (page.owner_user_id) to.add(String(page.owner_user_id));
    if (parentId) {
      const parent = await queryOne('SELECT created_by FROM wiki_comments WHERE id = ?', [parentId]);
      if (parent?.created_by) to.add(String(parent.created_by));
    }
    // 自分の書き込みで自分のベルを鳴らさない
    to.delete(user.id);
    if (to.size === 0) return;

    const author = await queryOne('SELECT name FROM users WHERE id = ?', [user.id]);
    const vars = {
      '投稿者名': author?.name ? String(author.name) : '（不明）',
      'ページ名': String(page.title ?? ''),
      // 通知は一言で分かればよい。長文はページで読む
      '本文': body.length > 120 ? `${body.slice(0, 120)}…` : body,
    };
    for (const userId of to) {
      await notify({
        userId,
        templateId: WIKI_COMMENT_TEMPLATE_ID,
        title: fill(tpl.subject, vars),
        body: fill(tpl.body, vars),
        link: `/wiki/p/${pageId}`,
        refType: 'wiki_page',
        refId: pageId,
        refDate: commentId,
      });
    }
  } catch (e) {
    console.warn('[wiki-comment] コメント通知の作成に失敗（コメントは保存済み）:', (e as Error).message);
  }
}

/**
 * 解決にする／戻す（reader）。
 *
 * 戻せるようにしてあるのは、**間違って押したときに取り返せないと
 * 誰も押さなくなる**ためです（解決の印は「直した」の目印で、記録ではありません）。
 */
export async function setCommentResolved(
  user: WikiUser,
  commentId: string,
  resolved: boolean,
): Promise<Row> {
  const c = await commentWithPage(commentId);
  await assertReadablePage(user, String(c.page_id));
  await execute(
    `UPDATE wiki_comments
        SET resolved_at = ${resolved ? 'NOW()' : 'NULL'},
            resolved_by = ?
      WHERE id = ?`,
    [resolved ? user.id : null, commentId],
  );
  const row = await queryOne(`${COMMENT_SELECT} WHERE c.id = ?`, [commentId]);
  return { ...(row ?? {}), can_delete: isWikiManager(user) || row?.created_by === user.id };
}

/**
 * 消す（**書いた本人か manager だけ**）。行は残して `deleted_at` を入れます。
 *
 * ⚠️ 返信を持つコメントを消しても、返信は残して上に上げます（`listComments`）。
 * 親ごと消すと、返信で確定した結論まで消えます。
 */
export async function deleteComment(user: WikiUser, commentId: string): Promise<Row> {
  const c = await commentWithPage(commentId);
  // ①まず「読めるか」（読めないページのコメントは 404 = 存在ごと隠す）
  await assertReadablePage(user, String(c.page_id));
  // ②次に「消せるか」。ここは 403 — 本人にはその行が見えているので隠す意味が無い
  if (c.created_by !== user.id && !isWikiManager(user)) {
    throw new ForbiddenError('コメントを消せるのは書いた本人か Wiki の管理者だけです');
  }
  await execute('UPDATE wiki_comments SET deleted_at = NOW() WHERE id = ?', [commentId]);
  return { id: commentId, page_id: c.page_id, deleted: true };
}

/* ── AI の成果としてのコメント（§7-3 の「穴」）───────────────── */

/**
 * AI から生まれたページ（①下書き ②回答から「ページにする」）と、
 * そこに**その後**付いたコメントを結ぶ。
 *
 * ⚠️ **AI の出力より前のコメントは数えません。** ページを作る前に付いた
 * コメント（取り込みで後から `ai_output_id` を結んだページなど）まで数えると、
 * AI と関係のない指摘が AI の成果に混ざります。
 *
 * ⚠️ **1ページ＝1行にしてから数えます**（Codex レビュー指摘・#735）。
 * 「回答からページにする」は、**新しい下書き**（`wiki_pages.ai_output_id`）と
 * **元の回答**（`wiki_ai_messages.spawned_page_id`）の**両方**を結ぶので、
 * `UNION` のままだと同じページが2行出て、ページ数もコメント数も**倍になります**。
 * 残すのは**いちばん古い出力**です — そこから後のコメントを数えるので、
 * 新しいほうを採ると、回答からページになるまでの間に付いた指摘が落ちます。
 */
const AI_PAGE_CTE = `
  WITH src AS (
    SELECT p.id AS page_id, p.title AS page_title, p.space_id,
           o.id AS ai_output_id, o.kind, o.created_at
      FROM wiki_pages p
      JOIN ai_outputs o ON o.id = p.ai_output_id
     WHERE p.deleted_at IS NULL
    UNION
    SELECT p.id, p.title, p.space_id, o.id, o.kind, o.created_at
      FROM wiki_ai_messages m
      JOIN ai_outputs o ON o.id = m.ai_output_id
      JOIN wiki_pages p ON p.id = m.spawned_page_id AND p.deleted_at IS NULL
  ), one_per_page AS (
    -- 同じ id で並べ替えの結果が変わらないよう、日付が同着なら id で決める
    SELECT DISTINCT ON (page_id) *
      FROM src
     ORDER BY page_id, created_at ASC, ai_output_id ASC
  ), scoped AS (
    SELECT * FROM one_per_page
     WHERE created_at >= NOW() - (? || ' days')::interval
       AND space_id = ANY(?)
  ), counted AS (
    SELECT s.*,
           (SELECT COUNT(*) FROM wiki_comments c
             WHERE c.page_id = s.page_id AND c.deleted_at IS NULL
               AND c.created_at >= s.created_at)::int AS comments,
           (SELECT COUNT(*) FROM wiki_comments c
             WHERE c.page_id = s.page_id AND c.deleted_at IS NULL
               AND c.created_at >= s.created_at AND c.resolved_at IS NULL)::int AS unresolved,
           (SELECT MAX(c.created_at) FROM wiki_comments c
             WHERE c.page_id = s.page_id AND c.deleted_at IS NULL
               AND c.created_at >= s.created_at) AS last_comment_at
      FROM scoped s
  )
`;

export interface WikiCommentOutcome {
  window_days: number;
  ai_pages: number;
  pages_with_comments: number;
  comment_rate: number | null;
  comments_total: number;
  unresolved_total: number;
  top: Row[];
}

/**
 * 「回答・下書きから作ったページに付いたコメント」を、その AI の成果として数える
 * （§7-3 の「穴」の代替指標）。**見直しの画面（§6-⑦ ③）が読みます。**
 *
 * ⚠️ **読めるスペースだけ**に絞ります。manager でも、入っていない `members` の
 * スペースのページ名は出しません（`listGaps` と同じ絞り方）。
 * ⚠️ **コメントの本文は返しません**（数と日付だけ）。本文は人が打った文で、
 * 読めないスペースの中身を含みうるためです。
 * ⚠️ **コメントが多い＝AI が悪い、ではありません。** よく読まれるページほど
 * 指摘も付きます。見るのは**未解決のまま残っている数**です。
 */
export async function commentOutcome(user: WikiUser, windowDays = 90): Promise<WikiCommentOutcome> {
  const days = Math.min(Math.max(Math.trunc(windowDays) || 90, 1), 730);
  const spaceIds = await readableSpaceIds(user);
  const params = [String(days), spaceIds];

  const totals = await queryOne(
    `${AI_PAGE_CTE}
     SELECT COUNT(*)::int AS ai_pages,
            COUNT(*) FILTER (WHERE comments > 0)::int AS pages_with_comments,
            COALESCE(SUM(comments), 0)::int AS comments_total,
            COALESCE(SUM(unresolved), 0)::int AS unresolved_total
       FROM counted`,
    params,
  );
  const top = await queryAll(
    `${AI_PAGE_CTE}
     SELECT ai_output_id, kind, page_id, page_title, comments, unresolved, last_comment_at
       FROM counted
      WHERE comments > 0
      ORDER BY unresolved DESC, comments DESC, last_comment_at DESC
      LIMIT ${OUTCOME_TOP}`,
    params,
  );

  const aiPages = Number(totals?.ai_pages ?? 0);
  return {
    window_days: days,
    ai_pages: aiPages,
    pages_with_comments: Number(totals?.pages_with_comments ?? 0),
    // 分母が 0 のときは null（「0%」と出すと嘘になる。`wiki-ai-outcomes` の `rate` と同じ）
    comment_rate: aiPages > 0 ? Number(totals?.pages_with_comments ?? 0) / aiPages : null,
    comments_total: Number(totals?.comments_total ?? 0),
    unresolved_total: Number(totals?.unresolved_total ?? 0),
    top,
  };
}
