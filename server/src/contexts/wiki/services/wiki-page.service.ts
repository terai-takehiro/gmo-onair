/**
 * Wiki — ページの読み取り・履歴・閲覧の記録と、**保存のたびにサーバーがやること**。
 * 設計: `docs/design/v4/wiki.md` §5-3・§6-②⑥。
 *
 * 段A では画面から書けません（`savePageInternal` は段B のエディタと
 * 段E の MCP が呼ぶために先に置いてあります。route からは呼んでいません）。
 */
import { v4 as uuid } from 'uuid';
import {
  queryAll,
  queryOne,
  execute,
  withTransaction,
  type Row,
} from '../../../shared/db/connection';
import {
  NotFoundError,
  ValidationError,
  checkOptimisticLock,
} from '../../qsheet/services/httpErrors';
import { headingsText, extractPageLinks } from '../wiki-markdown';
import { assertReadablePage, readableSpaceIds, type WikiUser } from './wiki-access.service';
import { assertPageEditable } from './wiki-lock.service';
import { breadcrumbOf } from './wiki-path.service';

/** 閲覧の記録の入口（`wiki_page_views.via` の CHECK と同じ5つ） */
export const WIKI_VIEW_VIA = ['tree', 'search', 'answer', 'link', 'favorite'] as const;
export type WikiViewVia = (typeof WIKI_VIEW_VIA)[number];

/** 短い英数字の id（既存の `sdtpl-…` `flow-…` と同じ作り方）。URL と本文のリンクに出る */
export function newWikiPageId(): string {
  return `wp-${uuid().slice(0, 8)}`;
}

const PAGE_SELECT = `
  SELECT p.id, p.space_id, s.key AS space_key, s.name AS space_name, s.color AS space_color,
         p.parent_id, p.sort_order, p.title, p.body_md, p.icon, p.status, p.is_template, p.kind,
         p.props, p.tags, p.owner_user_id, ou.name AS owner_name,
         p.review_by::text AS review_by, p.rev, p.ai_output_id,
         p.locked_by, lu.name AS locked_by_name, p.locked_at,
         p.lock_requested_by, ru.name AS lock_requested_by_name, p.lock_requested_at,
         p.created_by, cu.name AS creator_name, p.created_at,
         p.updated_by, uu.name AS updater_name, p.updated_at, p.published_at
    FROM wiki_pages p
    JOIN wiki_spaces s ON s.id = p.space_id
    LEFT JOIN users ou ON ou.id = p.owner_user_id
    LEFT JOIN users lu ON lu.id = p.locked_by
    LEFT JOIN users ru ON ru.id = p.lock_requested_by
    LEFT JOIN users cu ON cu.id = p.created_by
    LEFT JOIN users uu ON uu.id = p.updated_by
`;

/**
 * ページ1行（`getPage` と同じ列。パンくず・バックリンクは付きません）。
 *
 * ⚠️ **閲覧の可否を見ません。** 呼ぶ側が `assertReadablePage` を通してから使うこと
 * （作成・保存のあとに「いま保存したページ」を返すための口で、
 * そこでは可否をすでに確かめています）。
 */
export async function selectPageRow(pageId: string): Promise<Row> {
  const row = await queryOne(`${PAGE_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`, [pageId]);
  if (!row) throw new NotFoundError('ページが見つかりません');
  return row;
}

/**
 * 本文からページのリンクを抜いて `wiki_links` を作り直す（§5-3-2）。
 *
 * ⚠️ **実在するページだけ**入れます — 消えたページ・打ち間違いの id を
 * そのまま入れると外部キー違反で保存ごと失敗します。
 */
export async function rebuildPageLinks(
  tx: { execute(sql: string, params?: unknown[]): Promise<void> },
  pageId: string,
  body: string,
): Promise<void> {
  await tx.execute('DELETE FROM wiki_links WHERE from_page_id = ?', [pageId]);
  const linked = extractPageLinks(body).filter((id) => id !== pageId);
  if (linked.length === 0) return;
  await tx.execute(
    `INSERT INTO wiki_links (from_page_id, to_page_id)
     SELECT ?, p.id FROM wiki_pages p WHERE p.id = ANY(?) AND p.deleted_at IS NULL
     ON CONFLICT DO NOTHING`,
    [pageId, linked],
  );
}

/**
 * ページ1件（パンくず・バックリンク・お気に入り・30日の閲覧数つき）。
 *
 * ⚠️ バックリンクは**その人が読めるスペースの公開ページ**だけを出します。
 * ここを絞らないと、読めないスペースのページ名が逆リンクとして漏れます（§8）。
 */
