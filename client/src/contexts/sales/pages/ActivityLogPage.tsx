/**
 * 営業活動記録・営業レビュー (v4)
 *
 * 電話・訪問・メール等のやり取りを、案件をまたいで探す・直す「記録」タブと、
 * ファネル・失注分析・営業評価という**分析3タブ**を、1画面のタブ切替に統合した
 * 画面です（ご指示）。**単一案件のやり取りは案件詳細⑥「やり取り」タブ**
 * （`projectDetail/ThreadTab.tsx`）が持ち、そちらは打ちっぱなしで書ける専用の作り
 * （AI が整形・削除不可）です。こちらは**全案件を横断して探す・古い記録を直す・
 * 削除する台帳**と**全案件を横断して集計する分析**という役割が近い2画面だったため、
 * 別画面のまま並べておく理由が薄いと判断してまとめました。
 *
 * ── 統合で決めたこと（この回） ──────────────────────────────
 *
 * - **`/sales/activity-logs` を主URLにした。** 旧 `/sales/review` は
 *   `?tab=funnel` 付きで転送する（`App.tsx` の `RedirectKeepQuery`）
 * - **画面は route レベルでは PC 専用から外れる**（`pcOnlyScreens.ts` の更新は
 *   親セッション側）。**タブだけを画面の中で判定する**（案件詳細の
 *   `MOBILE_TAB_KEYS` と同じ考え方）。「記録」タブは前の回でスマホに開放した
 *   ままの中身（`Row stackOnMobile` ＋ `ActivityMobileFilters`）を使い、
 *   分析3タブ（ファネル・失注分析・営業評価）は「3列を並べて打合せの場で映す」
 *   前提が変わっていないので `PcOnlyPanel` の案内に差し替える。
 *   **「それでもこのまま開く」を選んだ人のためにスマホ用部品は残してある**
 *   — `ActivityMobileFilters` は記録タブで実際に使われている
 * - **タブは `?tab=` の URL 引数**（`取引先（財務）` の `CounterpartyPage.tsx` と同じ形）。
 *   `記録`（既定・引数なし）／`funnel`／`lost`／`performance`。ローカル state にすると
 *   `/sales/review` からの転送先を「開いたらファネルタブ」にできない
 * - **タブごとに `useQuery` の `enabled` を絞る。** 4タブぶんまとめて叩くと、
 *   記録タブを開いているだけで分析3本のAPIも毎回走ることになる
 * - **中身のロジックは1行も変えていない。** 集計式（`sales-analytics.service.ts`）・
 *   一覧の絞り込み・次回アクションの完了/延期はそれぞれの回で作り込んだものをそのまま
 *   呼んでいる。まとめたのは画面の枠（ヘッダー・タブ切替）だけ
 *
 * ── 記録タブ（v4 で作り直した点・旧実装から） ────────────────
 *
 * - 一覧を `Row`/`RowMain`/`RowSlot`（`docs/design/v4/_rules.md`「1. 縦の整列」）に
 *   載せ替えた。旧実装は PC 表とスマホカードを別々に書いており、桁と端の
 *   そろえ方が2通りあった
 * - **次回アクションをこの場で片づけられるようにした**（`useNextActionActions.ts`）。
 *   `POST /:id/complete-next-action` `/postpone-next-action` はサーバーに前から
 *   あったが、この一覧からは一度も呼ばれていなかった（編集ダイアログを開き直す
 *   しかなかった）。顧客360°ビューが先に使っている形に合わせた
 * - 削除ボタンは `manager` だけに絞った（サーバーは前から `manager` を要求して
 *   おり、それ以外の人には**押せるのに 403** だった）
 *
 * ── 分析3タブ（v4 で作り直した点・旧実装から） ──────────────
 *
 * - `shadcn/Tabs` を、案件台帳の「閲覧／編集」と同じセグメント切替に差し替えた
 *   （旧実装は1ファイル929行）
 * - 数字の書き方を v4 ダッシュボード（①）と揃えた: KPI はカードではなく帯
 *   （`Strip`）、金額は `Money`/`manYen`、棒グラフは状態の色トークン
 * - ⚠️ 目標設定ダイアログが保存できていなかったバグ・営業評価タブが
 *   実績のある担当者で必ず 500 落ちするバグを直した（`salesReview/TargetDialog.tsx`
 *   ／ `sales-analytics.service.ts` の `GROUP BY` の説明を参照）
 * - 「目標設定」ボタンは `sales:editor` 権限で出し分けている
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, ClipboardList, BarChart3, AlertTriangle, Award } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PcOnlyPanel } from '@gmo-onair/shared/src/client-v4/pcOnly';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ActivityRows } from './activityLog/ActivityRows';
import { UpcomingPanel } from './activityLog/UpcomingPanel';
import { DesktopFilterBar, ActivityMobileFilters, type OriginFilter, type SortKey } from './activityLog/Filters';
import { ActivityLogDialog } from './activityLog/ActivityLogDialog';
import { useNextActionActions } from './activityLog/useNextActionActions';
import type { ActivityLogRow } from './activityLog/types';
import { FunnelPanel } from './salesReview/FunnelPanel';
import { LostPanel } from './salesReview/LostPanel';
import { PerformancePanel } from './salesReview/PerformancePanel';
import { TargetDialog } from './salesReview/TargetDialog';
import type { FunnelData, LostAnalysis, PerformanceRow, StaffUser } from './salesReview/types';

interface ActivityLogListResponse {
  data: ActivityLogRow[];
  pagination?: { total: number; totalPages: number };
}

const now = new Date();
const currentYear = now.getFullYear();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const TABS = [
  { key: 'log', label: '記録', icon: ClipboardList },
  { key: 'funnel', label: 'ファネル', icon: BarChart3 },
  { key: 'lost', label: '失注分析', icon: AlertTriangle },
  { key: 'performance', label: '営業評価', icon: Award },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * 分析3タブ（「3列を並べて打合せの場で映す」前提が変わっていない分）。
 * 記録タブはここに含めない — スマホでも今までどおり使える
 */
