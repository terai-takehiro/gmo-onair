/**
 * Wiki — ページの作成・削除・並べ替え・テンプレート（段B）。
 * 設計: `docs/design/v4/wiki.md` §5-3・§6-①③・§8。
 *
 * 本文の保存そのものは `wiki-page.service.ts` の `savePageInternal` が行います。
 * こちらは**ページという入れ物を増やす・消す・動かす**ほうです。
 *
 * ⚠️ **並べ替えとテンプレートの登録は `updated_at` を変えません。** 変えると、
 * そのページを開いて書いている人の次の保存が「他の人が先に更新しました」で
 * 止まります（ツリーで動かしただけなのに本文の保存が失敗する）。
 * 本文・題・情報の欄を変えるのは `savePageInternal` だけ、と役目を分けています。
 */
import { v4 as uuid } from 'uuid';
import {
  queryAll,
  queryOne,
  withTransaction,
  type Row,
} from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { headingsText } from '../wiki-markdown';
import {
  canReadSpace,
  assertReadablePage,
  readableSpaceIds,
  type WikiUser,
} from './wiki-access.service';
import { assertPageEditable } from './wiki-lock.service';
import { newWikiPageId, selectPageRow, rebuildPageLinks } from './wiki-page.service';
import { parentDatabaseItems } from './wiki-row-props';
import { recordWikiDraftReject } from './wiki-ai-corrections.service';
import { markGapWrittenTx, readOpenGapFor } from './wiki-ai-gap.service';
import { sanitizeProps } from '../wiki-props';
import type { WikiPropValue } from '../wiki-props';

/** 親をたどる深さの上限（`wiki-path.service.ts` と同じ 20）。取り違えで無限に回るのを DB 側で止める */
const MAX_DEPTH = 20;

/** 並び順の刻み。間に1つ入れられるよう 10 ずつ空ける */
const SORT_STEP = 10;

export interface CreatePageInput {
  space_id: string;
  parent_id?: string | null;
  title?: string;
  /** テンプレートのページ id。本文・アイコン・タグ・項目の値を写す */
  templateId?: string | null;
  /** 本文を最初から入れて作る（AI の下書き・取り込み用）。テンプレートより優先する */
  body_md?: string;
  icon?: string | null;
  status?: 'draft' | 'published';
  /** タグ（取り込み用）。テンプレートから写した分より優先する */
  tags?: string[];
  /** 項目の値（取り込み・データベースの行）。親の項目定義に合わない値は黙って落とす */
  props?: Record<string, WikiPropValue>;
  /** 見直し予定日（`YYYY-MM-DD` か null）。任意・既定なし（§10 #10） */
  review_by?: string | null;
  /** 履歴の1行に残す「何をしたか」（既定は「ページを追加」） */
  note?: string;
  /**
   * 「足りないページ」から起こしたときの、その質問の id（§6-⑦ ②）。
   *
   * ⚠️ **画面で2回に分けて呼ばないこと**（Codex レビュー指摘・#735）。
   * 「ページを作る」→「質問を片づける」を画面から順に投げると、**前半だけ成功した
   * ときに下書きが残ったまま操作は失敗**として見え、押し直すと**下書きがもう1本**
   * できます。1回の呼び出しにして、**ページを作る取引の中で**結びつけます
   * （落ちたらページごと巻き戻るので、押し直しがきれいなやり直しになる）。
   */
  gap_id?: string | null;
}

/** 題を入れずに作れる（あとから直せる）。ツリーに出る仮の題 */
const UNTITLED = '無題のページ';

/* ── 親子の検査 ──────────────────────────────────────────── */

/** その id のページを1行だけ引く（削除済みは無い扱い） */
async function pageRowOf(pageId: string): Promise<Row> {
  const row = await queryOne(
    `SELECT id, space_id, parent_id, sort_order, status, is_template, title, body_md,
            icon, props, tags, locked_by, locked_at,
            (SELECT u.name FROM users u WHERE u.id = wiki_pages.locked_by) AS locked_by_name
       FROM wiki_pages WHERE id = ? AND deleted_at IS NULL`,
    [pageId],
  );
  if (!row) throw new NotFoundError('ページが見つかりません');
  return row;
}

/**
 * 親に置けるか。**自分自身・自分の下の階層は親にできません**（循環参照）。
 * 親は同じスペースの中だけです（スペースをまたぐ移動は作りません）。
 */
