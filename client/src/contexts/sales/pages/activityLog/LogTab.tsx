/**
 * 営業活動記録の「記録」タブ (v4・営業担当の立場で作り直した回)
 *
 * ── 何を直したか（利用者からのご指摘）────────────────────────
 *
 * 1. **案件別に見られないと分からない** … 既定を「案件別」にした。
 *    1案件＝1つの白い面にまとめ、その中に未完了の次のアクションを並べる
 *    （`ByProjectRows.tsx`）。時系列は切替で残す — 「いつ何をしたか」を
 *    追う仕事も現にあるため
 * 2. **期限超過が分かりづらい／期限超過でない案件もある** …
 *    期限の4区分のチップ（期限超過 / 本日・明日 / 今週 / 期限未設定）で絞り、
 *    **赤くするのは期限超過の日付の文字だけ**にした。面は塗らない
 * 3. **編集できない・関係なくなっても残る** … 行の操作に「編集」を置き、
 *    本文と期限を直せるようにした（`NextActionButtons.tsx`）
 *
 * ── 絞り込みが2通りある理由 ────────────────────────────────
 *
 * 案件別は `GET /activity-logs/by-project`（`due` / `search` / `user_id`）、
 * 時系列は `GET /activity-logs`（`activity_type` / `origin` / `sort`）で、
 * **サーバーが受け取れる絞り込みがそもそも違います**。片方にしか効かない
 * 絞り込みを両方に出すと「押しても何も起きない」欄ができるので、
 * 並びごとに出す欄を変えています（期限のチップは案件別だけ）。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import { useDebounced } from '@gmo-onair/shared/src/client/hooks/useDebounced';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Input } from '@/components/ui/input';
import { TimelineGroups } from './TimelineGroups';
import { ByProjectRows } from './ByProjectRows';
import { UpcomingPanel } from './UpcomingPanel';
import { DesktopFilterBar, ActivityMobileFilters, type OriginFilter, type SortKey } from './Filters';
import { useNextActionActions } from './useNextActionActions';
import { useByProject, useDueCounts } from './byProject';
import { DUE_FILTERS, DUE_LABEL, todayStr, type DueFilter } from './dueState';
import type { ActivityLogRow } from './types';

export type LogView = 'project' | 'timeline';

interface ActivityLogListResponse {
  data: ActivityLogRow[];
  pagination?: { total: number; totalPages: number };
}

const VIEWS: { key: LogView; label: string }[] = [
  { key: 'project', label: '案件別' },
  { key: 'timeline', label: '時系列' },
];

export function LogTab({
  view, onView, initialSort, canEdit, onOpen, onEditId,
}: {
  view: LogView;
  onView: (v: LogView) => void;
  /** ダッシュボードからの `?sort=next_action`（時系列の初期並び順） */
  initialSort: SortKey;
  canEdit: boolean;
  /** 時系列の行を開く（編集ダイアログ） */
  onOpen?: (row: ActivityLogRow) => void;
  /** 案件別の「編集」（行そのものを持っていないので id で開く） */
  onEditId?: (id: string) => void;
}) {
  const today = todayStr();
  /**
   * 完了・延期を押したら**案件別の一覧とチップの件数も落とす**。
   * 既定の鍵（`activity-logs` / `activity-upcoming`）だけだと、
   * 片づけたのにチップの「期限超過 3」が 3 のまま残る
   */
  const actions = useNextActionActions([['activity-by-project'], ['activity-by-project-counts']]);

  const [search, setSearch] = useState('');
  // 遅らせるのは**問い合わせに渡す値だけ**で、入力欄は `search`（即時）のまま
  const appliedSearch = useDebounced(search.trim(), 300);
  const [due, setDue] = useState<DueFilter>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('');
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [page, setPage] = useState(1);
  const reset = () => setPage(1);

  // ── 案件別 ────────────────────────────────────────────────
  const byProject = useByProject(
    { due, search: appliedSearch, userId: '', page },
    view === 'project',
  );
  const counts = useDueCounts({ search: appliedSearch, userId: '' }, view === 'project');
  const groups = byProject.data?.data ?? [];

  // ── 時系列 ────────────────────────────────────────────────
  const timeline = useQuery<ActivityLogListResponse>({
    queryKey: ['activity-logs', page, appliedSearch, typeFilter, originFilter, sort],
    // ⚠️ `signal` を渡す（渡さないと、絞り込みを変えても前の重い通信が走り続ける）
    queryFn: async ({ signal }) => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (appliedSearch) params.search = appliedSearch;
      if (typeFilter) params.activity_type = typeFilter;
      if (originFilter) params.origin = originFilter;
      if (sort !== 'date') params.sort = sort;
      return (await api.get('/activity-logs', { params, signal })).data;
    },
    enabled: view === 'timeline',
    // 打鍵のたびに一覧が骨組みへ戻らないように、前の内容を残す
    placeholderData: (prev) => prev,
  });
  const rows = timeline.data?.data ?? [];

  const { data: upcomingData } = useQuery({
    queryKey: ['activity-upcoming'],
    queryFn: async () => (await api.get('/activity-logs/upcoming')).data,
    enabled: view === 'timeline',
  });
  const upcoming: ActivityLogRow[] = upcomingData?.data ?? [];

  const filterProps = {
    search, onSearch: (v: string) => { setSearch(v); reset(); },
    typeFilter, onTypeFilter: (v: string) => { setTypeFilter(v); reset(); },
    sort, onSort: (v: SortKey) => { setSort(v); reset(); },
    originFilter, onOriginFilter: (v: OriginFilter) => { setOriginFilter(v); reset(); },
  };
  const clearAll = () => {
    setSearch(''); setTypeFilter(''); setOriginFilter(''); setSort('date'); setDue('all'); reset();
  };

  /*
    2本の問い合わせの状態をここで1つに畳む。**三項で `query` 変数にまとめない** —
    返りの型が違う2つの `useQuery` を union にすると `refetch()` の引数が
    `never` に畳まれて呼べなくなる（型の都合であって、動きの都合ではない）
  */
  const isProject = view === 'project';
  const isError = isProject ? byProject.isError : timeline.isError;
  const error = isProject ? byProject.error : timeline.error;
  const isLoading = isProject ? byProject.isLoading : timeline.isLoading;
  const isFetching = isProject ? byProject.isFetching : timeline.isFetching;
  const pagination = (isProject ? byProject.data : timeline.data)?.pagination;
  const refetch = () => { if (isProject) byProject.refetch(); else timeline.refetch(); };

  const empty = isProject ? groups.length === 0 : rows.length === 0;
  const filtered = !!appliedSearch || (view === 'project'
    ? due !== 'all'
    : !!typeFilter || !!originFilter);

  return (
    <>
      {/* 並びの切替。案件台帳の「閲覧／編集」と同じセグメント */}
      <div className="flex w-fit rounded-control border border-border p-0.5" role="group" aria-label="並びの切替">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => { onView(v.key); reset(); }}
            className={`text-sub flex min-h-tap items-center rounded-control px-3.5 lg:min-h-[32px] ${
              view === v.key ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'project' ? (
        <>
          {/*
            期限のチップ。**押す前に 0 件だと分かる**ように件数を必ず添える
            （数えているのは案件の数＝押した先に並ぶまとまりの数）。
            ⚠️ 本日+8 以降のやることはどのチップにも入らない（「すべて」には出る）
          */}
          <FilterChips
            items={DUE_FILTERS.map((k) => ({
              key: k, label: DUE_LABEL[k], count: counts.data ? counts.data[k] ?? 0 : null,
            }))}
            value={due}
            onChange={(k) => { setDue(k); reset(); }}
            label="期限で絞り込む"
            className="max-w-full"
          />
          {/* 検索は畳まない（探すのは絞り込みではなく目的そのもの） */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="案件名・クライアント名・件名で検索"
              className="h-10 pl-9 sm:h-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); reset(); }}
              aria-label="案件を検索"
            />
          </div>
        </>
      ) : (
        <>
          <UpcomingPanel
            items={upcoming}
            actions={actions}
            onSeeAll={() => { setSort('next_action'); reset(); }}
          />
          <DesktopFilterBar {...filterProps} />
          <ActivityMobileFilters {...filterProps} />
        </>
      )}

      {isError ? (
        <ErrorPanel
          title="活動記録を読み込めませんでした"
          error={error}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : empty ? (
        // 「0件でした」の判定は遅らせた値で行う（即時の `search` だと
        // まだ問い合わせていない言葉で「該当なし」が一瞬出る）
        filtered ? (
          <NoSearchResults
            keyword={appliedSearch}
            activeFilters={[
              view === 'project' && due !== 'all' ? `期限: ${DUE_LABEL[due]}` : '',
              view === 'timeline' && typeFilter ? '種別で絞り込み中' : '',
              view === 'timeline' && originFilter ? `入力元: ${originFilter === 'ai' ? 'AI作成' : '手入力'}` : '',
            ].filter(Boolean)}
            onClearFilters={clearAll}
          />
        ) : (
          <EmptyState
            title={view === 'project' ? '未完了の次のアクションがありません' : '活動記録がありません'}
            description={view === 'project'
              ? '電話・訪問・メール等を記録して次のアクションを決めると、案件ごとにここへ並びます。'
              : '電話・訪問・メール等のやり取りを記録すると、ここに並びます。'}
          />
        )
      ) : view === 'project' ? (
        <ByProjectRows
          groups={groups}
          today={today}
          actions={actions}
          onEdit={canEdit ? onEditId : undefined}
        />
      ) : (
        <TimelineGroups rows={rows} actions={actions} onOpen={canEdit ? onOpen : undefined} />
      )}

      {!empty && !isLoading && !isError && (
        <Pagination
          page={page}
          totalPages={pagination?.totalPages ?? 1}
          total={pagination?.total ?? 0}
          onChange={setPage}
          disabled={isFetching}
        />
      )}
    </>
  );
}
