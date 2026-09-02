/**
 * ③ 売上（財務管理） (v4)
 *
 * 案件ごとの売上の台帳です。**確定した売上が ⑤ 見積・請求に並びます**。
 *
 * ── ここでは請求・入金の状態を変えられません ──────────────────
 *
 * 状態（未請求／発行済／入金済）は**見えるだけ**で、押すと変えられる画面
 * （⑤ 見積・請求）へ移ります。同じ数字を2か所から書き換えられるようにすると、
 * 経理が入金を記録した直後に台帳から戻される、という事故が必ず起きます。
 *
 * ── 旧実装から直したこと ────────────────────────────────────
 *
 * ・**案件名で検索できませんでした。** 入力欄に「請求KEY・案件名で検索」と
 *   書いてあるのに、サーバーは請求KEYと備考しか見ていませんでした
 *   （`buildRevenueWhere`）。案件名・GLS番号・請求先も見るようにしています
 * ・**合計はページではなく絞り込み全体**を出します。ページごとの合計だと
 *   2ページ目に行くたびに数字が変わって読み間違えます
 * ・**列幅のドラッグを外しました**（`LedgerRows` に理由を書いています）
 */
import { useMemo, useState } from 'react';
import { useDebounced } from '@gmo-onair/shared/src/client/hooks/useDebounced';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import ExcelToolbar from '@/components/ExcelToolbar';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import { LedgerRows } from './ledger/LedgerRows';
import { LedgerFooter, LedgerSearch, MonthPicker } from './ledger/LedgerParts';
import { useLatestDataMonth, LatestMonthAction } from './ledger/LatestDataMonth';
import { RevenueDialog } from './ledger/RevenueDialog';
import type { LedgerRow, RevenueRow } from './ledger/types';

/**
 * 絞り込み。モックの並びのまま。
 * `status` と `state` は別の軸（確定/見込み は売上そのもの、発行済/入金待ち は請求の進み具合）
 */
const CHIPS = [
  { key: 'all', label: 'すべて', status: 'all', state: '' },
  { key: 'confirmed', label: '確定', status: 'confirmed', state: '' },
  { key: 'draft', label: '見込み', status: 'draft', state: '' },
  { key: 'issued', label: '請求書 発行済', status: 'all', state: 'issued' },
  { key: 'unpaid', label: '入金待ち', status: 'all', state: 'unpaid' },
];

interface RevenueListResponse {
  data: RevenueRow[];
  pagination?: { total: number; totalPages: number };
  total_amount: number;
  state_counts: Record<string, number>;
}

/** 請求の進み具合を1つのバッジにする。**日付が入っていれば済み** */
function billingState(r: RevenueRow): LedgerRow['state'] {
  // **同じ財務の中の「請求・入金」へ送る。** 台帳から状態を変えられるようにすると、
  // 経理が入金を記録した直後に別の画面から戻される事故が起きる
  const to = '/budget/billing';
  if (r.paid_date) {
    return { label: '入金済', tone: 'ok', to, title: `${r.paid_date} に入金。押すと請求・入金の画面へ` };
  }
  if (r.invoice_issued) {
    return { label: '発行済', tone: 'warn', to, title: '請求書は出しました。入金待ちです' };
  }
  return { label: '未請求', tone: 'neutral', to, title: 'まだ請求書を出していません' };
}