async function assertValidParent(
  spaceId: string,
  parentId: string | null,
  pageId?: string,
): Promise<void> {
  if (!parentId) return;
  if (pageId && parentId === pageId) {
    throw new ValidationError('このページ自身を親にはできません。別の場所を選んでください。');
  }
  const parent = await queryOne(
    'SELECT id, space_id FROM wiki_pages WHERE id = ? AND deleted_at IS NULL',
    [parentId],
  );
  if (!parent) throw new NotFoundError('親にするページが見つかりません');
  if (String(parent.space_id) !== spaceId) {
    throw new ValidationError('親にできるのは同じスペースのページだけです。別のページを選んでください。');
  }
  if (!pageId) return;

  // 自分の下の階層に入れようとしていないか（循環参照）
  const hit = await queryOne(
    `WITH RECURSIVE sub AS (
        SELECT p.id, 0 AS depth FROM wiki_pages p WHERE p.id = ? AND p.deleted_at IS NULL
        UNION ALL
        SELECT c.id, s.depth + 1 FROM sub s
          JOIN wiki_pages c ON c.parent_id = s.id AND c.deleted_at IS NULL
         WHERE s.depth < ${MAX_DEPTH}
      )
      SELECT 1 AS ok FROM sub WHERE id = ? LIMIT 1`,
    [pageId, parentId],
  );
  if (hit) {
    throw new ValidationError('このページの下の階層へは移動できません。別の場所を選んでください。');
  }
}

/** 同じ親の中でいちばん後ろの並び順の次 */
async function nextSortOrder(spaceId: string, parentId: string | null): Promise<number> {
  const row = await queryOne(
    `SELECT COALESCE(MAX(sort_order), 0) + ${SORT_STEP} AS next
       FROM wiki_pages
      WHERE space_id = ? AND parent_id IS NOT DISTINCT FROM ?::text AND deleted_at IS NULL`,
    [spaceId, parentId],
  );
  return Number(row?.next ?? SORT_STEP);
}

/* ── 作成 ────────────────────────────────────────────────── */

/**
 * ページを追加する（§6-①③）。
 *
 * - スペースが読めない人には「無い」と返します（§8。存在ごと隠す）
 * - テンプレートを指定すると本文・アイコン・タグ・項目の値を写します
 * - 作った時点で第1版を履歴に残します（あとで「最初はどうだったか」を見られる）
 */
