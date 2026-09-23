/**
 * ページのコメントがサーバーを呼ぶところ（段F・docs/design/v4/wiki.md §6-②）
 *
 * サーバーの正（段F で足した4本）:
 *   GET    /wiki/pages/:id/comments      そのページのコメント（返信つき・reader）
 *   POST   /wiki/pages/:id/comments      書く（`parent_id` で返信・reader）
 *   POST   /wiki/comments/:id/resolve    解決にする／戻す
 *   DELETE /wiki/comments/:id            消す（書いた本人か manager だけ）
 *
 * ⚠️ **読む人（reader）も書けます**（§8 の表）。「分からなければコメントで聞く」が
 * 現場の使い方なので、editor を持たない人にも入力欄を出します。
 *
 * ⚠️ **URL はこの1ファイルに集めます**（`client-wiki/CLAUDE.md`）。段F は
 * 「サーバー」と「画面」を同時に書いているため、`lib/wikiApi.ts` を取り合わない
 * よう分けています（段B の `pageOpsApi.ts`・段E の `askApi.ts` と同じ扱い）。
 *
 * ── 届いた形を画面まで持ち込まない ──────────────────────────
 *
 * 返信は1段だけ（`wiki_comments.parent_id`）ですが、サーバーが
 * **親に `replies` を入れて返す**か、**平らな一覧を返す**かのどちらでも
 * 描けるようにしてあります。届いた JSON を描けずに白紙にするより、
 * 受け口を広く取るほうが安全です（`askApi.ts` と同じ判断）。
 */
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { WikiComment } from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';

export const WIKI_COMMENT_URL = {
  /** 読む（`GET`）と書く（`POST`）。同じ道 */
  comments: (pageId: string) => `/wiki/pages/${pageId}/comments`,
  /** 解決にする／戻す */
  resolve: (id: string) => `/wiki/comments/${id}/resolve`,
  /** 消す（書いた本人か manager だけ） */
  comment: (id: string) => `/wiki/comments/${id}`,
} as const;

export const wikiCommentKeys = {
  list: (pageId: string) => ['wiki', 'comments', pageId] as const,
};

/**
 * 1件の長さの上限。**サーバーの `WIKI_COMMENT_MAX_CHARS` と同じ数**
 * （`server/src/contexts/wiki/services/wiki-comment.service.ts`）。
 * 超えたものは切らずに断ります — 黙って切ると、書いた指摘の後半が
 * 消えたことに誰も気づけません。
 */
export const WIKI_COMMENT_MAX_CHARS = 5_000;

/** 1本のやり取り＝最初の1件と、その返信（**返信は1段だけ**） */
export interface WikiCommentThread extends WikiComment {
  replies: WikiComment[];
}

/* ── 受け取った形を1つに直す ──────────────────────────────── */

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const asText = (v: unknown): string => (typeof v === 'string' ? v : '');

/** `id` の無い行は捨てる（押せない・消せない行を出さない） */
function toComment(v: unknown): WikiComment | null {
  const c = asRaw(v);
  const id = asText(c.id);
  if (!id) return null;
  return {
    id,
    page_id: asText(c.page_id),
    parent_id: asText(c.parent_id) || null,
    body_md: asText(c.body_md),
    created_by: asText(c.created_by),
    creator_name: asText(c.creator_name) || null,
    created_at: asText(c.created_at),
    resolved_at: asText(c.resolved_at) || null,
    resolved_by: asText(c.resolved_by) || null,
    resolver_name: asText(c.resolver_name) || null,
    // **消せるかはサーバーが決めます**（書いた本人か manager）。
    // 印が無い応答のときは画面側で見分けます（`CommentThread`）
    can_delete: typeof c.can_delete === 'boolean' ? c.can_delete : undefined,
  };
}

