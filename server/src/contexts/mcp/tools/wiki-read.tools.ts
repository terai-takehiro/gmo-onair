/**
 * Wiki の MCP ツール — **読む4本の中身**（段E・設計 `docs/design/v4/wiki.md` §7-6）。
 *
 * ツールの名前・説明文・引数の形は `wiki.tools.ts` にあります。1ファイル 400 行の決まりで
 * 中身だけをこちらに出していますが、**`server.registerTool(...)` をこちらへ移しては
 * いけません** — `scripts/generate-mcp-tools.mjs` は `*.tools.ts` のファイル名で
 * カテゴリを切るので、移すと画面の「MCP コネクタ」に Wiki が2つ並び、
 * 表に無いキー（`wiki-read`）がそのまま利用者に出ます。登録が1件も無いあいだは、
 * このファイルは走査から外れます。
 *
 * ⚠️ **閲覧できる範囲は画面とまったく同じ**です。4本とも `contexts/wiki/services/` の
 * 読み取りを通し、そこが `wiki-access.service` で絞ります。読めないページは
 * 403 ではなく **404**（存在ごと隠す・§8）。下書き・`members` のスペースは
 * 検索にも AI の出典にも出ません（§7-5）。
 */
import { queryAll } from '../../../shared/db/connection';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { searchPages } from '../../wiki/services/wiki-search.service';
import { getPageMarkdown } from '../../wiki/services/wiki-md.service';
import { getSpaceTree, listSpaces } from '../../wiki/services/wiki-space.service';
import { listRows } from '../../wiki/services/wiki-row.service';
import { findView } from '../../wiki/services/wiki-database.service';
import { applyView } from '../../wiki/services/wiki-view-apply';
import type { WikiView, WikiViewFilter } from '../../wiki/services/wiki-database-schema';
import { clampLimit, ok, type ToolResult } from '../helpers';
import { requireWikiActor, resolveSpaceId, assertPublishedForStaticKey } from './wiki.access';

/** ツリーで一度に返す行の上限（超えたら `truncated` を付けて知らせる） */
const MAX_TREE = 500;

/** 行の本文の先頭を何文字まで返すか（§7-6「値と本文の先頭」） */
const BODY_HEAD = 200;

/** 本文の先頭を1行にして返す。切ったときだけ `…` を付ける */
function bodyHead(md: unknown): string {
  const text = String(md ?? '').replace(/\s+/g, ' ').trim();
  return text.length > BODY_HEAD ? `${text.slice(0, BODY_HEAD)}…` : text;
}

/**
 * 絞り込みの項目を **id でも名前でも**受ける。
 * 外の AI が知っているのはたいてい列の名前で、id（`wi-…`）ではないためです。
 */
function resolveFilters(
  raw: Array<{ item: string; op: string; value?: unknown }>,
  items: Array<{ id: string; name: string }>,
): WikiViewFilter[] {
  return raw.map((f) => {
    const hit = items.find((i) => i.id === f.item)
      ?? items.find((i) => i.name === f.item)
      ?? items.find((i) => i.name.toLowerCase() === String(f.item).toLowerCase());
    if (!hit) {
      throw new ValidationError(
        `「${f.item}」という項目はこのデータベースにありません。項目の一覧は items で返しています。`,
      );
    }
    return { itemId: hit.id, op: f.op, value: f.value } as WikiViewFilter;
  });
}

export interface SearchWikiArgs {
  q: string;
  space?: string;
  tags?: string[];
  owner_user_id?: string;
  updated_within_days?: number;
  limit?: number;
}

/** `search_wiki` の中身 */
export async function searchWiki(args: SearchWikiArgs): Promise<ToolResult> {
  const user = await requireWikiActor();
  const spaceId = args.space ? await resolveSpaceId(user, args.space) : undefined;
  const { hits, counts } = await searchPages(user, {
    q: args.q,
    spaceId,
    tags: args.tags,
    ownerId: args.owner_user_id,
    updatedWithinDays: args.updated_within_days,
    limit: clampLimit(args.limit),
  });
  /*
   * `counts` は**上限で切る前**のスペースごとの当たりの数で、
   * **スペースの絞り込みを外して**数えてあります（`wiki-search.service` の注意書き）。
   * だから `space` を渡されたときはその1つだけを見ます —
   * 全部を足すと「絞ったのに件数が増えた」と映り、AI が絞り直しを諦めます。
   */
  const total = spaceId
    ? (counts.find((c) => c.space_id === spaceId)?.count ?? hits.length)
    : counts.reduce((sum, c) => sum + c.count, 0);
  return ok({
    total,
    shown: hits.length,
    truncated: total > hits.length,
    results: hits.map((h) => ({
      id: h.id,
      title: h.title,
      path: h.path,
      space_id: h.space_id,
      space_name: h.space_name,
      heading: h.heading,
      excerpt: h.excerpt,
      owner_name: h.owner_name,
      updated_at: h.updated_at,
    })),
  });
}

