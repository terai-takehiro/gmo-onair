// レンタル機材検索（機材管理の新規項目）。
//
// 借りる前段の下調べ専用画面 — 「TOC・レスターにどんな機材があるか」を検索・閲覧できる
// （タスク指示: 「レンタル機材検索機能だけ」を機材管理に足す）。実際の予約リスト管理・
// 「今すぐ取得」トリガーは引き続き制作技術支援（`/techops/rental/:ownerKey`）側だけに
// 置く — こちらは案件/番組の文脈（ownerKey）を持たないため、予約は本来そちらで行う。
// データの実体（TOC・レスターの横断カタログ）は共通の `qsheet_rental_items` で、
// `client-techops/src/pages/rental/RentalSearchPage.tsx` の検索まわりの見た目・作法を踏襲した。
import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search as SearchIcon, Video } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips, type FilterChipItem } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import * as rentalCatalogApi from '@/lib/rentalCatalogApi';
import type { RentalCompany, RentalItemSummary } from '@/lib/rentalCatalogApi';
import { companyBadgeClass, formatSyncTimestamp, isSyncStale } from './rental/rentalFormat';
import RentalItemDetailDialog from './rental/RentalItemDetailDialog';
import { WrappingChips } from './rental/WrappingChips';

const PAGE_SIZE = 60;

export default function RentalSearchPage() {
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [company, setCompany] = useState<'all' | RentalCompany>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RentalItemSummary[]>([]);
  const [detailTarget, setDetailTarget] = useState<{ company: string; itemId: string } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, company, category]);

  const itemsQuery = useQuery({
    queryKey: ['equipment-rental-items', debouncedQ, company, category, page],
    queryFn: () =>
      rentalCatalogApi.searchRentalItems({
        q: debouncedQ || undefined,
        company: company === 'all' ? undefined : company,
        category: category ?? undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!itemsQuery.data) return;
    setItems((prev) => (page === 1 ? itemsQuery.data.items : [...prev, ...itemsQuery.data.items]));
  }, [itemsQuery.data, page]);

  const syncStatusQuery = useQuery({
    queryKey: ['equipment-rental-sync-status'],
    queryFn: () => rentalCatalogApi.getRentalSyncStatus(),
    staleTime: 5 * 60 * 1000,
  });

  const companyItems: FilterChipItem<'all' | RentalCompany>[] = useMemo(() => {
    const rows = itemsQuery.data?.companies ?? [];
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const find = (name: string) => rows.find((r) => r.company === name)?.count ?? 0;
    return [
      { key: 'all', label: '2社すべて', count: itemsQuery.data ? total : null },
      { key: 'TOC', label: 'TOC', count: itemsQuery.data ? find('TOC') : null },
      { key: 'レスター', label: 'レスター', count: itemsQuery.data ? find('レスター') : null },
    ];
  }, [itemsQuery.data]);

  const categoryChips: FilterChipItem<string>[] = useMemo(() => {
    const rows = itemsQuery.data?.categories ?? [];
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    return [
      { key: '', label: 'すべて', count: itemsQuery.data ? total : null },
      ...rows.map((r) => ({ key: r.category, label: r.category, count: r.count })),
    ];
  }, [itemsQuery.data]);

  const total = itemsQuery.data?.total ?? 0;
  const hasMore = items.length < total;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 px-3 py-4 sm:px-6 sm:py-6">
      <PageHeader title="レンタル機材検索" sub="TOC・レスターの機材を横断検索して、借りる前に何があるか調べられます" />

      <div className="flex flex-wrap items-center gap-2.5 rounded-card border border-border bg-card p-2.5">
        <div className="relative w-full sm:w-60">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="商品名・型名で検索"
            className="h-9 rounded-control bg-muted/40 pl-8 text-sub"
          />
        </div>
        <FilterChips items={companyItems} value={company} onChange={setCompany} label="会社で絞り込む" />
        <div className="flex-1" />
        <span className="font-number shrink-0 whitespace-nowrap text-sub text-muted-foreground">
          <strong className="text-foreground">{total}件</strong>
        </span>
        {/* カテゴリはこの画面だけ横スクロールせず折り返す（機材のカテゴリ数が多く、
            横スクロールだと後ろの選択肢が見えないため）。client-techops 側と同じ判断 */}
        <WrappingChips
          items={categoryChips}
          value={category ?? ''}
          onChange={(k) => setCategory(k || null)}
          label="カテゴリで絞り込む"
          className="w-full"
        />
      </div>

      {itemsQuery.isLoading && page === 1 ? (
        <Delayed>
          <SkeletonRows rows={6} />
        </Delayed>
      ) : items.length === 0 ? (
        <EmptyState
          title={debouncedQ || category || company !== 'all' ? '条件に合う機材はありません' : '機材がまだ取得できていません'}
          description={debouncedQ || category || company !== 'all' ? '別の言葉で検索か、絞り込みを外してください。' : '毎朝5時の自動取得を待つか、時間を置いてお試しください。'}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <RentalItemCard
                key={`${item.company} ${item.itemId}`}
                item={item}
                onOpenDetail={() => setDetailTarget({ company: item.company, itemId: item.itemId })}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={itemsQuery.isFetching}
                className="min-h-[44px] rounded-control border border-border bg-card px-4 text-sub font-bold text-foreground hover:bg-muted disabled:opacity-60"
              >
                {itemsQuery.isFetching ? '読み込み中…' : 'さらに表示'}
              </button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sub-sm text-muted-foreground">
        <span className="shrink-0">2社のサイトから毎朝5時に自動取得 ・ 価格・掲載は各社サイトが正</span>
        {syncStatusQuery.data?.companies.map((c) => {
          const stale = c.lastSeenAt != null && isSyncStale(c.lastSeenAt);
          return (
            <span key={c.company} className={`shrink-0 ${stale ? 'font-bold text-warning-border-strong' : ''}`}>
              {c.company} 最終取得 {formatSyncTimestamp(c.lastSeenAt)}
              {c.lastSeenAt && `（${c.listedCount}件）`}
              {stale && '（更新が止まっている可能性）'}
            </span>
          );
        })}
      </div>

      <RentalItemDetailDialog target={detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)} />
    </div>
  );
}

