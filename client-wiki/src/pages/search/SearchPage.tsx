/**
 * ④ 検索 `/wiki/search?q=`（docs/design/v4/wiki.md §6-④・モック `Search.dc.html`）
 *
 * ── 4つの状態を混ぜない ──────────────────────────────────────
 *
 * **まだ打っていない / 探している / 0件 / 失敗した** は別のことです。
 * 打つ前に「該当なし」と出すと、探す前から無いと言うことになります。
 *
 * ── 絞り込みはナビゲーションの列にしない ────────────────────
 *
 * Wiki のナビは共通の左メニュー1本だけです（利用者からのご指摘。`CLAUDE.md`）。
 * 絞り込みは**本文の中の列**（PC）と**結果の上に畳んだ1行**（スマホ）に置きます。
 *
 * ── 「この質問を AI に聞く」はまだ出しません ────────────────
 *
 * 設計（§6-④）とモックには結果の上に AI への案内がありますが、AI の画面は段E です。
 * 押せるのに何も出ない案内は「壊れている」としか見えないので、段E で足します。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { Delayed, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { splitTerms } from '@gmo-onair/shared/src/wiki/search';
import { useWikiSpaces } from '@/lib/wikiApi';
import { useOnairUsers } from '@/components/page/pageOpsApi';
import { useWikiSearch } from '@/components/search/searchApi';
import { useDebounced } from '@/components/search/useDebounced';
import SearchFilterPanel from '@/components/search/SearchFilterPanel';
import SearchFilterSheet from '@/components/search/SearchFilterSheet';
import SearchHitCard from '@/components/search/SearchHitCard';
import WikiRecentPages from '@/components/search/WikiRecentPages';
import {
  EMPTY_FILTERS,
  activeFilterLabels,
  type WikiSearchFilters,
} from '@/components/search/searchFilters';

/** 1回に受け取る上限。これを超えた分は出さず、件数のところにそう書く */
const LIMIT = 50;

