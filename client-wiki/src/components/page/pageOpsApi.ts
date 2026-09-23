/**
 * ツリーとページの操作がサーバーを呼ぶところ（段B・書き込み）
 *
 * ⚠️ **本来は `lib/wikiApi.ts` の `WIKI_URL` に並べます**（`client-wiki/CLAUDE.md`）。
 * 段B は「サーバー」「編集画面」「ツリーとページの操作」を同時に書いているため、
 * 同じファイルを3人で取り合わないよう、ここに分けています
 * （`hooks/wikiEditApi.ts` と同じ扱い）。**段B の検査でまとめて `WIKI_URL` へ移します。**
 *
 * サーバーの正は `server/src/contexts/wiki/routes/pages-write.routes.ts`:
 *   POST   /wiki/pages                       追加（テンプレートから写せる・editor）
 *   PATCH  /wiki/pages/:id                   保存（情報の欄だけなら編集中でも通る・editor）
 *   PATCH  /wiki/pages/:id/move              ツリーの中で動かす（editor）
 *   DELETE /wiki/pages/:id                   削除（子ページも一緒に・manager）
 *   GET    /wiki/templates                   テンプレートの一覧（editor）
 *   POST   /wiki/pages/:id/make-template     テンプレートにする／やめる（manager）
 *
 * 段D で足した1本（`routes/search.routes.ts`）:
 *   POST   /wiki/pages/:id/favorite          お気に入りに入れる（reader）
 *   DELETE /wiki/pages/:id/favorite          お気に入りから外す（reader）
 *
 * 応答はこの製品の作法どおり `{ success: true, data: … }` で包まれています
 * （`.md` と zip だけは中身そのものなので `lib/wikiExportApi.ts` に分けてあります）。
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { WikiPage, WikiPageStatus } from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';
import { wikiKeys } from '@/lib/wikiApi';

export const WIKI_OPS_URL = {
  pages: '/wiki/pages',
  page: (id: string) => `/wiki/pages/${id}`,
  move: (id: string) => `/wiki/pages/${id}/move`,
  templates: '/wiki/templates',
  makeTemplate: (id: string) => `/wiki/pages/${id}/make-template`,
  /** お気に入り（`POST` で入れる・`DELETE` で外す。人ごとの印） */
  favorite: (id: string) => `/wiki/pages/${id}/favorite`,
  /** 人の一覧（`server/src/contexts/wiki/routes/spaces.routes.ts`・上限なし。`/users` は100人で切るので使わない） */
  users: '/wiki/users',
} as const;

export const wikiOpsKeys = {
  templates: () => ['wiki', 'templates'] as const,
  users: () => ['wiki', 'users'] as const,
};

/** `{ success, data }` の包みを外す */
function unwrap<T>(res: { data: { success?: boolean; data: T } }): T {
  return res.data.data;
}

/* ── 追加 ─────────────────────────────────────────────────── */

export interface CreateWikiPageInput {
  space_id: string;
  parent_id?: string | null;
  title?: string;
  /** テンプレートのページ id。本文・アイコン・タグ・項目の値が写る */
  templateId?: string | null;
  /** 本文を最初から入れて作る（複製で使う）。テンプレートより優先される */
  body_md?: string;
  icon?: string | null;
  status?: 'draft' | 'published';
  /**
   * 「足りないページ」の質問から起こすときの、その質問の id。
   * **サーバーが1回で結びつけます** — 画面から作成と片づけを順に投げると、
   * 前半だけ成功したときに押し直した人が下書きを2本作ります（#735）。
   */
  gap_id?: string | null;
}

export async function createWikiPage(input: CreateWikiPageInput): Promise<WikiPage> {
  return unwrap<WikiPage>(await api.post(WIKI_OPS_URL.pages, input));
}

/* ── 情報の欄（担当・見直し予定・タグ） ───────────────────── */

/**
 * 情報の欄だけを直す。**渡したものだけ**が書き換わります。
 *
 * ⚠️ `expected_updated_at` を**添えません**。本文の編集ロックとは別の操作で
 * （§6-②「読んでいる人が担当と見直し予定を直せる」）、同じページを誰かが
 * 書いている最中でも通ってよいためです。添えると、本文が保存されるたびに
 * タグを付けようとした人が「他の人が先に更新しました」で止まります。
 *
 * ⚠️ **いまは情報の欄だけを直しても版が1つ増えます**（`savePageInternal` は
 * 本文が同じでも `wiki_page_versions` に1行足し、`rev` を +1 します）。
 * タグを3つ付けると履歴に「第N版」が3つ並び、どれも本文が同じに見えます。
 * だからこの画面は**打つたびではなく、決めたときだけ**送っています
 * （選び直す・タグを入れる・タグを消す・日付を決める）。
 * 本文と題が変わらない保存で版を足さない手当ては、サーバー側で入れてください。
 */
export interface WikiPageInfoInput {
  owner_user_id?: string | null;
  /** "YYYY-MM-DD"。空にするときは null */
  review_by?: string | null;
  tags?: string[];
}

export async function patchWikiPageInfo(id: string, input: WikiPageInfoInput): Promise<WikiPage> {
  return unwrap<WikiPage>(await api.patch(WIKI_OPS_URL.page(id), input));
}