/** 入れ子でも平らでも受け、**同じ id は1件にまとめる**（二重に描かない） */
function flatten(data: unknown): WikiComment[] {
  const rows = Array.isArray(data) ? data : [];
  const byId = new Map<string, WikiComment>();
  const push = (c: WikiComment | null) => {
    if (c && !byId.has(c.id)) byId.set(c.id, c);
  };
  for (const row of rows) {
    const parent = toComment(row);
    push(parent);
    const nested = asRaw(row).replies;
    if (!Array.isArray(nested)) continue;
    for (const r of nested) {
      const reply = toComment(r);
      // 入れ子で届いた返信に `parent_id` が無くても、親が分かっている
      if (reply) push({ ...reply, parent_id: reply.parent_id || parent?.id || null });
    }
  }
  return [...byId.values()];
}

const byTime = (a: WikiComment, b: WikiComment): number => (
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
);

/**
 * 平らな一覧を「最初の1件＋返信」に組み直す。
 *
 * ⚠️ **行き場の無い返信を黙って捨てません。** 親が一覧に無い返信（親が消された
 * あとなど）は、そのまま1本のやり取りとして出します — 消えたように見せると、
 * 書いた人には「自分のコメントが無くなった」としか映りません。
 */
export function toThreads(data: unknown): WikiCommentThread[] {
  const flat = flatten(data);
  const ids = new Set(flat.map((c) => c.id));
  const isRoot = (c: WikiComment) => !c.parent_id || c.parent_id === c.id || !ids.has(c.parent_id);

  const threads = flat.filter(isRoot).map((c) => ({ ...c, replies: [] as WikiComment[] }));
  const byRootId = new Map(threads.map((t) => [t.id, t]));

  for (const c of flat) {
    if (byRootId.has(c.id)) continue;
    // **返信は1段だけ。** 返信への返信が届いたら、その大元に付ける
    const parentId = c.parent_id ?? '';
    const rootId = byRootId.has(parentId)
      ? parentId
      : flat.find((x) => x.id === parentId)?.parent_id ?? '';
    byRootId.get(rootId)?.replies.push(c);
  }

  threads.sort(byTime);
  for (const t of threads) t.replies.sort(byTime);
  return threads;
}

/** 解決していないやり取りの数。**タブの数字と、既定で見えている数を合わせる** */
export function openThreadCount(threads: WikiCommentThread[] | undefined): number {
  return (threads ?? []).filter((t) => !t.resolved_at).length;
}

/* ── 読み取り ─────────────────────────────────────────────── */

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

/**
 * そのページのコメント。`pageId` が無いうちは投げない。
 *
 * ⚠️ 右パネルのタブと本文の下の両方から呼びますが、**鍵が同じ**なので
 * 取りに行くのは1回です（react-query がまとめます）。
 */
export function useWikiComments(pageId: string | undefined, opts?: Opts<WikiCommentThread[]>) {
  return useQuery({
    queryKey: wikiCommentKeys.list(pageId ?? ''),
    enabled: !!pageId,
    queryFn: async ({ signal }) => {
      const res = await api.get<{ success: boolean; data: unknown }>(
        WIKI_COMMENT_URL.comments(pageId!),
        { signal },
      );
      return toThreads(res.data?.data);
    },
    ...opts,
  });
}

/* ── 書き込み ─────────────────────────────────────────────── */

/** 書く。`parentId` を渡すと返信（**1段だけ**） */
export async function postWikiComment(
  pageId: string,
  bodyMd: string,
  parentId?: string | null,
): Promise<void> {
  await api.post(WIKI_COMMENT_URL.comments(pageId), {
    body_md: bodyMd,
    parent_id: parentId ?? undefined,
  });
}

/**
 * 解決にする／戻す。**どちらにするかを送ります**（押すたびに裏返すのではなく）。
 * 2人が同時に押しても、最後に送った状態になります。
 */
export async function resolveWikiComment(id: string, resolved: boolean): Promise<void> {
  await api.post(WIKI_COMMENT_URL.resolve(id), { resolved });
}

/** 消す。サーバーが**書いた本人か manager だけ**に絞ります */
export async function deleteWikiComment(id: string): Promise<void> {
  await api.delete(WIKI_COMMENT_URL.comment(id));
}
