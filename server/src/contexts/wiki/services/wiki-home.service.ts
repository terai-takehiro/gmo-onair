/**
 * Wiki — ホーム（`/wiki`）に出すものをまとめて返す。
 * 設計: `docs/design/v4/wiki.md` §6-①。
 *
 * 画面が4本の API を別々に叩くと、開くたびに4往復になります。
 * ホームは**必ず全部を一度に出す**画面なので、1本にまとめています
 * （財務ダッシュボードで「1回の絞り込みで6本」が詰まりの原因になった前例があるため）。
 */
import { queryAll, type Row } from '../../../shared/db/connection';
import { jstDate } from '../../../shared/utils/jst';
import { readableSpaceIds, type WikiUser } from './wiki-access.service';
import { listSpaces } from './wiki-space.service';
import { pathLabels } from './wiki-path.service';

/** 最近更新・お気に入りの1行（本文は持たない。軽くする） */
const CARD_SELECT = `
  SELECT p.id, p.title, p.icon, p.status, p.kind,
         p.space_id, s.name AS space_name, s.key AS space_key, s.color AS space_color,
         p.updated_at, p.updated_by, uu.name AS updater_name
    FROM wiki_pages p
    JOIN wiki_spaces s ON s.id = p.space_id
    LEFT JOIN users uu ON uu.id = p.updated_by
`;

export interface WikiHome {
  spaces: Row[];
  recent: Row[];
  favorites: Row[];
  /** 自分が担当で見直し予定日を過ぎている公開ページ。0件なら画面に出さない（§6-①） */
  overdue: Row[];
}

export async function getHome(user: WikiUser): Promise<WikiHome> {
  const spaceIds = await readableSpaceIds(user);
  if (spaceIds.length === 0) {
    return { spaces: [], recent: [], favorites: [], overdue: [] };
  }
  const today = jstDate();

  const [spaces, recent, favorites, overdueRows] = await Promise.all([
    listSpaces(user),
    queryAll(
      `${CARD_SELECT}
        WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.space_id = ANY(?)
        ORDER BY p.updated_at DESC
        LIMIT 10`,
      [spaceIds],
    ),
    queryAll(
      `${CARD_SELECT}
        JOIN wiki_favorites f ON f.page_id = p.id AND f.user_id = ?
        WHERE p.deleted_at IS NULL AND p.space_id = ANY(?) AND p.status <> 'archived'
        ORDER BY f.created_at DESC
        LIMIT 20`,
      [user.id, spaceIds],
    ),
    queryAll(
      `SELECT p.id, p.title, p.space_id, s.name AS space_name,
              p.owner_user_id, ou.name AS owner_name,
              p.review_by::text AS review_by, p.updated_at
         FROM wiki_pages p
         JOIN wiki_spaces s ON s.id = p.space_id
         LEFT JOIN users ou ON ou.id = p.owner_user_id
        WHERE p.deleted_at IS NULL AND p.status = 'published'
          AND p.space_id = ANY(?)
          AND p.owner_user_id = ?
          AND p.review_by IS NOT NULL AND p.review_by < ?::date
        ORDER BY p.review_by
        LIMIT 50`,
      // 「今日」はサーバーの時計ではなく日本時間で決める（`jstDate`。UTC のコンテナで
      // 動いているので `CURRENT_DATE` だと日本の朝9時までが前日扱いになる）
      [spaceIds, user.id, today],
    ),
  ]);

  // 見直しの一覧は「どこにあるページか」が分からないと直しに行けないので道を付ける
  const paths = await pathLabels(overdueRows.map((r) => String(r.id)));
  const overdue = overdueRows.map((r) => ({
    ...r,
    path: paths.get(String(r.id)) ?? String(r.space_name ?? ''),
    bucket: 'overdue' as const,
  }));

  return { spaces, recent, favorites, overdue };
}
