// レンタル機材検索（Main.dc.html / Mobile.dc.html 相当）。
// 検索バー・会社切替・カテゴリ絞り込みチップ・カード一覧・詳細ダイアログ・予約リストへの導線。
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ListChecks, RefreshCw, Search as SearchIcon, Video } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips, type FilterChipItem } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyError, notifySuccess } from '@/lib/notify';
import * as rentalApi from '@/lib/rentalApi';
import type { RentalCompany, RentalItemSummary } from '@/lib/rentalApi';
import { getOwnerContext } from '@/lib/deviceSettingsApi';
import { companyBadgeClass, formatSyncTimestamp, formatYen, isSyncStale, todayStr } from './rentalFormat';
import RentalItemDetailDialog from './RentalItemDetailDialog';
import { WrappingChips } from './WrappingChips';

const PAGE_SIZE = 60;

export default function RentalSearchPage() {
  const { ownerKey = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const [addingKey, setAddingKey] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, company, category]);

  const itemsQuery = useQuery({
    queryKey: ['rental-items', debouncedQ, company, category, page],
    queryFn: () =>
      rentalApi.searchRentalItems({
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

  const reservationsQuery = useQuery({
    queryKey: ['rental-reservations', ownerKey],
    queryFn: () => rentalApi.getRentalReservations(ownerKey),
    enabled: !!ownerKey,
  });

  // **利用期間の既定値に使う。** 案件の本番実施日（無ければ `todayStr()` へ従来どおり倒す）
  const ownerQuery = useQuery({
    queryKey: ['device-settings-owner-context', ownerKey],
    queryFn: () => getOwnerContext(ownerKey),
    enabled: !!ownerKey,
    staleTime: 60_000,
  });
  const defaultDate = ownerQuery.data?.eventDate || undefined;

  const syncStatusQuery = useQuery({
    queryKey: ['rental-sync-status'],
    queryFn: () => rentalApi.getRentalSyncStatus(),
    staleTime: 5 * 60 * 1000,
    // 取得が進行中の間だけ短い間隔で状態を追いかけ、終わったら自動で通常表示に戻す
    refetchInterval: (query) => {
      const status = query.state.data?.latestRequest?.status;
      return status === 'pending' || status === 'running' ? 5000 : false;
    },
  });

  const syncTriggerMutation = useMutation({
    mutationFn: () => rentalApi.triggerRentalSync(),
    onSuccess: (result) => {
      if (result.ok) {
        notifySuccess('取得を開始しました（完了まで数十分〜1時間ほどかかります）');
      } else {
        notifyError(result.message ?? '取得を始められませんでした。少し待ってから、もう一度お試しください。');
      }
      queryClient.invalidateQueries({ queryKey: ['rental-sync-status'] });
    },
    onError: () => notifyError('取得を始められませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  const latestRequest = syncStatusQuery.data?.latestRequest ?? null;
  const syncInProgress = latestRequest?.status === 'pending' || latestRequest?.status === 'running';

  const reservedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const g of reservationsQuery.data?.groups ?? []) {
      for (const l of g.lines) set.add(`${l.company} ${l.itemId}`);
    }
    return set;
  }, [reservationsQuery.data]);

  const reservationQuantityTotal = useMemo(
    () => (reservationsQuery.data?.groups ?? []).reduce((sum, g) => sum + g.lines.reduce((s, l) => s + l.quantity, 0), 0),
    [reservationsQuery.data],
  );

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

  const quickAdd = async (item: RentalItemSummary) => {
    const key = `${item.company} ${item.itemId}`;
    setAddingKey(key);
    try {
      // **今日ではなく案件の本番実施日を既定にする**（無ければ今日のまま）
      const date = defaultDate || todayStr();
      await rentalApi.addRentalReservation(ownerKey, {
        company: item.company,
        itemId: item.itemId,
        quantity: 1,
        startDate: date,
        endDate: date,
      });
      await reservationsQuery.refetch();
      notifySuccess('予約リストに追加しました');
    } catch {
      notifyError('予約リストに追加できませんでした。', { description: '少し待ってから、もう一度お試しください。' });
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <PageShell className="h-full">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex min-h-[44px] w-fit items-center gap-1.5 text-sub text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        番組のハブに戻る
      </button>

      <PageHeader
        title="レンタル機材検索"
        sub="TOC・レスターの機材を横断検索して、この番組の予約リストに入れられます"
        primaryAction={
          <Button
            variant="outline"
            className="min-h-[44px] border-primary-border-strong bg-primary-surface text-primary hover:bg-primary-surface"
            onClick={() => navigate(`/techops/rental/${encodeURIComponent(ownerKey)}/list`)}
          >
            <ListChecks className="mr-1.5 h-4 w-4" aria-hidden="true" />
            予約リスト
            {reservationQuantityTotal > 0 && (
              <span className="font-number ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-badge font-extrabold text-primary-foreground">
                {reservationQuantityTotal}
              </span>
            )}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5 rounded-card border border-border bg-card p-2.5">
        <div className="relative w-full sm:w-60">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="品名・型番で検索"
            className="h-9 rounded-control bg-muted/40 pl-8 text-sub"
          />
        </div>
        <FilterChips items={companyItems} value={company} onChange={setCompany} label="会社で絞り込む" />
        <div className="flex-1" />
        <span className="font-number shrink-0 whitespace-nowrap text-sub text-muted-foreground">
          <strong className="text-foreground">{total}件</strong>
        </span>
        {/* カテゴリはこの画面だけ横スクロールせず折り返す（機材のカテゴリ数が多く、
            横スクロールだと後ろの選択肢が見えないため）。共通の FilterChips は
            意図して折り返さない設計（一覧の開始位置が行ごとに動く問題を避けるため）
            なので、ここだけ専用の WrappingChips を使う — 他画面には影響しない */}
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
          title={debouncedQ || category || company !== 'all' ? '条件に合う機材はありません' : 'まだ機材を取得できていません'}
          description={debouncedQ || category || company !== 'all' ? '別の言葉で検索するか、絞り込みを外してください。' : '毎朝5時の自動取得を待つか、時間を置いてお試しください。'}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <RentalItemCard
                key={`${item.company} ${item.itemId}`}
                item={item}
                reserved={reservedKeys.has(`${item.company} ${item.itemId}`)}
                adding={addingKey === `${item.company} ${item.itemId}`}
                onOpenDetail={() => setDetailTarget({ company: item.company, itemId: item.itemId })}
                onQuickAdd={() => quickAdd(item)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center py-2">
              <Button variant="outline" className="min-h-[44px]" onClick={() => setPage((p) => p + 1)} disabled={itemsQuery.isFetching}>
                {itemsQuery.isFetching ? '読み込み中…' : 'さらに表示'}
              </Button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sub-sm text-muted-foreground">
        <span className="shrink-0">2社のサイトから毎朝5時に自動取得 ・ 価格・掲載は各社サイトが正</span>
        {syncStatusQuery.data?.companies.map((c) => {
          const stale = c.lastSeenAt != null && isSyncStale(c.lastSeenAt);
          return (
            <span
              key={c.company}
              className={`shrink-0 ${stale ? 'font-bold text-warning-border-strong' : ''}`}
            >
              {c.company} 最終取得 {formatSyncTimestamp(c.lastSeenAt)}
              {c.lastSeenAt && `（${c.listedCount}件）`}
              {stale && '（更新が止まっている可能性）'}
            </span>
          );
        })}
        <span className="flex-1" />
        <Button
          variant="outline"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-sub-sm"
          onClick={() => syncTriggerMutation.mutate()}
          disabled={syncInProgress || syncTriggerMutation.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncInProgress ? 'animate-spin' : ''}`} aria-hidden="true" />
          {syncInProgress ? '取得中…' : '今すぐ取得'}
        </Button>
        {latestRequest?.status === 'error' && !syncInProgress && (
          <span className="shrink-0 text-warning-border-strong" title={latestRequest.errorMessage ?? undefined}>
            前回は取得できませんでした
          </span>
        )}
      </div>

      <RentalItemDetailDialog
        ownerKey={ownerKey} target={detailTarget} defaultDate={defaultDate}
        onOpenChange={(open) => !open && setDetailTarget(null)}
      />
    </PageShell>
  );
}

function RentalItemCard({
  item,
  reserved,
  adding,
  onOpenDetail,
  onQuickAdd,
}: {
  item: RentalItemSummary;
  reserved: boolean;
  adding: boolean;
  onOpenDetail: () => void;
  onQuickAdd: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
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
        {reserved && (
          <span className="absolute bottom-2 right-2 rounded-badge bg-success-surface px-1.5 py-0.5 text-badge font-bold text-success">
            リストに追加済み
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
                ネット受付 <span className="font-number text-sub font-extrabold text-foreground">{formatYen(item.priceNet)}</span>
                <span className="text-sub-sm text-muted-foreground">/日</span>
              </span>
              <span className="font-number text-sub-sm text-muted-foreground">電話 {formatYen(item.priceTel)}</span>
            </>
          ) : (
            <span className="text-sub-sm text-muted-foreground">
              価格 <span className="font-number text-sub font-extrabold text-foreground">{formatYen(item.priceNet)}</span>
              <span className="text-sub-sm text-muted-foreground">（税込）/日</span>
            </span>
          )}
        </div>
        <div className="mt-auto flex gap-1.5 pt-2">
          <Button variant="outline" className="h-8 flex-1 text-sub" onClick={onOpenDetail}>
            詳細
          </Button>
          {reserved ? (
            <span className="flex flex-[1.4] items-center justify-center rounded-control bg-muted text-sub font-bold text-muted-foreground">
              追加済み
            </span>
          ) : (
            <Button className="h-8 flex-[1.4] text-sub" onClick={onQuickAdd} disabled={adding}>
              {adding ? '追加中…' : '予約リストへ'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
