/**
 * Wiki — ページの居場所（パンくずと「スペース ＞ 親 ＞ …」の道）。
 *
 * ページ詳細（§6-②）・見直しの一覧（§6-⑦）・検索結果（§6-④）が同じ形を出すので、
 * 1か所にまとめています。親をたどるのは再帰 CTE で、**深さの上限（20）を必ず付けます** —
 * 親子の取り違え（自分が自分の先祖）で無限に回るのを、DB の側で止めるためです。
 */
import { queryAll } from '../../../shared/db/connection';

/** パンくず・道の区切り。画面もこの形で出す（`docs/design/v4/wiki.md` §6-②） */
export const WIKI_PATH_SEPARATOR = ' ＞ ';

const MAX_DEPTH = 20;

/** 先祖をまとめて引く。`leaf` は問い合わせたページ、`depth` は 0=自分・1=親 … */
async function ancestorRows(pageIds: string[]) {
  if (pageIds.length === 0) return [];
  return queryAll(
    `WITH RECURSIVE anc AS (
        SELECT p.id AS leaf, p.id, p.parent_id, p.title, p.space_id, 0 AS depth
          FROM wiki_pages p
         WHERE p.id = ANY(?) AND p.deleted_at IS NULL
        UNION ALL
        SELECT a.leaf, q.id, q.parent_id, q.title, q.space_id, a.depth + 1
          FROM anc a
          JOIN wiki_pages q ON q.id = a.parent_id AND q.deleted_at IS NULL
         WHERE a.depth < ${MAX_DEPTH}
      )
      SELECT a.leaf, a.depth, a.id, a.title, s.name AS space_name
        FROM anc a
        JOIN wiki_spaces s ON s.id = a.space_id
       ORDER BY a.leaf, a.depth DESC`,
    [pageIds],
  );
}

/**
 * パンくず（スペース直下から**自分の親まで**）。自分自身は入れません
 * — 画面は見出しに自分の題を別で出すためです。
 */
export async function breadcrumbOf(pageId: string): Promise<Array<{ id: string; title: string }>> {
  const rows = await ancestorRows([pageId]);
  return rows
    .filter((r) => Number(r.depth) > 0)
    .map((r) => ({ id: String(r.id), title: String(r.title) }));
}

/**
 * 複数ページの「スペース ＞ 親 ＞ …」を一度に作る（id → 道）。
 * 一覧で1行ずつ引くと N+1 になるので、まとめて1本の SQL にしています。
 */
export async function pathLabels(pageIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const rows = await ancestorRows(pageIds);
  const parts = new Map<string, { space: string; titles: string[] }>();
  for (const r of rows) {
    const leaf = String(r.leaf);
    const bucket = parts.get(leaf) ?? { space: String(r.space_name ?? ''), titles: [] };
    // depth 降順で届くので、先祖（根に近い側）から順に積まれる。自分自身（0）は道に入れない
    if (Number(r.depth) > 0) bucket.titles.push(String(r.title));
    bucket.space = String(r.space_name ?? bucket.space);
    parts.set(leaf, bucket);
  }
  for (const [leaf, { space, titles }] of parts) {
    out.set(leaf, [space, ...titles].filter(Boolean).join(WIKI_PATH_SEPARATOR));
  }
  return out;
}