export async function createPage(user: WikiUser, input: CreatePageInput): Promise<Row> {
  const spaceId = String(input.space_id ?? '');
  if (!spaceId) throw new ValidationError('スペースを選んでください。');
  if (!(await canReadSpace(user, spaceId))) throw new NotFoundError('スペースが見つかりません');

  const parentId = input.parent_id ? String(input.parent_id) : null;
  await assertValidParent(spaceId, parentId);
  // 足りないページから作るとき: 見てよい質問か（manager・読めるスペース・まだ `open`）
  if (input.gap_id) await readOpenGapFor(user, String(input.gap_id));

  let body = typeof input.body_md === 'string' ? input.body_md : '';
  let icon = input.icon ?? null;
  let props: Record<string, unknown> = {};
  let tags: string[] = [];
  let note = 'ページを追加';

  if (input.templateId) {
    // ⚠️ **読めるかを先に見る。** 「テンプレートではありません」を先に返すと、
    //    読めないページの id を当てた人に「そこに何かがある」ことが伝わる（§8）
    await assertReadablePage(user, String(input.templateId));
    const tpl = await pageRowOf(String(input.templateId));
    if (!tpl.is_template) throw new ValidationError('テンプレートではないページは指定できません。');
    if (!input.body_md) body = String(tpl.body_md ?? '');
    icon = input.icon !== undefined ? input.icon : ((tpl.icon as string | null) ?? null);
    props = (tpl.props as Record<string, unknown>) ?? {};
    tags = (tpl.tags as string[]) ?? [];
    note = 'テンプレートから追加';
  }

  /*
   * 呼ぶ側（取り込み）が渡した値は**テンプレートより優先**します。
   * ⚠️ `undefined` は「渡していない」で、`[]` や `{}` は「空にする」です。
   */
  if (input.tags !== undefined) tags = input.tags;
  if (input.props !== undefined) props = input.props;
  if (input.note) note = input.note;
  if (input.review_by != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.review_by)) {
    throw new ValidationError('見直し期限は YYYY-MM-DD の形で入れてください');
  }

  /*
   * データベースの行として作るなら、写した値を親の項目定義で絞る（§5-3-6・段C）。
   *
   * ⚠️ ここは**黙って落とします**（保存のときのように止めません）。値を打ったのは
   * 利用者ではなくテンプレートで、「テンプレートの3つめの項目が合いません」と言われても
   * 作った人には直しようがないからです。打った値の検査は `savePageInternal` が行います。
   */
  const parentItems = parentId ? await parentDatabaseItems(parentId) : null;
  if (parentItems) {
    props = sanitizeProps(parentItems, props as Record<string, WikiPropValue>);
  }

  const title = String(input.title ?? '').trim() || UNTITLED;
  const status = input.status === 'published' ? 'published' : 'draft';
  const pageId = newWikiPageId();

  await withTransaction(async (tx) => {
    /*
     * ⚠️ **入れる前に、スペースの行を `FOR SHARE` で押さえます。** スペースの削除
     * （`wiki-space-admin.service.ts` の `deleteSpace`）が同じ行を `FOR UPDATE` で押さえて
     * 「ページが 0 件なら消す」ので、ここで押さえないと、消えたスペースの下にページが
     * 残って誰からも辿れなくなります（#740 の Codex 指摘・P1）。
     */
    const space = await tx.queryOne(
      'SELECT id FROM wiki_spaces WHERE id = ? AND deleted_at IS NULL FOR SHARE',
      [spaceId],
    );
    if (!space) throw new NotFoundError('スペースが見つかりません');
    const sortOrder = await nextSortOrder(spaceId, parentId);
    await tx.execute(
      `INSERT INTO wiki_pages
         (id, space_id, parent_id, sort_order, title, body_md, headings, icon, status,
          props, tags, review_by, rev, owner_user_id, created_by, updated_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::date, 1, ?, ?, ?,
               CASE WHEN ? = 'published' THEN NOW() ELSE NULL END)`,
      [
        pageId, spaceId, parentId, sortOrder, title, body, headingsText(body), icon, status,
        JSON.stringify(props), tags, input.review_by ?? null, user.id, user.id, user.id, status,
      ],
    );
    await tx.execute(
      `INSERT INTO wiki_page_versions (id, page_id, rev, title, body_md, props, tags, saved_by, note)
       VALUES (?, ?, 1, ?, ?, ?::jsonb, ?, ?, ?)`,
      [`wv-${uuid().slice(0, 8)}`, pageId, title, body, JSON.stringify(props), tags, user.id, note],
    );
    /*
     * 質問との結びつけも**同じ取引の中**で行います（Codex レビュー指摘・#735）。
     * ⚠️ **取引の外に出さないこと。** 外で best-effort にすると、結びつけだけ
     * 落ちたときに**下書きは残って質問は `open` のまま**になり、画面にはその
     * 下書きを結びつけ直す手立てが無いので、押し直した人が下書きを2本作ります。
     * 中に入れておけば、落ちたときは**ページごと巻き戻る**ので、押し直しが
     * そのままきれいなやり直しになります。
     */
    if (input.gap_id) await markGapWrittenTx(tx, String(input.gap_id), pageId, user.id);
    await rebuildPageLinks(tx, pageId, body);
  });

  return selectPageRow(pageId);
}

/* ── 削除 ────────────────────────────────────────────────── */

export interface DeletePageResult {
  id: string;
  /** 一緒に消えた子ページも含む id の一覧（画面はツリーを引き直す） */
  deleted_ids: string[];
}

/**
 * 削除する（`deleted_at` を入れるだけ。行は残す）。**子ページも一緒に消します** —
 * 親だけ消すと、子がツリーのどこにも出ないまま残ります。
 *
 * ⚠️ 他の人が編集中のページは消せません（`LockError`・409）。manager は
 * 「編集を引き継ぐ」を押してから消してください — 書いている最中の本文が
 * 黙って消えるのを防ぐためです。
 */
export async function deletePage(user: WikiUser, pageId: string): Promise<DeletePageResult> {
  await assertReadablePage(user, pageId);
  const page = await pageRowOf(pageId);
  assertPageEditable(page, user.id);

  const rows = await queryAll(
    `WITH RECURSIVE sub AS (
        SELECT p.id, 0 AS depth FROM wiki_pages p WHERE p.id = ? AND p.deleted_at IS NULL
        UNION ALL
        SELECT c.id, s.depth + 1 FROM sub s
          JOIN wiki_pages c ON c.parent_id = s.id AND c.deleted_at IS NULL
         WHERE s.depth < ${MAX_DEPTH}
      )
      UPDATE wiki_pages
         SET deleted_at = NOW(), updated_by = ?, updated_at = NOW()
       WHERE id IN (SELECT id FROM sub) AND deleted_at IS NULL
      RETURNING id, status`,
    [pageId, user.id],
  );

  /*
   * 条件2（§7-3）: **公開せずに消した AI の下書きは「丸ごと不採用」**です。
   * 押した人が「これは使えない」と言った唯一の操作なので、必ず1行残します。
   * 公開してから消したものと、7日を過ぎたものは数えません（業務の整理であって
   * AI の誤りではない）— 判定は `recordWikiDraftReject` の中。
   */
  for (const r of rows) {
    await recordWikiDraftReject(String(r.id), String(r.status ?? ''), user.id);
  }
  return { id: pageId, deleted_ids: rows.map((r) => String(r.id)) };
}