/** `get_wiki_page` の中身 */
export async function getWikiPage(args: { page_id: string }): Promise<ToolResult> {
  const user = await requireWikiActor();
  // 静的キーでは公開ページだけ（`assertPublishedForStaticKey` の注記）
  await assertPublishedForStaticKey(user, args.page_id);
  const md = await getPageMarkdown(user, args.page_id);
  return ok({
    id: args.page_id,
    file_name: md.fileName,
    updated_at: md.updated_at,
    markdown: md.markdown,
  });
}

/** `list_wiki_pages` の中身 */
export async function listWikiPages(args: { space?: string }): Promise<ToolResult> {
  const user = await requireWikiActor();
  if (!args.space) {
    const spaces = await listSpaces(user);
    return ok({
      spaces: spaces.map((s) => ({
        id: s.id, key: s.key, name: s.name, description: s.description,
        visibility: s.visibility, owner_name: s.owner_name, page_count: s.page_count,
      })),
    });
  }
  const spaceId = await resolveSpaceId(user, args.space);
  const tree = await getSpaceTree(user, spaceId);
  const shown = tree.slice(0, MAX_TREE);
  /*
   * 更新日はツリーの問い合わせに入っていないので**1回だけまとめて**引く
   * （1行ずつ引くと N+1 になる）。ここで id を足しているだけなので、
   * 見える・見えないの判定はツリー側のまま変わらない。
   */
  const stamps = new Map<string, string>();
  if (shown.length > 0) {
    const rows = await queryAll(
      'SELECT id, updated_at FROM wiki_pages WHERE id = ANY(?)',
      [shown.map((p) => String(p.id))],
    );
    for (const r of rows) stamps.set(String(r.id), new Date(r.updated_at as string).toISOString());
  }
  return ok({
    space_id: spaceId,
    total: shown.length,
    truncated: tree.length > MAX_TREE,
    pages: shown.map((p) => ({
      id: String(p.id),
      title: String(p.title ?? ''),
      parent_id: (p.parent_id as string | null) ?? null,
      kind: String(p.kind),
      status: String(p.status),
      has_children: !!p.has_children,
      updated_at: stamps.get(String(p.id)) ?? null,
    })),
  });
}

export interface QueryWikiDatabaseArgs {
  page_id: string;
  view?: string;
  filters?: Array<{ item: string; op: string; value?: string | number | boolean | string[] }>;
  limit?: number;
}

/** `query_wiki_database` の中身 */
export async function queryWikiDatabase(args: QueryWikiDatabaseArgs): Promise<ToolResult> {
  const user = await requireWikiActor();
  /*
   * ⚠️ **データベースの口も同じ**（`get_wiki_page` の注記）。`listRows` は
   * `assertDatabasePage` → `canReadPage` を通るだけなので、静的キーでも
   * **一覧から隠した（`archived`）台帳の行**が id さえ分かれば取れてしまいます。
   * Codex の指摘は `get_wiki_page` の1本だけでしたが、**同じ穴が2つ**ありました。
   */
  await assertPublishedForStaticKey(user, args.page_id);
  const { items, views, view_id, rows, truncated } = await listRows(user, args.page_id, args.view);
  let hits = rows;
  if (args.filters && args.filters.length > 0) {
    // ビューの並べ替えを引き継ぐ（引き継がないと、絞った瞬間に並びが既定へ戻る）
    const applied: WikiView = {
      id: 'mcp', name: '絞り込み', type: 'table',
      filters: resolveFilters(args.filters, items),
      sorts: findView(views, view_id ?? undefined)?.sorts,
    };
    hits = applyView(rows, applied, items);
  }
  const limit = clampLimit(args.limit, 50);
  const shown = hits.slice(0, limit);
  const bodies = new Map<string, string>();
  if (shown.length > 0) {
    const raw = await queryAll(
      'SELECT id, body_md FROM wiki_pages WHERE id = ANY(?)',
      [shown.map((r) => r.id)],
    );
    for (const r of raw) bodies.set(String(r.id), bodyHead(r.body_md));
  }
  return ok({
    page_id: args.page_id,
    view_id,
    items: items.map((i) => ({ id: i.id, name: i.name, type: i.type, options: i.options })),
    views: views.map((v) => ({ id: v.id, name: v.name, type: v.type })),
    total: hits.length,
    truncated: truncated || hits.length > limit,
    rows: shown.map((r) => ({
      id: r.id, title: r.title, status: r.status, props: r.props,
      body_head: bodies.get(r.id) ?? '', updated_at: r.updated_at,
    })),
  });
}