/**
 * 状態だけを変える（「一覧から隠す」＝ `archived`／「一覧に戻す」＝ `published`）。
 * 本文・題を送らないので、誰かが書いている最中でも通ります。
 */
export async function patchWikiPageStatus(id: string, status: WikiPageStatus): Promise<WikiPage> {
  return unwrap<WikiPage>(await api.patch(WIKI_OPS_URL.page(id), { status }));
}

/* ── ツリーの中で動かす ───────────────────────────────────── */

export interface MoveWikiPageInput {
  /** スペースの直下へ移すときは null */
  parent_id: string | null;
  /** 省略すると、その親のいちばん下に付きます */
  sort_order?: number;
}

export interface MoveWikiPageResult {
  id: string;
  space_id: string;
  parent_id: string | null;
  sort_order: number;
}

export async function moveWikiPage(id: string, input: MoveWikiPageInput): Promise<MoveWikiPageResult> {
  return unwrap<MoveWikiPageResult>(await api.patch(WIKI_OPS_URL.move(id), input));
}

/* ── 削除・テンプレート ───────────────────────────────────── */

export interface DeleteWikiPageResult {
  id: string;
  /** 一緒に消えた子ページも含む id の一覧 */
  deleted_ids: string[];
}

export async function deleteWikiPage(id: string): Promise<DeleteWikiPageResult> {
  return unwrap<DeleteWikiPageResult>(await api.delete(WIKI_OPS_URL.page(id)));
}

export async function setWikiTemplate(id: string, isTemplate: boolean): Promise<WikiPage> {
  return unwrap<WikiPage>(await api.post(WIKI_OPS_URL.makeTemplate(id), { is_template: isTemplate }));
}

/* ── お気に入り（段D・§6-①②） ────────────────────────────── */

export interface WikiFavoriteResult {
  page_id: string;
  favorited: boolean;
}

/**
 * お気に入りに入れる／外す。**人ごとの印**なので、他の人の画面は変わりません。
 *
 * ⚠️ **同じ操作を2回送っても同じ結果になります**（サーバーが入れ直し・外し直しを
 * 受け付ける）。電波の悪いところで送り直されても失敗として出ません。
 */
export async function setWikiFavorite(id: string, favorited: boolean): Promise<WikiFavoriteResult> {
  const url = WIKI_OPS_URL.favorite(id);
  return unwrap<WikiFavoriteResult>(favorited ? await api.post(url) : await api.delete(url));
}

/** テンプレートの一覧の1行（`listTemplates` が返す列。**本文は入っていない**） */
export interface WikiTemplateBrief {
  id: string;
  title: string;
  icon: string | null;
  tags: string[];
  status: WikiPageStatus;
  updated_at: string;
  space_id: string;
  space_key: string;
  space_name: string;
  space_color: string | null;
}

/**
 * テンプレートの一覧。
 * **editor を持たない人は 403 になる**ので、呼ぶ側が `enabled` で止めてください。
 */
export function useWikiTemplates(enabled = true) {
  return useQuery({
    queryKey: wikiOpsKeys.templates(),
    enabled,
    queryFn: async ({ signal }) =>
      unwrap<WikiTemplateBrief[]>(await api.get(WIKI_OPS_URL.templates, { signal })),
    staleTime: 60_000,
  });
}

/* ── 担当に選べる人 ───────────────────────────────────────── */

export interface WikiUserBrief {
  id: string;
  name: string;
  email?: string;
}

export function useOnairUsers(enabled = true) {
  return useQuery({
    queryKey: wikiOpsKeys.users(),
    enabled,
    queryFn: async ({ signal }) =>
      unwrap<WikiUserBrief[]>(await api.get(WIKI_OPS_URL.users, { signal })),
    staleTime: 5 * 60_000,
  });
}

/* ── 取り直し ─────────────────────────────────────────────── */

/**
 * 書いたあとに読み直すもの。
 *
 * ⚠️ **ツリーは `wikiKeys.tree(spaceKey)` で、スペースの key が要ります。**
 * 手元に key が無いときは `['wiki', 'tree']` の前方一致で全部落とします
 * （スペースをまたぐ操作はしないので、落としすぎても取り直しは1本だけです）。
 */
export function useWikiRefresh() {
  const qc = useQueryClient();
  // ⚠️ **毎回同じものを返す。** 返り値をそのまま `useCallback` / `useEffect` の
  //    依存に書く呼び出しがあるので、描画のたびに作り直すと効果が回り続けます
  return useMemo(() => ({
    tree(spaceKey?: string | null) {
      if (spaceKey) void qc.invalidateQueries({ queryKey: wikiKeys.tree(spaceKey) });
      else void qc.invalidateQueries({ queryKey: ['wiki', 'tree'] });
    },
    page(id: string) {
      void qc.invalidateQueries({ queryKey: wikiKeys.page(id) });
    },
    home() {
      void qc.invalidateQueries({ queryKey: wikiKeys.home() });
    },
    templates() {
      void qc.invalidateQueries({ queryKey: wikiOpsKeys.templates() });
    },
  }), [qc]);
}