export default function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const urlQ = sp.get('q') ?? '';
  const [text, setText] = useState(urlQ);
  const [filters, setFilters] = useState<WikiSearchFilters>(EMPTY_FILTERS);
  /** URL と入力欄の**最後に合わせた値**。どちらが書いたかを見分けるために持つ */
  const synced = useRef(urlQ);

  // 打つのが止まってから投げる。ただし**消したときは待たない** — 空にした瞬間に
  // 案内へ戻らないと、消したのに前の語の結果が 300ms 残って見えます
  const typed = text.trim();
  const slowQ = useDebounced(typed, 300);
  const q = typed ? slowQ : '';
  const typedTag = filters.tag.trim();
  const slowTag = useDebounced(typedTag, 300);
  const tag = typedTag ? slowTag : '';

  // 打ち込みが止まったら URL に写す。**履歴は増やさない**（`replace`）—
  // 1文字ずつ戻るボタンに積まれると、前の画面に戻れなくなる
  useEffect(() => {
    if (q === synced.current) return;
    synced.current = q;
    setSp(q ? { q } : {}, { replace: true });
  }, [q, setSp]);

  // URL が外から変わったとき（左メニューの「検索」・⌘K の窓から来たとき）に入力欄へ写す。
  // 自分が書いた分（`synced`）は無視する — 打っている最中に1つ前の語へ巻き戻さないため
  useEffect(() => {
    if (urlQ === synced.current) return;
    synced.current = urlQ;
    setText(urlQ);
  }, [urlQ]);

  const spacesQ = useWikiSpaces();
  const usersQ = useOnairUsers();
  /*
   * ⚠️ **スペースもサーバーに渡します。** 画面で当て直していたころは、当たりが
   * 上限（`LIMIT`）を超えると**下位のスペースのページがそもそも届かず**、
   * 絞り込んでも出ない・件数が 0件 に見えていました（Codex の指摘・P2）。
   * 件数（`counts`）はサーバーが**スペースの絞り込みを外して・上限で切る前に**数えます。
   */
  const searchQ = useWikiSearch({
    q,
    spaceId: filters.spaceId || undefined,
    tags: tag ? [tag] : undefined,
    ownerId: filters.ownerId || undefined,
    updatedWithinDays: filters.withinDays || undefined,
    limit: LIMIT,
  });

  const terms = useMemo(() => splitTerms(q), [q]);
  const hits = useMemo(() => searchQ.data?.hits ?? [], [searchQ.data]);
  const counts = useMemo(
    () => new Map((searchQ.data?.counts ?? []).map((c) => [c.space_id, c.count])),
    [searchQ.data],
  );
  const total = useMemo(
    () => (searchQ.data?.counts ?? []).reduce((n, c) => n + c.count, 0),
    [searchQ.data],
  );
  const labels = activeFilterLabels(filters, spacesQ.data, usersQ.data);

  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const searching = q !== '' && searchQ.isFetching;
  /** 件数と絞り込みは**結果が届いてから**出す。0件と「まだ届いていない」は別のこと */
  const hasResult = q !== '' && !searchQ.isError && searchQ.data !== undefined;

  return (
    <PageShell>
      {/* 検索欄（PC）。高さ 54px はモック `Search.dc.html` の実測値 */}
      <label className="relative hidden max-w-4xl lg:block">
        <span className="sr-only">Wiki を検索</span>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="text"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="Wiki を検索（例: 配信 音が出ない ／ セキュリティカード）"
          className="h-[54px] w-full rounded-note border border-primary-border bg-card pl-12 pr-4 text-cardtitle text-foreground placeholder:font-normal placeholder:text-muted-foreground"
        />
      </label>

      <SearchFilterSheet
        text={text}
        onText={setText}
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        spaces={spacesQ.data}
        users={usersQ.data}
        counts={counts}
        total={total}
        showCounts={hasResult}
      />

      {hasResult && (
        <p className="max-w-4xl text-sub text-secondary-foreground">
          {/*
            ⚠️ **件数はサーバーが数えた数を出します**（`counts`）。`hits.length` は
            上限（`LIMIT`）で切ったあとの数なので、当たりが多いスペースを選ぶと
            いつも「50件」と出ていました（Codex の指摘・P2）。
          */}
          <strong className="font-number font-bold">
            {filters.spaceId ? counts.get(filters.spaceId) ?? hits.length : total}件
          </strong>
          {terms.length >= 2 ? ` ・ ${terms.length}語すべてを含むページ` : ''}
          {hits.length >= LIMIT ? ` ・ 上位${LIMIT}件まで` : ''}
          {' ・ 公開されているページだけが出ます（下書きは出ません）'}
          {searching ? ' ・ 検索中…' : ''}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* 絞り込む相手が無いうちは列ごと出さない（0件の並びだけが立つと壊れて見える） */}
        {hasResult && (
          <SearchFilterPanel
            filters={filters}
            onChange={setFilters}
            spaces={spacesQ.data}
            users={usersQ.data}
            counts={counts}
            total={total}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {q === '' ? (
            <>
              <div className="rounded-card border border-dashed border-border bg-card px-4 py-4 text-sub leading-relaxed text-secondary-foreground">
                <p>タイトル・見出し・本文から探します。タイトルに入っている語ほど上に出ます。</p>
                <p>2語以上を空けて入れると、<strong className="font-bold">すべての語</strong>を含むページだけが出ます。</p>
                <p>公開されているページだけが出ます（下書きは出ません）。読めないスペースのページも出ません。</p>
              </div>
              <WikiRecentPages />
            </>
          ) : searchQ.isError ? (
            <ErrorPanel
              title="検索できませんでした"
              error={searchQ.error}
              onRetry={() => void searchQ.refetch()}
            />
          ) : searchQ.isLoading ? (
            <Delayed>
              <SkeletonRows rows={4} rowHeight={96} />
            </Delayed>
          ) : hits.length === 0 ? (
            <NoSearchResults keyword={q} activeFilters={labels} onClearFilters={clearFilters} />
          ) : (
            hits.map((hit) => <SearchHitCard key={hit.id} hit={hit} terms={terms} />)
          )}
        </div>
      </div>
    </PageShell>
  );
}
