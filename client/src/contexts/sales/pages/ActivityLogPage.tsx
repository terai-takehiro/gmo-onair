/**
 * 営業活動記録 (v4)
 *
 * 電話・訪問・メール等のやり取りを、案件をまたいで探す・直す画面です。
 * **単一案件のやり取りは案件詳細⑥「やり取り」タブ**（`projectDetail/ThreadTab.tsx`）
 * が持ち、そちらは打ちっぱなしで書ける専用の作り（AI が整形・削除不可）です。
 * こちらは**全案件を横断して探す・古い記録を直す・削除する**ための台帳で、
 * 役割が違うので画面も別のままにしてあります（`docs/reviews/2026-07-18-…` の
 * 「顧客360°ビューへ一本化」案は 2026-08-07「モックが正」の決定で不採用）。
 *
 * ── v4 で作り直した点（旧実装から） ──────────────────────────
 *
 * - 一覧を `Row`/`RowMain`/`RowSlot`（`docs/design/v4/_rules.md`「1. 縦の整列」）に
 *   載せ替えた。旧実装は PC 表とスマホカードを別々に書いており、桁と端の
 *   そろえ方が2通りあった
 * - **次回アクションをこの場で片づけられるようにした**（`useNextActionActions.ts`）。
 *   `POST /:id/complete-next-action` `/postpone-next-action` はサーバーに前から
 *   あったが、この一覧からは一度も呼ばれていなかった（編集ダイアログを開き直す
 *   しかなかった）。顧客360°ビューが先に使っている形に合わせた
 * - `PageHeader` / `FilterChips` の仲間（`MobileFilterBar`）/
 *   `EmptyState` / `NoSearchResults` / `ErrorPanel` / `Delayed`+`SkeletonRows` /
 *   `Pagination` に差し替えた。旧実装は「読み込み中...」「活動記録がありません」を
 *   その場で書いており、探している最中なのか本当に0件なのかが区別できなかった
 * - 削除ボタンは `manager` だけに絞った（サーバーは前から `manager` を要求して
 *   おり、それ以外の人には**押せるのに 403** だった）
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { Button } from '@/components/ui/button';
import { ActivityRows } from './activityLog/ActivityRows';
import { UpcomingPanel } from './activityLog/UpcomingPanel';
import { DesktopFilterBar, ActivityMobileFilters, type OriginFilter, type SortKey } from './activityLog/Filters';
import { ActivityLogDialog } from './activityLog/ActivityLogDialog';
import { useNextActionActions } from './activityLog/useNextActionActions';
import type { ActivityLogRow } from './activityLog/types';

interface ActivityLogListResponse {
  data: ActivityLogRow[];
  pagination?: { total: number; totalPages: number };
}

export default function ActivityLogPage() {
  const { hasPermission } = useAuth();
  const canDelete = hasPermission('sales', 'manager');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('');
  const [sort, setSort] = useState<SortKey>('date');
  const [page, setPage] = useState(1);
  /** 開いているダイアログ。`'new'` は新規、行なら編集 */
  const [editing, setEditing] = useState<ActivityLogRow | 'new' | null>(null);

  const reset = () => setPage(1);
  const actions = useNextActionActions();

  const query = useQuery<ActivityLogListResponse>({
    queryKey: ['activity-logs', page, search, typeFilter, originFilter, sort],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (typeFilter) params.activity_type = typeFilter;
      if (originFilter) params.origin = originFilter;
      if (sort !== 'date') params.sort = sort;
      return (await api.get('/activity-logs', { params })).data;
    },
  });
  const rows = query.data?.data ?? [];

  const { data: upcomingData } = useQuery({
    queryKey: ['activity-upcoming'],
    queryFn: async () => (await api.get('/activity-logs/upcoming')).data,
  });
  const upcoming: ActivityLogRow[] = upcomingData?.data ?? [];

  const filterProps = {
    search, onSearch: (v: string) => { setSearch(v); reset(); },
    typeFilter, onTypeFilter: (v: string) => { setTypeFilter(v); reset(); },
    sort, onSort: (v: SortKey) => { setSort(v); reset(); },
    originFilter, onOriginFilter: (v: OriginFilter) => { setOriginFilter(v); reset(); },
  };

  const clearAll = () => { setSearch(''); setTypeFilter(''); setOriginFilter(''); setSort('date'); reset(); };
  const editingRow = editing === 'new' ? null : editing;

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="営業活動記録"
        sub="電話・訪問・メール等、案件をまたいだ営業活動の記録です"
        primaryAction={
          <Button onClick={() => setEditing('new')}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />活動を記録
          </Button>
        }
      />

      <UpcomingPanel items={upcoming} actions={actions} />

      <DesktopFilterBar {...filterProps} />
      <ActivityMobileFilters {...filterProps} />

      {query.isError ? (
        <ErrorPanel title="活動記録を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : rows.length === 0 ? (
        search || typeFilter || originFilter ? (
          <NoSearchResults
            keyword={search}
            activeFilters={[
              typeFilter ? '種別で絞り込み中' : '',
              originFilter ? `入力元: ${originFilter === 'ai' ? 'AI作成' : '手入力'}` : '',
            ].filter(Boolean)}
            onClearFilters={clearAll}
          />
        ) : (
          <EmptyState
            title="活動記録がありません"
            description="電話・訪問・メール等のやり取りを記録すると、ここに並びます。"
          />
        )
      ) : (
        <>
          <div className="flex flex-col">
            <ActivityRows rows={rows} actions={actions} onOpen={setEditing} />
          </div>
          <Pagination
            page={page}
            totalPages={query.data?.pagination?.totalPages ?? 1}
            total={query.data?.pagination?.total ?? 0}
            onChange={setPage}
            disabled={query.isFetching}
          />
        </>
      )}

      {editing && (
        <ActivityLogDialog
          key={editing === 'new' ? 'new' : editing.id}
          editing={editingRow}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
