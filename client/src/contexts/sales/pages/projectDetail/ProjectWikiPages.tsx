/**
 * 案件詳細 / 書類タブ —「この案件の Wiki ページ」（段F・docs/design/v4/wiki.md §4-3・§9）
 *
 * ── 何を出すか ──────────────────────────────────────────────
 *
 * Wiki の本文に `[名前](/sales/projects/:id)` と書かれたページ（§4-3 の ONAiR カード）を
 * 逆から引いて並べます。**Wiki 側で案件にリンクを貼るだけ**で、案件詳細にも出ます。
 *
 * ── なぜ検索の口を使うのか ──────────────────────────────────
 *
 * ONAiR リンクは本文の中の文字で、`wiki_links`（ページ同士）のような専用の表を
 * 持っていません（`303_wiki.sql`）。そこで段D の検索
 * （`GET /wiki/search`・`title` / `headings` / `body_md` に ILIKE）に
 * **リンクの道そのもの**を語として渡します。語は空白でしか切られないので
 * （`shared/src/wiki/search.ts` の `splitTerms`）、`/sales/projects/xxx` は
 * 1語のまま当たります。新しい API を足していません。
 *
 * ⚠️ 当たるのは**読めるスペースの公開ページ**だけです（§8）。読めない人には
 * 存在ごと見えないので、ここで足し直しません。
 *
 * ⚠️ **0件のときは何も出しません。**「関係するページはありません」と枠だけ出すと、
 * 案件詳細に毎回空の区画が増え、下の説明の位置がずれます（Wiki のホームの
 * 「要見直し」と同じ扱い・`client-wiki/CLAUDE.md`）。Wiki の権限が無い人・
 * 読み込みに失敗した人にも同じく出しません。
 *
 * ⚠️ Wiki は**別のアプリ**（ベースパス `/wiki/`）なので、`<Link>` ではなく素の
 * `<a>` で丸ごと移ります（同じタブの `DayTab` の制作技術支援と同じ作法）。
 */
import { useQuery } from '@tanstack/react-query';
import { BookText, ChevronRight } from 'lucide-react';
import type { WikiSearchHit } from '@gmo-onair/shared/src/wiki/types';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import api from '@/lib/api';

/** 出す数。これを超えたときだけ「Wiki で続きを見る」を添える */
const MAX_ROWS = 5;

export function ProjectWikiPages({ projectId }: { projectId: string }) {
  const term = `/sales/projects/${projectId}`;

  const { data } = useQuery({
    queryKey: ['wiki-linked-pages', 'project', projectId],
    queryFn: async ({ signal }) => {
      const res = await api.get('/wiki/search', {
        params: { q: term, limit: MAX_ROWS + 1 },
        signal,
      });
      return (res.data?.data?.hits ?? []) as WikiSearchHit[];
    },
    staleTime: 60_000,
    retry: false,
  });

  const hits = data ?? [];
  // 0件・読み込み中・失敗のときは何も出さない（押せて何も出ない入り口を作らない）
  if (hits.length === 0) return null;

  const rows = hits.slice(0, MAX_ROWS);
  const hasMore = hits.length > MAX_ROWS;

  return (
    <section className="rounded-card border border-border bg-card" aria-labelledby="project-wiki-pages">
      <h2 id="project-wiki-pages" className="text-cardtitle flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <BookText className="h-4 w-4 text-primary" aria-hidden="true" />
        この案件の Wiki ページ
        <span className="text-sub-sm font-number ml-auto text-muted-foreground">{rows.length}</span>
      </h2>

      <div className="flex flex-col">
        {rows.map((hit) => (
          <a
            key={hit.id}
            href={`/wiki/p/${hit.id}`}
            className="min-h-tap flex items-center gap-3 border-b border-border-faint px-4 py-3 last:border-b-0 hover:bg-surface-subtle"
          >
            <span className="min-w-0 flex-1">
              <span className="text-list block truncate">{hit.title}</span>
              <span className="text-sub-sm block truncate text-muted-foreground">
                {hit.path || hit.space_name}　{formatRelativeTime(hit.updated_at)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </a>
        ))}
      </div>

      {hasMore && (
        <a
          href={`/wiki/search?q=${encodeURIComponent(term)}`}
          className="min-h-tap text-sub flex items-center justify-center border-t border-border-subtle px-4 text-primary"
        >
          Wiki で続きを見る
        </a>
      )}
    </section>
  );
}

export default ProjectWikiPages;
