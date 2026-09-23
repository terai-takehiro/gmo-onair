/**
 * Wiki — スペース管理（区画 `wiki` の manager）。
 * 設計: `docs/design/v4/wiki.md` §5-1・§8（「スペースを作る・担当と閲覧範囲を決める」は manager）。
 *
 * できること:
 *   - スペースの一覧（管理用。メンバーの人数つき）
 *   - 追加・編集（名前・説明・閲覧範囲・担当・並び順）・削除
 *   - メンバーの一覧・追加・削除（閲覧範囲が「メンバーだけ」のとき）
 *
 * ⚠️ **管理の画面でも、読めないスペースは出しません**（§8「存在ごと見えない」）。
 * manager でも `members` のスペースに入っていなければ、そのスペースは**無い**として扱います
 * （404）。ここで例外を作ると、閲覧範囲が「管理の画面を開ける人には全部見える」に変わります。
 * system_admin は `canReadSpace` がすべて通すので、どのスペースも直せます。
 *
 * ⚠️ **担当は必ず「そのスペースを読める人」にします。** 「メンバーだけ」のスペースの担当に
 * メンバー以外を据えると、その人には**見直しの通知もコメントの通知も届かず**（送る時点で
 * `canReadPage` が落とす・#735）、ページを開いても 404 になります。そこで
 *   - 担当を決めたら、その人を**メンバーにも加えます**
 *   - 担当をメンバーから外すことは断ります（先に担当を変えてもらう）
 *
 * ⚠️ **自分をメンバーから外すことも断ります**（system_admin を除く）。外した瞬間に
 * そのスペースが自分から見えなくなり、戻す手立てが無くなるためです。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row, type TxClient } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { canReadSpace, readableSpaceIds, type WikiUser } from './wiki-access.service';

export const WIKI_SPACE_VISIBILITIES = ['all', 'members'] as const;
export type WikiSpaceVisibility = (typeof WIKI_SPACE_VISIBILITIES)[number];

/*
 * ⚠️ 断るときは `ValidationError`（400）を使います。`ConflictError`（409）は
 * **保存の取り合い**専用で、画面はその code を「他の人が先に更新しました」と読むためです。
 */

/** URL に出る短い英数字（`/wiki/s/sales`）。小文字・数字・ハイフン、2〜32字 */
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;

/** 一覧（`wiki-space.service.ts` の `SPACE_SELECT` と同じ列 ＋ 下書きを含むページ数） */
const ADMIN_SELECT = `
  SELECT s.id, s.key, s.name, s.description, s.icon, s.color, s.visibility,
         s.owner_user_id, ou.name AS owner_name, s.sort_order,
         s.created_at, s.updated_at,
         (SELECT COUNT(*)::int FROM wiki_pages p
           WHERE p.space_id = s.id AND p.deleted_at IS NULL AND p.status = 'published') AS page_count,
         (SELECT COUNT(*)::int FROM wiki_pages p
           WHERE p.space_id = s.id AND p.deleted_at IS NULL) AS all_page_count,
         (SELECT MAX(p.updated_at) FROM wiki_pages p
           WHERE p.space_id = s.id AND p.deleted_at IS NULL) AS last_updated_at,
         (SELECT COUNT(*)::int FROM wiki_space_members m WHERE m.space_id = s.id) AS member_count
    FROM wiki_spaces s
    LEFT JOIN users ou ON ou.id = s.owner_user_id
`;

/** 管理用の一覧。**読めるスペースだけ**（冒頭の注記） */
export async function listSpacesForAdmin(user: WikiUser): Promise<Row[]> {
  const ids = await readableSpaceIds(user);
  if (ids.length === 0) return [];
  return queryAll(
    `${ADMIN_SELECT} WHERE s.deleted_at IS NULL AND s.id = ANY(?)
      ORDER BY s.sort_order, s.name`,
    [ids],
  );
}

/** 読めないスペースは「無い」（404）。管理の操作はすべてここを通す */
async function assertManageableSpace(user: WikiUser, spaceId: string): Promise<Row> {
  const row = await queryOne(`${ADMIN_SELECT} WHERE s.id = ? AND s.deleted_at IS NULL`, [spaceId]);
  if (!row || !(await canReadSpace(user, spaceId))) {
    throw new NotFoundError('スペースが見つかりません');
  }
  return row;
}

