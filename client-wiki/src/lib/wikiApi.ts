/**
 * Wiki の API 呼び出し（段A・読むだけ）
 *
 * URL は **この1ファイルに集める**。画面のあちこちに文字列を撒くと、
 * サーバーと突き合わせるときに全部を探すことになる。
 *
 * baseURL は `createApi` の既定 `/api/v1/internal`。したがって
 * `WIKI_URL.spaces` = `GET /api/v1/internal/wiki/spaces`。
 * サーバーの正は `server/src/contexts/wiki/index.ts` の一覧。
 *
 * ⚠️ **返りは `{ success, data }` で包まれている**（この製品の作法）。
 *    包みを外すのは `pick()` の1か所だけにして、画面には中身だけを渡す。
 */
import { useEffect, useMemo } from 'react';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  WikiPage,
  WikiPageStatus,
  WikiPageKind,
  WikiPageVersion,
  WikiReviewRow,
  WikiSpace,
  WikiTreeNode,
} from '@gmo-onair/shared/src/wiki/types';
import api from './api';

/* ── URL（サーバーと突き合わせる唯一の場所） ─────────────────── */

export const WIKI_URL = {
  /** ホームに出すものを1本にまとめたもの（スペース・最近更新・お気に入り・期限切れ） */
  home: '/wiki/home',
  /** スペースの一覧（左メニュー用。ホームは `home` に入っているほうを使う） */
  spaces: '/wiki/spaces',
  /** スペース1件。**URL に出るのは `key`（`/wiki/s/sales`）で、id ではない** */
  space: (key: string) => `/wiki/spaces/${key}`,
  /** そのスペースのツリー。**こちらも `key`** */
  tree: (key: string) => `/wiki/spaces/${key}/tree`,
  /** ページ1件（本文・パンくず・リンク元・30日の閲覧数つき） */
  page: (id: string) => `/wiki/pages/${id}`,
  /** 版の一覧（新しい順・**本文は入っていない**） */
  versions: (id: string) => `/wiki/pages/${id}/versions`,
  /** 版1件（本文つき）。差分は2本取って画面で比べる */
  version: (id: string, rev: number) => `/wiki/pages/${id}/versions/${rev}`,
  /** 閲覧の記録（204 が返る） */
  view: (id: string) => `/wiki/pages/${id}/view`,
} as const;

/* ── react-query の鍵 ─────────────────────────────────────── */

export const wikiKeys = {
  all: ['wiki'] as const,
  home: () => ['wiki', 'home'] as const,
  spaces: () => ['wiki', 'spaces'] as const,
  space: (key: string) => ['wiki', 'space', key] as const,
  tree: (key: string) => ['wiki', 'tree', key] as const,
  page: (id: string) => ['wiki', 'page', id] as const,
  versions: (id: string) => ['wiki', 'versions', id] as const,
  version: (id: string, rev: number) => ['wiki', 'version', id, rev] as const,
};

/* ── 返ってくる形 ─────────────────────────────────────────── */

/**
 * 一覧に出すページの軽い形（最近更新・お気に入り）。
 * `wiki-home.service.ts` の `CARD_SELECT` と同じ列。**本文は入っていない**
 * （10件で数百 KB になるため）。
 */
export interface WikiPageBrief {
  id: string;
  title: string;
  icon: string | null;
  status: WikiPageStatus;
  kind: WikiPageKind;
  space_id: string;
  space_name: string;
  space_key: string;
  space_color: string | null;
  updated_at: string;
  updated_by: string | null;
  updater_name: string | null;
}

/** `GET /wiki/home` の中身 */
export interface WikiHome {
  spaces: WikiSpace[];
  recent: WikiPageBrief[];
  favorites: WikiPageBrief[];
  /** 自分が担当で見直し期限が切れている公開ページ。0件なら画面に出さない */
  overdue: WikiReviewRow[];
}

/* ── 取り出し ─────────────────────────────────────────────── */

/** `{ success, data }` の包みを外す。**外すのはここだけ** */
async function pick<T>(url: string, signal?: AbortSignal, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get<{ success: boolean; data: T }>(url, { signal, params });
  return res.data.data;
}

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