function RentalItemCard({ item, onOpenDetail }: { item: RentalItemSummary; onOpenDetail: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex flex-col overflow-hidden rounded-card border border-border bg-card text-left"
    >
      <div className="relative flex h-28 shrink-0 items-center justify-center bg-surface-subtle">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Video className="h-8 w-8 text-fg-disabled" aria-hidden="true" />
        )}
        <span className={`absolute left-2 top-2 rounded-badge px-1.5 py-0.5 text-badge font-bold ${companyBadgeClass(item.company)}`}>
          {item.company}
        </span>
        {item.status === 'missing' && (
          <span className="absolute right-2 top-2 rounded-badge bg-warning-surface px-1.5 py-0.5 text-badge font-bold text-warning-border-strong">
            掲載終了の可能性
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-sub font-bold leading-tight">{item.name}</span>
        <span className="text-sub-sm text-muted-foreground">
          {[item.category, item.subcategory].filter(Boolean).join(' ／ ')}
          {item.category || item.subcategory ? ' ・ ' : ''}ID {item.itemId}
        </span>
        <div className="mt-0.5 flex items-baseline gap-2.5">
          {item.priceTel != null ? (
            <>
              <span className="text-sub-sm text-muted-foreground">
                ネット受付 <Money value={item.priceNet} inline className="text-sub font-extrabold text-foreground" />
                <span className="text-sub-sm text-muted-foreground">/日</span>
              </span>
              <span className="text-sub-sm text-muted-foreground">
                電話 <Money value={item.priceTel} inline className="text-sub-sm" />
              </span>
            </>
          ) : (
            <span className="text-sub-sm text-muted-foreground">
              価格 <Money value={item.priceNet} inline className="text-sub font-extrabold text-foreground" />
              <span className="text-sub-sm text-muted-foreground">（税込）/日</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