function cleanName(v: unknown): string {
  const name = String(v ?? '').trim();
  if (!name) throw new ValidationError('スペースの名前を入力してください。');
  if (name.length > NAME_MAX) throw new ValidationError(`スペースの名前は${NAME_MAX}字までです。`);
  return name;
}

function cleanDescription(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = String(v).trim();
  if (d.length > DESCRIPTION_MAX) throw new ValidationError(`説明は${DESCRIPTION_MAX}字までです。`);
  return d || null;
}

function cleanVisibility(v: unknown): WikiSpaceVisibility {
  const s = String(v ?? 'all');
  if (!(WIKI_SPACE_VISIBILITIES as readonly string[]).includes(s)) {
    throw new ValidationError('閲覧範囲は「全員」か「メンバーだけ」を選んでください。');
  }
  return s as WikiSpaceVisibility;
}

/**
 * Wiki を使える在籍中の利用者だけを通す条件（`u` は users）。
 *
 * ⚠️ **区画 `wiki` の権限（reader 以上）か system_admin の人だけ**です。在籍中かだけを
 * 見ていたころは、Wiki の権限が無い人も担当・メンバーに選べてしまい、見直しの通知から
 * リンクを開くと全部 403 になっていました（#740 の Codex 指摘・P2）。
 * 候補の一覧（`listAssignableUsers`）と、選んだ値の検査（`cleanActiveUser`）は同じ条件を使います。
 */
const WIKI_ELIGIBLE = `u.deleted_at IS NULL AND u.status = 'active'
  AND (u.role = 'system_admin'
       OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = u.id AND up.module = 'wiki'))`;

/**
 * 担当・メンバーに選べる人の一覧（名前の順・**上限なし**）。
 *
 * ⚠️ 画面は全体の `/users` を使いません。あちらは1回で100人までしか返さず、
 * 101人目以降が選べなかったためです（#740 の Codex 指摘・P2）。選べる人を
 * Wiki を使える人に絞るので、件数も会社の人数を超えません。
 */
export async function listAssignableUsers(): Promise<Row[]> {
  return queryAll(`SELECT u.id, u.name FROM users u WHERE ${WIKI_ELIGIBLE} ORDER BY u.name, u.id`);
}

/**
 * Wiki を使える在籍中の利用者か（`WIKI_ELIGIBLE`）。空は null（「担当なし」など）。
 * `what` は断るときの文言に入れる（「担当に選んだ人」「追加する人」）— 担当の文言を
 * メンバーの追加で使い回すと、何を断られたのかが読めなくなる。
 */
async function cleanActiveUser(v: unknown, what: string): Promise<string | null> {
  if (v === null || v === undefined || v === '') return null;
  const id = String(v);
  const row = await queryOne(`SELECT u.id FROM users u WHERE u.id = ? AND ${WIKI_ELIGIBLE}`, [id]);
  if (!row) {
    throw new ValidationError(`${what}が見つからないか、Wiki を使える権限がありません。選び直してください。`);
  }
  return id;
}

const cleanOwner = (v: unknown) => cleanActiveUser(v, '担当に選んだ人');

/** 一意の制約に当たったか（同じ key を2人が同時に追加したとき） */
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === '23505';
}

/** メンバーに加える（既にいれば何もしない） */
async function addMemberTx(tx: TxClient, spaceId: string, userId: string): Promise<void> {
  await tx.execute(
    'INSERT INTO wiki_space_members (space_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
    [spaceId, userId],
  );
}

export interface CreateSpaceInput {
  key: unknown;
  name: unknown;
  description?: unknown;
  visibility?: unknown;
  owner_user_id?: unknown;
}

/**
 * スペースを追加する。
 *
 * ⚠️ `key` は**あとから変えられません**（`/wiki/s/:key` の URL と、貼られたリンクが切れるため）。
 * 使い終わったスペースの `key` も**使い回せません** — 表の一意の制約は削除済みの行にも効くので、
 * 同じ `key` の古いリンクが別のスペースを指さないようにそのままにしています。
 *
 * 「メンバーだけ」で作るときは、**作った人と担当をメンバーに加えます**（作った瞬間に
 * 自分から見えなくなるのを防ぐ）。
 */