export function useWikiHome(opts?: Opts<WikiHome>) {
  return useQuery({
    queryKey: wikiKeys.home(),
    queryFn: ({ signal }) => pick<WikiHome>(WIKI_URL.home, signal),
    ...opts,
  });
}

export function useWikiSpaces(opts?: Opts<WikiSpace[]>) {
  return useQuery({
    queryKey: wikiKeys.spaces(),
    queryFn: ({ signal }) => pick<WikiSpace[]>(WIKI_URL.spaces, signal),
    ...opts,
  });
}

export function useWikiSpace(key: string | undefined, opts?: Opts<WikiSpace>) {
  return useQuery({
    queryKey: wikiKeys.space(key ?? ''),
    enabled: !!key,
    queryFn: ({ signal }) => pick<WikiSpace>(WIKI_URL.space(key!), signal),
    ...opts,
  });
}

/** ツリーは**スペースの key** で取る（id ではない。サーバーの道がそうなっている） */
export function useWikiTree(spaceKey: string | null | undefined, opts?: Opts<WikiTreeNode[]>) {
  return useQuery({
    queryKey: wikiKeys.tree(spaceKey ?? ''),
    enabled: !!spaceKey,
    queryFn: ({ signal }) => pick<WikiTreeNode[]>(WIKI_URL.tree(spaceKey!), signal),
    ...opts,
  });
}

export function useWikiPage(id: string | undefined, opts?: Opts<WikiPage>) {
  return useQuery({
    queryKey: wikiKeys.page(id ?? ''),
    enabled: !!id,
    queryFn: ({ signal }) => pick<WikiPage>(WIKI_URL.page(id!), signal),
    ...opts,
  });
}

export function useWikiVersions(id: string | undefined, opts?: Opts<WikiPageVersion[]>) {
  return useQuery({
    queryKey: wikiKeys.versions(id ?? ''),
    enabled: !!id,
    queryFn: ({ signal }) => pick<WikiPageVersion[]>(WIKI_URL.versions(id!), signal),
    ...opts,
  });
}

/** 版1本。履歴の差分で「古いほう」「新しいほう」を別々に取る */
export function useWikiVersion(id: string | undefined, rev: number | null, opts?: Opts<WikiPageVersion>) {
  return useQuery({
    queryKey: wikiKeys.version(id ?? '', rev ?? -1),
    enabled: !!id && rev !== null,
    queryFn: ({ signal }) => pick<WikiPageVersion>(WIKI_URL.version(id!, rev!), signal),
    ...opts,
  });
}

/* ── 閲覧の記録 ───────────────────────────────────────────── */

/**
 * 同じページを短い間に何度も数えないための覚え。
 *
 * StrictMode は開発中に効果を2回走らせる（＝同じページが2回数えられる）し、
 * 戻る・進むでも同じページに何度も入る。**30秒は数え直さない**ことで、
 * 「よく読まれるページ」と AI の出典が開かれた率（§7-3 条件3）が水増しされるのを防ぐ。
 */
const lastViewAt = new Map<string, number>();
const VIEW_GAP_MS = 30_000;

/** ページを開いたことを記録する（結果は使わない。失敗しても画面に出さない） */
export function useRecordView(pageId: string | undefined, via: 'tree' | 'link' | 'favorite' = 'link') {
  useEffect(() => {
    if (!pageId) return;
    const now = Date.now();
    const prev = lastViewAt.get(pageId);
    if (prev && now - prev < VIEW_GAP_MS) return;
    lastViewAt.set(pageId, now);
    // 読むのを妨げないので、失敗は黙って捨てる（帯を出すほどのことではない）
    void api.post(WIKI_URL.view(pageId), { via }).catch(() => undefined);
  }, [pageId, via]);
}

/* ── 小物 ─────────────────────────────────────────────────── */

/** ページの一覧を「読んでいるページのスペース」で絞るときに使う */
export function useSpaceByKey(spaces: WikiSpace[] | undefined, key: string | undefined) {
  return useMemo(() => spaces?.find((s) => s.key === key), [spaces, key]);
}
