/**
 * Wiki — スペース（分野ごとの区分。閲覧範囲の単位）とツリー。
 * 設計: `docs/design/v4/wiki.md` §4-1・§6-①②・§8。
 *
 * ⚠️ 一覧・ツリーは必ず `readableSpaceIds` / `canReadSpace` を通します（§8）。
 */
import { queryAll, queryOne, type Row } from '../../../shared/db/connection';
import { NotFoundError } from '../../qsheet/services/httpErrors';
import { readableSpaceIds, canReadSpace, type WikiUser } from './wiki-access.service';

/**
 * 一覧に出す列。
 * - `page_count` は**公開ページだけ**数える（下書きの数を他人に見せない）
 * - `last_updated_at` は下書きも含む配下の最終更新（「最近どれだけ動いたか」の目安）
 * - `member_count` は `visibility='members'` のときだけ画面が使う
 */
const SPACE_SELECT = `
  SELECT s.id, s.key, s.name, s.description, s.icon, s.color, s.visibility,
         s.owner_user_id, ou.name AS owner_name, s.sort_order,
         s.created_at, s.updated_at,
         (SELECT COUNT(*)::int FROM wiki_pages p
           WHERE p.space_id = s.id AND p.deleted_at IS NULL AND p.status = 'published') AS page_count,
         (SELECT MAX(p.updated_at) FROM wiki_pages p
           WHERE p.space_id = s.id AND p.deleted_at IS NULL) AS last_updated_at,
         (SELECT COUNT(*)::int FROM wiki_space_members m WHERE m.space_id = s.id) AS member_count
    FROM wiki_spaces s
    LEFT JOIN users ou ON ou.id = s.owner_user_id
`;

/** 読めるスペースだけを並び順で返す（ホームのタイルと左のツリーの元） */
export async function listSpaces(user: WikiUser): Promise<Row[]> {
  const ids = await readableSpaceIds(user);
  if (ids.length === 0) return [];
  return queryAll(
    `${SPACE_SELECT} WHERE s.deleted_at IS NULL AND s.id = ANY(?)
      ORDER BY s.sort_order, s.name`,
    [ids],
  );
}

/** URL に出る短い英数字（`/wiki/s/sales`）で1件。読めなければ「無い」 */
export async function getSpaceByKey(user: WikiUser, key: string): Promise<Row> {
  const row = await queryOne(`${SPACE_SELECT} WHERE s.key = ? AND s.deleted_at IS NULL`, [key]);
  if (!row) throw new NotFoundError('スペースが見つかりません');
  if (!(await canReadSpace(user, String(row.id)))) {
    throw new NotFoundError('スペースが見つかりません');
  }
  return row;
}

/**
 * そのスペースのツリー（平らな配列。木に組むのは画面）。
 *
 * 出すのは**公開ページと自分の下書き**です（§6-①②）。
 * - 他人の下書きは出さない（書きかけが一覧に並ぶのを避ける）
 * - `archived`（一覧から隠す）は出さない。リンクをたどれば読める（`canReadPage` 参照）
 *
 * `has_children` は同じ規則で子を数えた結果です — ここを揃えないと、
 * 「開いても何も無い」折りたたみの印が出ます。
 */
export async function getSpaceTree(user: WikiUser, spaceId: string): Promise<Row[]> {
  const visible = `(p.status = 'published' OR (p.status = 'draft' AND p.created_by = ?))`;
  const visibleChild = `(c.status = 'published' OR (c.status = 'draft' AND c.created_by = ?))`;
  return queryAll(
    `SELECT p.id, p.space_id, p.parent_id, p.sort_order, p.title, p.icon, p.status, p.kind,
            EXISTS (SELECT 1 FROM wiki_pages c
                     WHERE c.parent_id = p.id AND c.deleted_at IS NULL AND ${visibleChild}) AS has_children
       FROM wiki_pages p
      WHERE p.space_id = ? AND p.deleted_at IS NULL AND ${visible}
      ORDER BY p.sort_order, p.title`,
    [user.id, spaceId, user.id],
  );
}
