/**
 * 検索がサーバーを呼ぶところ（段D・docs/design/v4/wiki.md §5-4）
 *
 * ⚠️ **URL は1ファイルに集める**（`client-wiki/CLAUDE.md`）。段D は「サーバー」と
 * 「検索の画面」を同時に書いているため、`lib/wikiApi.ts` を取り合わないよう
 * ここに分けています（段B の `components/page/pageOpsApi.ts` と同じ扱い）。
 *
 * サーバーの正は `server/src/contexts/wiki/` の検索。返りはこの製品の作法どおり
 * `{ success: true, data: … }` で包まれています。
 *
 * ── 何を渡すか ──────────────────────────────────────────────
 *
 * 渡せる絞り込みは `WikiSearchQuery`（shared）にあるものだけです。
 * **サーバーが見ない値を渡さない** — 画面に操作だけが増えて、押しても結果が
 * 変わらない絞り込みになります（「状態」を画面に置いていないのも同じ理由。
 * 下書きはそもそも検索に出ません・§7-5）。
 *
 * ⚠️ **スペースの絞り込みもここから渡します。** 以前は渡さずに画面側で当て直して
 * いましたが、当たりが上限（50件）を超えると**下位のスペースのページがそもそも
 * 届かず**、絞り込んでも出ない・件数が 0件 に見える、という穴がありました
 * （Codex の指摘・P2）。いまはサーバーが**上限で切る前に**絞り込み、
 * 絞り込みの列に出す件数（`counts`）は**スペースの絞り込みを外して**別に数えます。
 */
import { useQuery, keepPreviousData, type UseQueryOptions } from '@tanstack/react-query';
import type {
  WikiSearchHit,
  WikiSearchResult,
  WikiSearchSpaceCount,
} from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';

export const WIKI_SEARCH_URL = {
  /** 検索（`?q=` ＋ 絞り込み）。タイトル・見出し・本文に当て、点数付けはサーバー側 */
  search: '/wiki/search',
} as const;

/** 画面から渡せる絞り込み（`WikiSearchQuery` のうち、この画面が使うもの） */
export interface WikiSearchInput {
  q: string;
  /** スペース（`wiki_spaces.id`）。**サーバーが上限で切る前に絞ります** */
  spaceId?: string;
  /** タグ名がそのまま一致するページだけ */
  tags?: string[];
  /** 担当（`users.id`） */
  ownerId?: string;
  /** 何日以内に更新されたもの。未指定は全部 */
  updatedWithinDays?: number;
  /** 上位何件まで返すか */
  limit?: number;
}

export const wikiSearchKeys = {
  search: (v: WikiSearchInput) =>
    [
      'wiki', 'search', v.q, v.spaceId ?? '', (v.tags ?? []).join(','),
      v.ownerId ?? '', v.updatedWithinDays ?? 0, v.limit ?? 0,
    ] as const,
};

const EMPTY: WikiSearchResult = { hits: [], counts: [] };

async function fetchSearch(v: WikiSearchInput, signal?: AbortSignal): Promise<WikiSearchResult> {
  const res = await api.get<{
    success: boolean;
    data: WikiSearchHit[] | { hits?: WikiSearchHit[]; counts?: WikiSearchSpaceCount[] };
  }>(WIKI_SEARCH_URL.search, {
    signal,
    params: {
      q: v.q,
      spaceId: v.spaceId || undefined,
      // ⚠️ **コンマで連ねない。** タグにコンマが入っていると、サーバー側で
      // 2つに割れて当たらなくなります（`search.routes.ts` の `listParam`）
      tags: v.tags && v.tags.length > 0 ? v.tags : undefined,
      ownerId: v.ownerId || undefined,
      updatedWithinDays: v.updatedWithinDays || undefined,
      limit: v.limit || undefined,
    },
  });
  const data = res.data?.data;
  // `{ hits, counts }` が正。配列で返っても一覧を描く手前で落とさない
  if (Array.isArray(data)) return { hits: data, counts: [] };
  if (!data) return EMPTY;
  return {
    hits: Array.isArray(data.hits) ? data.hits : [],
    counts: Array.isArray(data.counts) ? data.counts : [],
  };
}

type Opts = Omit<
  UseQueryOptions<WikiSearchResult, Error, WikiSearchResult, readonly unknown[]>,
  'queryKey' | 'queryFn'
>;

/**
 * 検索する。**語が空のときは投げません**（打つ前に「該当なし」と出さないため、
 * 画面側は `q` が空のうちは結果ではなく案内を出します）。
 *
 * 打ち替えている間も前の結果を残します（`keepPreviousData`）。消してから描き直すと
 * 1文字ごとに一覧が消えて、読んでいる途中の行が飛びます。
 */
export function useWikiSearch(v: WikiSearchInput, opts?: Opts) {
  const q = v.q.trim();
  return useQuery({
    queryKey: wikiSearchKeys.search({ ...v, q }),
    enabled: q.length > 0,
    queryFn: ({ signal }) => fetchSearch({ ...v, q }, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    ...opts,
  });
}
