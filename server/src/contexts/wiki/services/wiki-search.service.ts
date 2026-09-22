/**
 * Wiki — 検索（`docs/design/v4/wiki.md` §5-4・§6-④・§10 の判断6）。
 *
 * **拡張を1本も入れずに始めます**（判断6）。`title` / `headings` / `body_md` に `ILIKE` を当て、
 * **点数付けは Node 側**（`wiki-search-score.ts`。重みを直すたびに migration が要らない）。
 * 遅くなったら `pg_trgm` の GIN 索引を足します。
 *
 * ⚠️ **読めないスペースのページは検索にも出しません**（§8「存在ごと見えない」）。
 * **下書きも出しません**（§7-5）。出すのは `status='published'` だけで、
 * 一覧から隠した `archived` もここには出ません（リンクをたどれば読めます）。
 *
 * ⚠️ **点数は `shared/src/wiki/search.ts` と同じ答えを出すこと。**
 * 突き合わせは `shared/tests/wikiSearchParity.test.ts` が固定しています。
 */
import { queryAll } from '../../../shared/db/connection';
import { readableSpaceIds, type WikiUser } from './wiki-access.service';
import { pathLabels } from './wiki-path.service';
import {
  splitTerms,
  scorePage,
  makeExcerpt,
  matchedHeading,
  compareHits,
  type WikiSearchHit,
} from '../wiki-search-score';

/**
 * 点数を付ける前に DB から取る上限。
 *
 * ⚠️ **本文ごと持ってくる**（点数と抜粋に要る）ので、無制限にすると
 * 1回の検索で何十 MB も読みます。**更新の新しい順に**この数だけ見ます。
 * 当たりがこれを超えるほど広い語（「の」など）では、古いページが漏れます——
 * 画面は語を足して絞り込めますし、そこまで広い語は結果を読んでも探せません。
 */
const CANDIDATE_LIMIT = 300;

/** 画面に返す既定と上限（`limit` はここで丸める） */
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface WikiSearchInput {
  q: string;
  spaceId?: string;
  tags?: string[];
  ownerId?: string;
  /** 何日以内に更新されたもの。未指定は全部 */
  updatedWithinDays?: number;
  limit?: number;
}

/**
 * `ILIKE` に渡す語。**`%` `_` `\` を必ず打ち消します** —
 * 打ち消さないと `50%` が「何でも1件以上」の意味になり、全ページが当たります。
 * SQL 側は `ESCAPE '\'` を付けて呼びます。
 */
export function likeTerm(term: string): string {
  return `%${term.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`)}%`;
}

/** 検索結果に出す列。**本文（body_md）も取る** — 抜粋と点数に要る */
const SEARCH_SELECT = `
  SELECT p.id, p.title, p.headings, p.body_md, p.space_id,
         s.name AS space_name, s.color AS space_color,
         p.owner_user_id, ou.name AS owner_name, p.updated_at
    FROM wiki_pages p
    JOIN wiki_spaces s ON s.id = p.space_id
    LEFT JOIN users ou ON ou.id = p.owner_user_id