export async function createSpace(user: WikiUser, input: CreateSpaceInput): Promise<Row> {
  const key = String(input.key ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    throw new ValidationError('URL に使う名前は、半角の小文字・数字・ハイフンで2〜32字にしてください（先頭は英数字）。');
  }
  const name = cleanName(input.name);
  const description = cleanDescription(input.description);
  const visibility = cleanVisibility(input.visibility);
  const owner = await cleanOwner(input.owner_user_id);

  const taken = await queryOne('SELECT id FROM wiki_spaces WHERE key = ?', [key]);
  if (taken) throw new ValidationError(`「${key}」はすでに使われています。別の名前にしてください。`);

  const id = `wsp_${uuid().replace(/-/g, '').slice(0, 10)}`;
  // ⚠️ 上の確認と下の INSERT の間に同じ key が入ると一意の制約に当たる。
  //    そのまま投げると 500 になるので、上と同じ 400 に言い換える
  await withTransaction(async (tx) => {
    const next = await tx.queryOne(
      'SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM wiki_spaces WHERE deleted_at IS NULL',
    );
    await tx.execute(
      `INSERT INTO wiki_spaces (id, key, name, description, visibility, owner_user_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, key, name, description, visibility, owner, Number(next?.n ?? 10)],
    );
    if (visibility === 'members') {
      await addMemberTx(tx, id, user.id);
      if (owner) await addMemberTx(tx, id, owner);
    }
  }).catch((e: unknown) => {
    if (isUniqueViolation(e)) throw new ValidationError(`「${key}」はすでに使われています。別の名前にしてください。`);
    throw e;
  });
  return (await queryOne(`${ADMIN_SELECT} WHERE s.id = ?`, [id]))!;
}

export interface UpdateSpaceInput {
  name?: unknown;
  description?: unknown;
  visibility?: unknown;
  owner_user_id?: unknown;
  sort_order?: unknown;
}

/**
 * スペースを編集する。**渡した項目だけ**が変わります（`key` は変えられません）。
 *
 * 「メンバーだけ」に切り替えたとき・担当を変えたときは、**編集した人と担当を
 * メンバーに加えます**（冒頭の注記。切り替えた瞬間に担当や自分が締め出されるのを防ぐ）。
 * 「全員」に戻しても**メンバーの行は消しません** — もう一度「メンバーだけ」にしたとき、
 * 前の顔ぶれがそのまま戻るほうが事故が少ないためです。
 */
export async function updateSpace(user: WikiUser, spaceId: string, input: UpdateSpaceInput): Promise<Row> {
  const current = await assertManageableSpace(user, spaceId);
  const has = (k: keyof UpdateSpaceInput) => Object.prototype.hasOwnProperty.call(input, k);

  const name = has('name') ? cleanName(input.name) : String(current.name);
  const description = has('description') ? cleanDescription(input.description) : (current.description as string | null);
  const visibility = has('visibility') ? cleanVisibility(input.visibility) : (current.visibility as WikiSpaceVisibility);
  /*
   * ⚠️ **担当が変わらないときは検査しません。** 画面は保存のたびに担当も送るので、
   * 担当があとで Wiki の権限を外された・退職したスペースでは、名前を直すだけの保存まで
   * 断られてしまいます。検査するのは、新しく選び直したときだけです。
   */
  const currentOwner = (current.owner_user_id as string | null) ?? null;
  const ownerChanged = has('owner_user_id') && String(input.owner_user_id ?? '') !== String(currentOwner ?? '');
  const owner = ownerChanged ? await cleanOwner(input.owner_user_id) : currentOwner;
  let sortOrder = Number(current.sort_order ?? 0);
  if (has('sort_order')) {
    const n = Number(input.sort_order);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new ValidationError('並び順は0以上の整数で入れてください。');
    sortOrder = n;
  }

  await withTransaction(async (tx) => {
    await tx.execute(
      `UPDATE wiki_spaces
          SET name = ?, description = ?, visibility = ?, owner_user_id = ?, sort_order = ?, updated_at = NOW()
        WHERE id = ?`,
      [name, description, visibility, owner, sortOrder, spaceId],
    );
    if (visibility === 'members') {
      await addMemberTx(tx, spaceId, user.id);
      if (owner) await addMemberTx(tx, spaceId, owner);
    }
  });
  return (await queryOne(`${ADMIN_SELECT} WHERE s.id = ?`, [spaceId]))!;
}

/**
 * スペースを削除する（`deleted_at` を入れるだけ）。
 *
 * ⚠️ **ページが1本でも残っていれば断ります**（下書きを含む）。スペースごと消すと、
 * 中のページはどのスペースからも辿れなくなり、**書き出しにも出てこなくなります**。
 * 先にページを別のスペースへ移すか削除してもらいます。
 */
export async function deleteSpace(user: WikiUser, spaceId: string): Promise<Row> {
  await assertManageableSpace(user, spaceId);
  /*
   * ⚠️ **数える・消すは、スペースの行を `FOR UPDATE` で押さえた取引の中で行います。**
   * 押さえずに「数えて 0 なら消す」だと、その間に別の人が作ったページが
   * **消えたスペースの下に残り**、一覧・検索・書き出しのどこからも辿れなくなりました
   * （#740 の Codex 指摘・P1）。ページを作る側（`wiki-write.service.ts` の `createPage`）は
   * 同じ行を `FOR SHARE` で押さえるので、どちらかが必ず待ちます:
   *   - 削除が先 → 作る側は待ったあと「スペースが見つかりません」
   *   - 作るのが先 → 削除は待ったあと、そのページを数えて断る
   */
  await withTransaction(async (tx) => {
    const locked = await tx.queryOne(
      'SELECT id FROM wiki_spaces WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [spaceId],
    );
    if (!locked) throw new NotFoundError('スペースが見つかりません');
    const counted = await tx.queryOne(
      'SELECT COUNT(*)::int AS n FROM wiki_pages WHERE space_id = ? AND deleted_at IS NULL',
      [spaceId],
    );
    const pages = Number(counted?.n ?? 0);
    if (pages > 0) {
      throw new ValidationError(
        `このスペースにはページが${pages}件あります。ページを別のスペースへ移すか削除してから、もう一度お試しください。`,
      );
    }
    await tx.execute('UPDATE wiki_spaces SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?', [spaceId]);
  });
  return { id: spaceId, deleted: true };
}

/** メンバーの一覧（名前の順） */
export async function listSpaceMembers(user: WikiUser, spaceId: string): Promise<Row[]> {
  await assertManageableSpace(user, spaceId);
  return queryAll(
    `SELECT m.user_id, u.name
       FROM wiki_space_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.space_id = ?
      ORDER BY u.name`,
    [spaceId],
  );
}

/** メンバーに加える（既にいれば何もしない） */
export async function addSpaceMember(user: WikiUser, spaceId: string, userId: string): Promise<Row[]> {
  await assertManageableSpace(user, spaceId);
  const target = await cleanActiveUser(userId, '追加する人');
  if (!target) throw new ValidationError('追加する人を選んでください。');
  await execute(
    'INSERT INTO wiki_space_members (space_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
    [spaceId, target],
  );
  return listSpaceMembers(user, spaceId);
}

/**
 * メンバーから外す。
 *
 * ⚠️ 断るのは2つ（冒頭の注記）:
 *   - **そのスペースの担当**（外すと見直しの通知が届かなくなる）
 *   - **自分**（外した瞬間にこのスペースが見えなくなり、戻せなくなる。system_admin は除く）
 */
export async function removeSpaceMember(user: WikiUser, spaceId: string, userId: string): Promise<Row[]> {
  const space = await assertManageableSpace(user, spaceId);
  if (space.visibility === 'members' && space.owner_user_id === userId) {
    throw new ValidationError('担当はメンバーから外せません。先に担当を別の人に変えてください。');
  }
  if (space.visibility === 'members' && userId === user.id && user.role !== 'system_admin') {
    throw new ValidationError('自分をメンバーから外すと、このスペースが見えなくなります。別の管理者に依頼してください。');
  }
  await execute('DELETE FROM wiki_space_members WHERE space_id = ? AND user_id = ?', [spaceId, userId]);
  return listSpaceMembers(user, spaceId);
}