export default function RevenueListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get('project_id') || '';
  const filterProjectName = searchParams.get('project_name') || '';
  /*
   * 財務ダッシュボードの「台帳をひらく」から来たときの期間の絞り込み（仕様変更 #4）。
   * キー名はダッシュボード側の `financeDashboard/period.ts`（`ledgerOpenQuery`）が
   * 組み立てるものをそのまま受ける — `/revenues` の API パラメータ名と同じにしてあるので
   * ここで読み替えは要らない。**既存の `project_id` 受け取りロジックの隣に実装**。
   */
  const filterFrom = searchParams.get('recognition_from') || '';
  const filterTo = searchParams.get('recognition_to') || '';
  const filterPeriodLabel = searchParams.get('period_label') || '';
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');

  const [search, setSearch] = useState('');
  /*
   * ⚠️ **この画面は `useCrudPage` を使っていない**（自前の `useQuery`）ので、
   * フックを直しただけでは効かない。仕入・販管費と同じ形をここにも入れる。
   * 遅らせるのは**問い合わせに渡す値だけ**で、入力欄は `search`（即時）のまま。
   */
  const appliedSearch = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [chip, setChip] = useState('confirmed');
  // 計上月。既定は今月。ただし案件の中で見ているとき (?project_id) や、
  // ダッシュボードの期間で絞り込んで来たとき (?recognition_from) は
  // その絞り込みをそのまま使いたいので「解除（全月）」を既定にする
  const [month, setMonth] = useState(() => {
    if (searchParams.get('project_id') || filterFrom) return '';
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  /** 開いているダイアログ。`'new'` は新規、行なら編集 */
  const [editing, setEditing] = useState<RevenueRow | 'new' | null>(null);

  const cur = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];

  const query = useQuery<RevenueListResponse>({
    queryKey: ['revenues-all', page, appliedSearch, filterProjectId, month, cur.status, cur.state, filterFrom, filterTo],
    // ⚠️ `signal` を渡す（渡さないと、絞り込みを変えても前の重い通信が走り続ける）
    queryFn: async ({ signal }) => {
      const params: Record<string, string | number> = { page, limit: 20, status: cur.status };
      if (appliedSearch) params.search = appliedSearch;
      if (filterProjectId) params.project_id = filterProjectId;
      if (month) params.recognition_month = month;
      // ダッシュボードから引き継いだ期間。`recognition_month` と両方入っていても
      // AND で絞られるだけなので害はない（`server/.../list-query.ts` 参照）
      if (filterFrom && filterTo) { params.recognition_from = filterFrom; params.recognition_to = filterTo; }
      if (cur.state) params.state = cur.state;
      return (await api.get('/revenues', { params, signal })).data;
    },
    // 打鍵のたびに一覧が骨組みへ戻らないように、前の内容を残す
    placeholderData: (prev) => prev,
  });

  const rows: RevenueRow[] = useMemo(() => query.data?.data ?? [], [query.data]);
  const counts = query.data?.state_counts ?? {};

  const ledgerRows: LedgerRow[] = useMemo(
    () => rows.map((r) => ({
      id: r.id,
      code: r.episode_code || r.gls_number,
      title: r.project_name || '（案件なし）',
      sub: r.billing_key,
      party: r.customer_name,
      amount: Number(r.amount) || 0,
      tax_category: r.tax_category,
      recognition_date: r.recognition_date,
      state: billingState(r),
      project_id: r.project_id,
      // **検収は真偽フラグではなく `inspection_date`**（入っていれば済み・migration 140）。
      // 済んだ行だけバッジを出す（`is_provisional` の「仮」タグと同じ「有るときだけ出す」流儀）
      secondaryBadge: r.inspection_date
        ? { label: '検収済', tone: 'ok', title: `${r.inspection_date} に検収` }
        : null,
    })),
    [rows],
  );

  const chips = CHIPS.map((c) => ({
    key: c.key,
    label: c.label,
    // 「すべて」「確定」「見込み」は状態の内訳ではないので件数を出さない
    // (状態の件数を並べると、確定/見込みの件数と足し算が合わずに混乱する)
    count: c.state ? (counts[c.state] ?? null) : null,
  }));

  const reset = () => { setPage(1); };

  // 0件のときだけ「どの月なら売上があるか」を引く（今の絞り込みのまま）
  const latestMonth = useLatestDataMonth('/revenues', {
    enabled: !query.isLoading && rows.length === 0 && !appliedSearch,
    params: {
      status: cur.status,
      state: cur.state || undefined,
      project_id: filterProjectId || undefined,
    },
  });

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="売上"
        sub={
          filterProjectName
            ? `${filterProjectName} の売上`
            : '案件ごとの売上です。確定した売上が「見積・請求」に並びます'
        }
        primaryAction={
          canEdit ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />売上を登録
            </Button>
          ) : undefined
        }
      >
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExcelToolbar
            resource="/revenues"
            name="売上"
            queryKey={['revenues-all']}
            hasDuplicateKey={false}
            exportParams={{
              search: appliedSearch || undefined,  // 画面の結果と書き出しの中身を揃える
              project_id: filterProjectId || undefined,
              recognition_month: month || undefined,
              recognition_from: filterFrom || undefined,
              recognition_to: filterTo || undefined,
              status: cur.status,
              state: cur.state || undefined,
            }}
          />
        </div>
      </PageHeader>

      {filterProjectId && (
        <ProjectQuickLinks
          projectId={filterProjectId}
          projectName={filterProjectName}
          currentPage="revenues"
        />
      )}

      {/* 財務ダッシュボードの期間で絞り込んで来たときの案内（仕様変更 #4） */}
      {filterFrom && (
        <div className="rounded-card border border-border bg-card p-3 text-sub text-secondary-foreground lg:px-4">
          {filterPeriodLabel || `${filterFrom} 〜 ${filterTo}`} で絞り込み中（財務ダッシュボードから）
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <LedgerSearch
          value={search}
          onChange={(v) => { setSearch(v); reset(); }}
          placeholder="GLS番号・案件名・請求先で探す"
        />
        <MonthPicker value={month} onChange={(v) => { setMonth(v); reset(); }} />
      </div>

      <FilterChips
        label="売上の状態で絞り込む"
        items={chips}
        value={chip}
        onChange={(k) => { setChip(k); reset(); }}
      />

      {query.isError ? (
        <ErrorPanel title="売上を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : rows.length === 0 ? (
        appliedSearch ? (
          <NoSearchResults
            keyword={appliedSearch}
            activeFilters={[
              cur.key !== 'all' ? `絞り込み: ${cur.label}` : '',
              month ? `計上月: ${month}` : '',
            ].filter(Boolean)}
            onClearFilters={() => { setSearch(''); setChip('all'); setMonth(''); reset(); }}
          />
        ) : (
          <EmptyState
            title={month ? `${month.replace('-', '年')}月の売上はありません` : '売上がありません'}
            description="案件の売上は、この画面かカレンダーの案件詳細から登録します。"
            action={
              <LatestMonthAction
                month={latestMonth}
                current={month}
                what="売上"
                onJump={(m) => { setMonth(m); reset(); }}
              />
            }
          />
        )
      ) : (
        <>
          <div className="flex flex-col">
            <LedgerRows
              rows={ledgerRows}
              codeLabel="GLS番号 ／ 話数"
              titleLabel="案件"
              partyLabel="請求先"
              stateLabel="請求"
              onOpen={(row) => {
                const full = rows.find((r) => r.id === row.id);
                // 配分グループの売上はこの台帳では編集できない (サーバーが 400 で
                // 止める)。押せるのに 400 にせず、按分ごと直せるグループの画面へ送る
                if (full?.group_id) {
                  navigate(`/sales/project-groups/${full.group_id}`);
                  return;
                }
                if (full) setEditing(canEdit ? full : null);
                if (!canEdit && row.project_id) navigate(`/sales/projects/${row.project_id}`);
              }}
            />
          </div>

          <LedgerFooter
            count={query.data?.pagination?.total ?? rows.length}
            total={query.data?.total_amount ?? 0}
            note="請求の状態（未請求／発行済／入金済）はこの台帳では変えられません。請求書の発行と入金の記録は「見積・請求」だけで行い、ここは結果を映します。状態を押すとその画面に移ります。"
          />

          <Pagination
            page={page}
            totalPages={query.data?.pagination?.totalPages ?? 1}
            total={query.data?.pagination?.total ?? 0}
            onChange={setPage}
            disabled={query.isFetching}
          />
        </>
      )}

      {/* **開くたびに作り直す。** 閉じたときに手で消し忘れた値が次に残らない */}
      {editing && (
        <RevenueDialog
          key={editing === 'new' ? 'new' : editing.id}
          editing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