`;

/**
 * 検索する（`GET /wiki/search`）。
 *
 * 語が無ければ**問い合わせずに空**を返します（画面は空欄でも開けるため）。
 * 2語以上は AND で、SQL でも Node の点数でも同じように AND にしています
 * （SQL 側で先に落とすのは、本文を読む行を減らすためです）。
 */
/**
 * スペースごとの当たりの数。**上限で切る前**の数です。
 *
 * ⚠️ 画面の `shared/src/wiki/types.ts` の同名の型とそろえること
 * （サーバーは `shared/` を import できないので、この型だけ写しています）。
 */
export interface WikiSearchSpaceCount {
  space_id: string;
  count: number;
}

export interface WikiSearchResult {
  hits: WikiSearchHit[];
  counts: WikiSearchSpaceCount[];
}

export async function searchPages(
  user: WikiUser,
  input: WikiSearchInput,
): Promise<WikiSearchResult> {
  const empty: WikiSearchResult = { hits: [], counts: [] };
  const terms = splitTerms(String(input.q ?? ''));
  if (terms.length === 0) return empty;

  const spaceIds = await readableSpaceIds(user);
  if (spaceIds.length === 0) return empty;

  /*
   * ⚠️ **スペースの絞り込みは SQL で当てます**（上限で切る前）。
   * 画面で当て直していたころは、当たりが上限（50件）を超えると
   * 下位のスペースのページが**そもそも届かず**、絞り込んでも出ませんでした。
   * 件数は下の別の問い合わせで**スペースの絞り込みを外して**数えます
   * （絞り込みの列に「0件」と出すためではなく、選べるようにするため）。
   */
  const where: string[] = [
    'p.deleted_at IS NULL',
    // 下書きは検索に出さない（§7-5）。archived も一覧には出さない
    `p.status = 'published'`,
    'p.space_id = ANY(?)',
  ];
  const params: unknown[] = [spaceIds];

  if (input.tags && input.tags.length > 0) {
    // ⚠️ `@>`（選んだタグを**すべて**持つ）。絞り込みは「絞る」向きに揃える
    where.push('p.tags @> ?::text[]');
    params.push(input.tags);
  }
  if (input.ownerId) {
    where.push('p.owner_user_id = ?');
    params.push(input.ownerId);
  }
  if (input.updatedWithinDays && input.updatedWithinDays > 0) {
    where.push(`p.updated_at > NOW() - (?::int * INTERVAL '1 day')`);
    params.push(Math.floor(input.updatedWithinDays));
  }
  for (const term of terms) {
    where.push(
      `(p.title ILIKE ? ESCAPE '\\' OR p.headings ILIKE ? ESCAPE '\\' OR p.body_md ILIKE ? ESCAPE '\\')`,
    );
    const like = likeTerm(term);
    params.push(like, like, like);
  }

  /*
   * 件数はスペースの絞り込みを**外した**条件で数えます（本文は取らないので軽い）。
   * SQL の当たり（`ILIKE` の AND）と点数 > 0 は同じ集合なので、この数がそのまま
   * 絞り込みの列に出せます。**上限で切る前の数**です。
   */
  const countRows = await queryAll(
    `SELECT p.space_id, COUNT(*)::int AS n
       FROM wiki_pages p
      WHERE ${where.join(' AND ')}
      GROUP BY p.space_id`,
    params,
  );
  const counts = countRows.map((r) => ({
    space_id: String(r.space_id),
    count: Number(r.n) || 0,
  }));

  const hitWhere = [...where];
  const hitParams = [...params];
  if (input.spaceId) {
    hitWhere.push('p.space_id = ?');
    hitParams.push(input.spaceId);
  }

  const rows = await queryAll(
    `${SEARCH_SELECT} WHERE ${hitWhere.join(' AND ')}
      ORDER BY p.updated_at DESC
      LIMIT ${CANDIDATE_LIMIT}`,
    hitParams,
  );

  const limit = Math.min(Math.max(Number(input.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const scored = rows
    .map((r) => {
      const body = String(r.body_md ?? '');
      return {
        id: String(r.id),
        title: String(r.title ?? ''),
        space_id: String(r.space_id),
        space_name: String(r.space_name ?? ''),
        space_color: (r.space_color as string | null) ?? null,
        path: '',
        heading: matchedHeading(body, terms),
        excerpt: makeExcerpt(body, terms),
        updated_at: new Date(r.updated_at as string).toISOString(),
        owner_name: (r.owner_name as string | null) ?? null,
        score: scorePage(
          {
            title: String(r.title ?? ''),
            headings: String(r.headings ?? ''),
            body_md: body,
            updated_at: String(r.updated_at),
          },
          terms,
        ),
      } satisfies WikiSearchHit;
    })
    .filter((h) => h.score > 0)
    .sort(compareHits)
    .slice(0, limit);

  // 道（スペース ＞ 親 ＞ …）は**画面に出す分だけ**引く（1行ずつ引くと N+1 になる）
  const paths = await pathLabels(scored.map((h) => h.id));
  return {
    hits: scored.map((h) => ({ ...h, path: paths.get(h.id) ?? h.space_name })),
    counts,
  };
}