export async function getPage(user: WikiUser, pageId: string): Promise<Row> {
  await assertReadablePage(user, pageId);
  const page = await queryOne(`${PAGE_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`, [pageId]);
  if (!page) throw new NotFoundError('ページが見つかりません');

  const spaceIds = await readableSpaceIds(user);
  const [breadcrumb, backlinks, favorite, views] = await Promise.all([
    breadcrumbOf(pageId),
    queryAll(
      `SELECT p.id, p.title, s.name AS space_name, s.color
         FROM wiki_links l
         JOIN wiki_pages p ON p.id = l.from_page_id AND p.deleted_at IS NULL
         JOIN wiki_spaces s ON s.id = p.space_id
        WHERE l.to_page_id = ? AND p.status = 'published' AND p.space_id = ANY(?)
        ORDER BY p.updated_at DESC
        LIMIT 50`,
      [pageId, spaceIds],
    ),
    queryOne('SELECT 1 AS ok FROM wiki_favorites WHERE user_id = ? AND page_id = ?', [user.id, pageId]),
    queryOne(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE via = 'answer')::int AS from_answer
         FROM wiki_page_views
        WHERE page_id = ? AND viewed_at > NOW() - INTERVAL '30 days'`,
      [pageId],
    ),
  ]);

  return {
    ...page,
    breadcrumb,
    backlinks,
    favorited: !!favorite,
    view_count_30d: Number(views?.total ?? 0),
    view_from_answer_30d: Number(views?.from_answer ?? 0),
  };
}

/**
 * 履歴の一覧。**`body_md` は返しません** — 版が増えると本文の全文が何十本も乗り、
 * 一覧を開くだけで数 MB になるためです（全文は `getVersion` で1版ずつ）。
 */
export async function listVersions(user: WikiUser, pageId: string): Promise<Row[]> {
  await assertReadablePage(user, pageId);
  return queryAll(
    `SELECT v.id, v.page_id, v.rev, v.title, v.tags, v.saved_by, u.name AS saver_name,
            v.saved_at, v.note
       FROM wiki_page_versions v
       LEFT JOIN users u ON u.id = v.saved_by
      WHERE v.page_id = ?
      ORDER BY v.rev DESC
      LIMIT 200`,
    [pageId],
  );
}

/** 版1件（本文つき）。履歴の差分（段B）はこれを2本取って画面で比べる */
export async function getVersion(user: WikiUser, pageId: string, rev: number): Promise<Row> {
  await assertReadablePage(user, pageId);
  if (!Number.isInteger(rev) || rev < 1) throw new ValidationError('版の番号が正しくありません');
  const row = await queryOne(
    `SELECT v.id, v.page_id, v.rev, v.title, v.body_md, v.props, v.tags,
            v.saved_by, u.name AS saver_name, v.saved_at, v.note
       FROM wiki_page_versions v
       LEFT JOIN users u ON u.id = v.saved_by
      WHERE v.page_id = ? AND v.rev = ?`,
    [pageId, rev],
  );
  if (!row) throw new NotFoundError('この版は見つかりません');
  return row;
}

/**
 * 閲覧を記録する（§7-3 条件3 の材料）。
 *
 * ⚠️ `answer_output_id` は **`ai_outputs` に実在するときだけ**入れます。
 * 無い id をそのまま渡すと外部キー違反で 500 になり、「ページを開いた」という
 * 本来どうでもよい操作が画面のエラーになってしまいます。
 */
export async function recordView(
  user: WikiUser,
  pageId: string,
  via: string,
  answerOutputId?: string | null,
): Promise<void> {
  await assertReadablePage(user, pageId);
  if (!WIKI_VIEW_VIA.includes(via as WikiViewVia)) {
    throw new ValidationError('閲覧の入口が正しくありません');
  }
  let outputId: string | null = null;
  if (via === 'answer' && answerOutputId) {
    const hit = await queryOne('SELECT 1 AS ok FROM ai_outputs WHERE id = ?', [answerOutputId]);
    if (hit) outputId = answerOutputId;
  }
  await execute(
    'INSERT INTO wiki_page_views (page_id, user_id, via, answer_output_id) VALUES (?, ?, ?, ?)',
    [pageId, user.id, via, outputId],
  );
}

/* ── 保存（§5-3）─────────────────────────────────────────────── */

export interface SavePageInput {
  title?: string;
  body_md?: string;
  icon?: string | null;
  status?: 'draft' | 'published' | 'archived';
  parent_id?: string | null;
  sort_order?: number;
  props?: Record<string, unknown>;
  tags?: string[];
  owner_user_id?: string | null;
  /** 見直し期限。`YYYY-MM-DD` か null（任意・既定なし。§10 #10） */
  review_by?: string | null;
  /** 「何を変えたか」（任意）。履歴の1行に残る */
  note?: string | null;
  /** 画面が最後に受け取った `updated_at`。食い違えば `ConflictError`（409） */
  expected_updated_at?: string;
}

/** 渡されたものだけを上書きする（`undefined` は「触らない」） */
function pick<T>(given: T | undefined, current: T): T {
  return given === undefined ? current : given;
}

/**
 * **保存のたびにサーバーがやること**（§5-3）。段B のエディタ・段E の MCP が呼びます。
 *
 * 1. `updated_at` の突き合わせ（食い違えば `ConflictError`・409）
 * 2. `wiki_page_versions` に全文を1行足す（`rev` +1）
 * 3. 本文から見出しを抜いて `headings` を入れ直す（検索がタイトルの次に重く見る列）
 * 4. 本文からページのリンクを抜いて `wiki_links` を作り直す（バックリンク）
 *
 * ⚠️ **1〜4 は1つのトランザクションで行います。** 途中で落ちると
 * 「本文は新しいのに履歴が無い」「リンクだけ古い」が残り、後から直せません。
 *
 * 5. 編集ロック（§6-③）の確認。**本文・題を変える保存だけ**が対象です —
 *    担当・見直し予定・タグ（§6-② の情報の欄）は、他の人が編集中でも直せます
 *
 * ⚠️ **まだやっていないこと**（段が来たら足す）:
 * - `ai_corrections` への差分（§5-3-4・§7-3）… 段E
 * - データベースの行の値の検査（§5-3-6。`shared/src/wiki/markdown.ts` の
 *   `sanitizeProps` と同じものをサーバー側にも写す）… 段C
 */
export async function savePageInternal(
  pageId: string,
  input: SavePageInput,
  user: { id: string },
): Promise<Row> {
  if (input.title !== undefined && !String(input.title).trim()) {
    throw new ValidationError('題を入れてください');
  }
  if (input.review_by != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.review_by)) {
    throw new ValidationError('見直し期限は YYYY-MM-DD の形で入れてください');
  }

  await withTransaction(async (tx) => {
    // 同じページへの同時保存を直列にする（FOR UPDATE）。突き合わせだけでは、
    // 2人が同じ `updated_at` を持って同時に来たときに両方が通ってしまう
    const cur = await tx.queryOne(
      `SELECT p.id, p.rev, p.title, p.body_md, p.icon, p.status, p.parent_id, p.sort_order,
              p.props, p.tags, p.owner_user_id, p.review_by::text AS review_by,
              p.published_at, p.updated_at, p.updated_by,
              p.locked_by, p.locked_at,
              (SELECT u.name FROM users u WHERE u.id = p.updated_by) AS updater_name,
              (SELECT u.name FROM users u WHERE u.id = p.locked_by) AS locked_by_name
         FROM wiki_pages p
        WHERE p.id = ? AND p.deleted_at IS NULL
        FOR UPDATE`,
      [pageId],
    );
    if (!cur) throw new NotFoundError('ページが見つかりません');

    // 編集ロック（§6-③）。**本文・題を変えるときだけ**見る —
    //    情報の欄（担当・見直し予定・タグ・アイコン）は編集中の人が居ても直せる（§6-②）。
    //    `cur` は上で `FOR UPDATE` を取っているので、引き継ぎ（`takeoverWikiLock`）と
    //    この保存は同じ行ロックを取り合い、必ずどちらかが先に確定する
    if (input.body_md !== undefined || input.title !== undefined) {
      assertPageEditable(cur, user.id);
    }

    checkOptimisticLock(
      input.expected_updated_at,
      { updated_at: cur.updated_at, updated_by: cur.updated_by, updater_name: cur.updater_name },
      user.id,
      'このページ',
    );

    const title = String(pick(input.title, cur.title)).trim();
    const body = String(pick(input.body_md, cur.body_md) ?? '');
    const status = String(pick(input.status, cur.status));
    const props = pick(input.props, cur.props as Record<string, unknown>) ?? {};
    const tags = pick(input.tags, cur.tags as string[]) ?? [];
    const rev = Number(cur.rev) + 1;

    // ② 履歴に全文を1行足す。**先に足す** — 本文を先に書き換えると、
    //    途中で落ちたときに「どの本文だったか」を復元できない
    await tx.execute(
      `INSERT INTO wiki_page_versions (id, page_id, rev, title, body_md, props, tags, saved_by, note)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
      [`wv-${uuid().slice(0, 8)}`, pageId, rev, title, body, JSON.stringify(props), tags, user.id, input.note ?? null],
    );

    // ③ 本文 ＋ 導出値（headings）を入れ直す。`published_at` は初めて公開した時刻を残す
    await tx.execute(
      `UPDATE wiki_pages
          SET title = ?, body_md = ?, headings = ?, icon = ?, status = ?,
              parent_id = ?, sort_order = ?, props = ?::jsonb, tags = ?,
              owner_user_id = ?, review_by = ?::date, rev = ?,
              published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN NOW() ELSE published_at END,
              updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        title,
        body,
        headingsText(body),
        pick(input.icon, cur.icon),
        status,
        pick(input.parent_id, cur.parent_id),
        pick(input.sort_order, cur.sort_order),
        JSON.stringify(props),
        tags,
        pick(input.owner_user_id, cur.owner_user_id),
        pick(input.review_by, cur.review_by),
        rev,
        status,
        user.id,
        pageId,
      ],
    );

    // ④ バックリンクを作り直す（作成のときと同じ `rebuildPageLinks` を通す）
    await rebuildPageLinks(tx, pageId, body);
  });

  return selectPageRow(pageId);
}
