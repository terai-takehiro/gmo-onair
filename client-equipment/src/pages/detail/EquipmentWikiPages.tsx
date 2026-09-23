/**
 * 機材の詳細 —「この機材の使い方」（段F・docs/design/v4/wiki.md §4-3・§9）
 *
 * ── 何を出すか ──────────────────────────────────────────────
 *
 * Wiki の本文に `[品名](/equipment/items/:id)` と書かれたページ（§4-3 の ONAiR カード）を
 * 逆から引いて並べます。設計書の「機材台帳の詳細に『使い方のページ』が出る」がこれです。
 * **Wiki 側でこの機材にリンクを貼るだけ**で、台帳にも出ます。
 *
 * ── なぜ検索の口を使うのか ──────────────────────────────────
 *
 * ONAiR リンクは本文の中の文字で、専用の表を持っていません（`303_wiki.sql`）。
 * 段D の検索（`GET /wiki/search`・`title` / `headings` / `body_md` に ILIKE）へ
 * **リンクの道そのもの**を語として渡します。語は空白でしか切られないので
 * （`shared/src/wiki/search.ts` の `splitTerms`）、`/equipment/items/xxx` は
 * 1語のまま当たります。新しい API を足していません。
 *
 * ⚠️ 当たるのは**読めるスペースの公開ページ**だけです（§8）。Wiki を読めない人には
 * 403 が返るので、そのときも下の決まりどおり何も出しません。
 *
 * ⚠️ **0件のときは何も出しません。**「使い方のページはありません」という枠を
 * 毎回出すと、機材の詳細に空の区画が1つ増えるだけで、次にやることが分かりません。
 *
 * ⚠️ Wiki は**別のアプリ**（ベースパス `/wiki/`）なので、`navigate()` ではなく
 * 素の `<a>` で丸ごと移ります。
 */
import { useQuery } from "@tanstack/react-query";
import { BookText, ChevronRight } from "lucide-react";
import type { WikiSearchHit } from "@gmo-onair/shared/src/wiki/types";
import api from "@/lib/api";

/** 出す数。これを超えたときだけ「Wiki で続きを見る」を添える */
const MAX_ROWS = 5;

export function EquipmentWikiPages({ itemId }: { itemId: string }) {
  const term = `/equipment/items/${itemId}`;

  const { data } = useQuery({
    queryKey: ["wiki-linked-pages", "equipment", itemId],
    queryFn: async ({ signal }) => {
      const res = await api.get("/wiki/search", {
        params: { q: term, limit: MAX_ROWS + 1 },
        signal,
      });
      return (res.data?.data?.hits ?? []) as WikiSearchHit[];
    },
    staleTime: 60_000,
    retry: false,
  });

  const hits = data ?? [];
  // 0件・読み込み中・失敗のときは何も出さない（押せて何も出ないリンクを作らない）
  if (hits.length === 0) return null;

  const rows = hits.slice(0, MAX_ROWS);

  return (
    <section className="rounded-card border border-border bg-card p-4 lg:col-span-2" aria-labelledby="eq-wiki">
      <h2 id="eq-wiki" className="text-cardtitle mb-3 flex items-center gap-2">
        <BookText className="h-4 w-4" aria-hidden="true" />この機材の使い方（Wiki）
      </h2>

      <div className="flex flex-col rounded-card border border-border">
        {rows.map((hit) => (
          <a
            key={hit.id}
            href={`/wiki/p/${hit.id}`}
            className="min-h-tap flex items-center gap-3 border-b border-border-faint px-3 py-2.5 last:border-b-0 hover:bg-surface-subtle"
          >
            <span className="min-w-0 flex-1">
              <span className="text-sub block truncate">{hit.title}</span>
              <span className="text-sub-sm block truncate text-muted-foreground">
                {hit.path || hit.space_name}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </a>
        ))}
      </div>

      {hits.length > MAX_ROWS && (
        <a
          href={`/wiki/search?q=${encodeURIComponent(term)}`}
          className="min-h-tap text-sub mt-2 flex items-center text-primary"
        >
          Wiki で続きを見る
        </a>
      )}
    </section>
  );
}

export default EquipmentWikiPages;