/* ── 並べ替え ────────────────────────────────────────────── */

export interface MovePageResult {
  id: string;
  space_id: string;
  parent_id: string | null;
  sort_order: number;
}

/**
 * ツリーの中で動かす（親を変える・並び順を変える）。
 * **本文は触らないので履歴も `updated_at` も増やしません**（この文書の冒頭の注記）。
 */
export async function movePage(
  user: WikiUser,
  pageId: string,
  parentId: string | null,
  sortOrder?: number,
): Promise<MovePageResult> {
  await assertReadablePage(user, pageId);
  const page = await pageRowOf(pageId);
  const spaceId = String(page.space_id);
  await assertValidParent(spaceId, parentId, pageId);

  const order = Number.isFinite(sortOrder)
    ? Math.trunc(Number(sortOrder))
    : await nextSortOrder(spaceId, parentId);

  await queryOne(
    'UPDATE wiki_pages SET parent_id = ?, sort_order = ? WHERE id = ? AND deleted_at IS NULL RETURNING id',
    [parentId, order, pageId],
  );
  return { id: pageId, space_id: spaceId, parent_id: parentId, sort_order: order };
}

/* ── テンプレート ────────────────────────────────────────── */

/**
 * テンプレートの一覧（§6-③「テンプレートから作る」の選択肢）。
 * 読めるスペースのものだけ。他の人の下書きは出しません（ツリーと同じ規則）。
 */
export async function listTemplates(user: WikiUser): Promise<Row[]> {
  const spaceIds = await readableSpaceIds(user);
  if (spaceIds.length === 0) return [];
  return queryAll(
    `SELECT p.id, p.title, p.icon, p.tags, p.status, p.updated_at,
            p.space_id, s.key AS space_key, s.name AS space_name, s.color AS space_color
       FROM wiki_pages p
       JOIN wiki_spaces s ON s.id = p.space_id
      WHERE p.is_template = TRUE AND p.deleted_at IS NULL AND p.space_id = ANY(?)
        AND (p.status <> 'draft' OR p.created_by = ?)
      ORDER BY s.sort_order, p.title`,
    [spaceIds, user.id],
  );
}

/**
 * このページをテンプレートにする／やめる（§8 では manager の操作）。
 * **`updated_at` は変えません**（冒頭の注記）。
 */
export async function setPageTemplate(
  user: WikiUser,
  pageId: string,
  isTemplate: boolean,
): Promise<Row> {
  await assertReadablePage(user, pageId);
  await pageRowOf(pageId);
  await queryOne(
    'UPDATE wiki_pages SET is_template = ? WHERE id = ? AND deleted_at IS NULL RETURNING id',
    [isTemplate, pageId],
  );
  return selectPageRow(pageId);
}

/** 担当に入れる人が実在するか（外部キー違反で 500 にしない） */
/**
 * 担当に選んでよい人か。
 *
 * ⚠️ **新しく選ぶときは在籍中（`status = 'active'`）の人だけ**です（#740 の Codex 指摘・P2）。
 * 削除していないかだけを見ていたころは、停止・招待中の人を担当にでき、ログインできず
 * 見直しの通知も届かない人に仕事が付いたままになりました。いまの担当のまま保存する
 * ときは見ません（あとから停止された担当のページでも、ほかの欄の保存を断らないため）。
 */
export async function assertUserExists(userId: string, currentOwnerId: string | null = null): Promise<void> {
  if (currentOwnerId && userId === currentOwnerId) return;
  const row = await queryOne(
    "SELECT 1 AS ok FROM users WHERE id = ? AND deleted_at IS NULL AND status = 'active'",
    [userId],
  );
  if (!row) throw new ValidationError('担当に選んだ人が見つからないか、利用が止まっています。選び直してください。');
}

/** `PATCH /wiki/pages/:id` で親を変えるときも、作成・移動と同じ検査を通す */
export async function assertParentForSave(pageId: string, parentId: string | null): Promise<void> {
  const page = await pageRowOf(pageId);
  await assertValidParent(String(page.space_id), parentId, pageId);
}