const ANALYSIS_TABS: TabKey[] = ['funnel', 'lost', 'performance'];

export default function ActivityLogPage() {
  const { hasPermission } = useAuth();
  const canDelete = hasPermission('sales', 'manager');
  const canSetTarget = hasPermission('sales', 'editor');
  // サーバー（`activity-logs.routes.ts`）は POST '/'・PUT '/:id' に editor を要求する。
  // 削除だけ `manager` に絞って直した穴と同じで、記録・編集も見ていないと
  // reader に「押せるのに403」のボタン・編集導線が出る
  const canEdit = hasPermission('sales', 'editor');
  const isMobile = useIsMobile();

  const [urlParams, setUrlParams] = useSearchParams();
  const tabParam = urlParams.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'log';
  const setTab = (k: TabKey) => {
    const next = new URLSearchParams(urlParams);
    if (k === 'log') next.delete('tab'); else next.set('tab', k);
    setUrlParams(next, { replace: true });
  };
  // **「それでもこのまま開く」で1タブだけ解除できる**（案件詳細の `forcedTab` と
  // 同じ考え方）。タブそのものを覚えておくのが要点で、真偽値にすると
  // 別のタブへ移ってからまた戻ったときに解除が残ってしまう
  const [openedAnyway, setOpenedAnyway] = useState<TabKey | null>(null);
  const analysisBlocked = isMobile && ANALYSIS_TABS.includes(tab) && openedAnyway !== tab;

  // ── 記録タブ ──────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('');
  // **`?sort=next_action` は初回だけ読む**（`tab` と違い並び順まで URL に
  // 常時同期させると絞り込みの他パラメータも URL 化する話になり手が広がるため）。
  // ダッシュボード「期限が過ぎたやること」からのリンク（`OverduePanel.tsx`）が
  // 次回アクション期限順で開けるようにするための入口
  const [sort, setSort] = useState<SortKey>(() => (urlParams.get('sort') === 'next_action' ? 'next_action' : 'date'));
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
    enabled: tab === 'log',
  });
  const rows = query.data?.data ?? [];

  const { data: upcomingData } = useQuery({
    queryKey: ['activity-upcoming'],
    queryFn: async () => (await api.get('/activity-logs/upcoming')).data,
    enabled: tab === 'log',
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

  // ── 分析3タブ ─────────────────────────────────────────────
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [targetOpen, setTargetOpen] = useState(false);

  const funnelQuery = useQuery<{ data: FunnelData }>({
    queryKey: ['sales-funnel', year, month],
    queryFn: async () => (await api.get('/sales-analytics/funnel', { params: { year, month } })).data,
    enabled: tab === 'funnel',
  });

  const lostQuery = useQuery<{ data: LostAnalysis }>({
    queryKey: ['sales-lost-reasons', year],
    queryFn: async () => (await api.get('/sales-analytics/lost-reasons', { params: { year } })).data,
    enabled: tab === 'lost',
  });

  const perfQuery = useQuery<{ data: PerformanceRow[] }>({
    queryKey: ['sales-performance', year, month],
    queryFn: async () => (await api.get('/sales-analytics/performance', { params: { year, month } })).data,
    enabled: tab === 'performance',
  });

  const { data: usersData } = useQuery<{ data: StaffUser[] }>({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/auth/users')).data,
    enabled: tab === 'performance',
  });
  const staffUsers = (usersData?.data ?? []).filter((u) => u.role === 'staff' || u.role === 'system_admin');

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="営業活動記録"
        sub={
          tab === 'log'
            ? '電話・訪問・メール等、案件をまたいだ営業活動の記録です'
            : `${year}年${month ? ` ${month}月` : ' 通年'} ・ ファネル・失注理由・営業評価を確認します`
        }
        primaryAction={
          tab === 'log' ? (
            canEdit ? (
              <Button onClick={() => setEditing('new')}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />活動を記録
              </Button>
            ) : null
          ) : (
            <div className="flex items-center gap-2">
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={month ? String(month) : 'all'} onValueChange={(v) => setMonth(v === 'all' ? undefined : Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">通年</SelectItem>
                  {MONTHS.map((m) => <SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )
        }
      />

      {/* タブ切替。案件台帳の「閲覧／編集」と同じセグメント（`ProjectLedgerPage.tsx`） */}
      <div className="flex w-fit rounded-control border border-border p-0.5" role="group" aria-label="表示の切替">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`text-sub flex min-h-tap items-center gap-1.5 rounded-control px-3.5 lg:min-h-[32px] ${
              tab === t.key ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'log' && (
        <>
          <UpcomingPanel
            items={upcoming}
            actions={actions}
            onSeeAll={() => { setSort('next_action'); reset(); }}
          />

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
                <ActivityRows rows={rows} actions={actions} onOpen={canEdit ? setEditing : undefined} />
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
        </>
      )}

      {analysisBlocked && ANALYSIS_TABS.includes(tab) && (
        <PcOnlyPanel
          inset
          what={TABS.find((t) => t.key === tab)!.label}
          why="記録タブに加えて、3列を並べて打合せの場で映すための分析タブ（ファネル・失注分析・営業評価）を同じ画面に統合しています。"
          instead={{ label: '記録タブを見る', to: 'log' }}
          onGoInstead={() => setTab('log')}
          onOpenAnyway={() => setOpenedAnyway(tab)}
        />
      )}

      {!analysisBlocked && tab === 'funnel' && (
        funnelQuery.isError ? (
          <ErrorPanel title="ファネル分析を読み込めませんでした" error={funnelQuery.error} onRetry={() => funnelQuery.refetch()} />
        ) : !funnelQuery.data ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : (
          <FunnelPanel funnel={funnelQuery.data.data} year={year} />
        )
      )}

      {!analysisBlocked && tab === 'lost' && (
        lostQuery.isError ? (
          <ErrorPanel title="失注分析を読み込めませんでした" error={lostQuery.error} onRetry={() => lostQuery.refetch()} />
        ) : !lostQuery.data ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : (
          <LostPanel lost={lostQuery.data.data} year={year} />
        )
      )}

      {!analysisBlocked && tab === 'performance' && (
        perfQuery.isError ? (
          <ErrorPanel title="営業評価を読み込めませんでした" error={perfQuery.error} onRetry={() => perfQuery.refetch()} />
        ) : !perfQuery.data ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : (
          <PerformancePanel
            performance={perfQuery.data.data}
            canSetTarget={canSetTarget}
            onOpenTarget={() => setTargetOpen(true)}
          />
        )
      )}

      {editing && (
        <ActivityLogDialog
          key={editing === 'new' ? 'new' : editing.id}
          editing={editingRow}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
        />
      )}

      {targetOpen && (
        <TargetDialog year={year} staffUsers={staffUsers} onClose={() => setTargetOpen(false)} />
      )}
    </div>
  );
}
