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
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import ExcelToolbar from '@/components/ExcelToolbar';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import { LedgerList } from './ledger/LedgerList';
import { billingState } from './ledger/billingState';
import { LedgerFilterBar } from './ledger/LedgerFilterBar';
import { LedgerTotalBar } from './ledger/LedgerTotalBar';
import { LedgerFooter, LedgerPeriodNotice } from './ledger/LedgerParts';
import { revenueDetailFields } from './ledger/ledgerDetail';
import { useLedgerUrlPeriod } from './ledger/useLedgerUrlPeriod';
import { useLatestDataMonth, LatestMonthAction } from './ledger/LatestDataMonth';
import { RevenueDialog } from './ledger/RevenueDialog';
import type { LedgerRow, RevenueRow } from './ledger/types';

/**
 * 絞り込み。モックの並びのまま。
 * `status` と `state` は別の軸（売上確定/見込み は売上そのもの、発行済/入金待ち は請求の進み具合）
 */
const CHIPS = [
  { key: 'all', label: 'すべて', status: 'all', state: '' },
  { key: 'confirmed', label: '売上確定', status: 'confirmed', state: '' },
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

export default function RevenueListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get('project_id') || '';
  const filterProjectName = searchParams.get('project_name') || '';
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  /*
   * **幅で変わるのはこの画面では3つだけ**（Excel の道具・合計帯の場所・一覧の形）。
   * 一覧の形は `LedgerList` が自分で分けるので、ここで見るのは前の2つ。
   * 部品の中で分岐させない（`client/CLAUDE.md`「スマホ」）決めごとに合わせて、
   * 判定は `useIsMobile()` 1本にする
   */
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  /*
   * ⚠️ **この画面は `useCrudPage` を使っていない**（自前の `useQuery`）ので、
   * フックを直しただけでは効かない。仕入・販管費と同じ形をここにも入れる。
   * 遅らせるのは**問い合わせに渡す値だけ**で、入力欄は `search`（即時）のまま。
   */
  const appliedSearch = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [chip, setChip] = useState('confirmed');
  /*
   * 計上月と、財務ダッシュボードから引き継いだ期間（仕様変更 #4）。
   * **単月で来たら計上月の欄に入り、月に収まらない期間は `range` で持つ**（排他）。
   * 理由と変換規則は `ledger/ledgerUrlPeriod.ts`（3台帳で共通）。
   */
  const period = useLedgerUrlPeriod(searchParams);
  const { month, range, setMonth } = period;

  /** 開いているダイアログ。`'new'` は新規、行なら編集 */
  const [editing, setEditing] = useState<RevenueRow | 'new' | null>(null);

  const cur = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];

  const query = useQuery<RevenueListResponse>({
    queryKey: ['revenues-all', page, appliedSearch, filterProjectId, month, cur.status, cur.state, range?.from ?? '', range?.to ?? ''],
    // ⚠️ `signal` を渡す（渡さないと、絞り込みを変えても前の重い通信が走り続ける）
    queryFn: async ({ signal }) => {
      const params: Record<string, string | number> = { page, limit: 20, status: cur.status };
      if (appliedSearch) params.search = appliedSearch;
      if (filterProjectId) params.project_id = filterProjectId;
      if (month) params.recognition_month = month;
      // 月に収まらない期間で来たときだけ from/to を送る。**月とは排他**
      // （サーバーは AND で合成するので、両方送ると交差して0件になる）
      if (range) { params.recognition_from = range.from; params.recognition_to = range.to; }
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
      // スマホの詳細シートに出す項目（PC は読まない）。**`useMemo` の外に出さない** —
      // 出すと20行ぶんを毎レンダリング作り直すことになる（`types.ts` の `detail`）
      detail: revenueDetailFields(r),
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
        {/*
          **Excel の取込・書き出しはスマホに出さない。** 取り込みは台帳に行を
          入れる操作で、途中で止まると二重に入る（取り消せない）。ファイル選択
          そのものもスマホでは実用にならない（`/budget/vendors` で落とした前例）
        */}
        {!isMobile && (
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
                recognition_from: range?.from,
                recognition_to: range?.to,
                status: cur.status,
                state: cur.state || undefined,
              }}
            />
          </div>
        )}
      </PageHeader>

      {filterProjectId && (
        <ProjectQuickLinks
          projectId={filterProjectId}
          projectName={filterProjectName}
          currentPage="revenues"
        />
      )}

      {/* 財務ダッシュボードの期間で絞り込んで来たときの案内（仕様変更 #4） */}
      <LedgerPeriodNotice period={period} />

      {/*
        PC は「検索欄 ＋ 計上月 ＋ チップの帯」、スマホは検索欄と「絞り込み」1つに
        畳む。**効いている数の数え方は部品が持つ**（3画面に書くと必ず数え漏らし、
        絞り込んでいることを忘れたまま「件数が少ない」と読むことになる）
      */}
      <LedgerFilterBar
        search={{
          // 入力欄の値は即時。**遅らせるのは問い合わせに渡す値だけ**（`appliedSearch`）
          value: search,
          onChange: (v) => { setSearch(v); reset(); },
          placeholder: 'GLS番号・案件名・請求先で探す',
        }}
        month={month}
        onMonth={(v) => { setMonth(v); reset(); }}
        period={period}
        onClearAll={() => { setChip('confirmed'); setMonth(''); period.clearPeriod(); reset(); }}
        groups={[{
          key: 'state',
          label: '売上の状態で絞り込む',
          sheetLabel: '状態',
          items: chips,
          value: chip,
          defaultValue: 'confirmed',
          onChange: (k) => { setChip(k); reset(); },
        }]}
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
              // 期間で絞り込んで来たときも「なぜ0件か」が読めるようにする
              range ? `期間: ${range.label || range.from}` : '',
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
          {/*
            スマホは合計を**上に貼り付ける**（台帳は「いくらあるか」を見に来る
            画面なので、スクロールで消えると読み直しになる）。PC は今までどおり
            いちばん下の `LedgerFooter` が持つ
          */}
          {isMobile && (
            <LedgerTotalBar
              count={query.data?.pagination?.total ?? rows.length}
              total={query.data?.total_amount ?? 0}
            />
          )}

          <div className="flex flex-col">
            <LedgerList
              rows={ledgerRows}
              codeLabel="GLS番号 ／ 話数"
              titleLabel="案件"
              itemLabel="売上"
              partyLabel="請求先"
              stateLabel="請求"
              canEdit={canEdit}
              onRefresh={query.refetch}
              onProject={(row) => { if (row.project_id) navigate(`/sales/projects/${row.project_id}`); }}
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

          {/*
            注記の**最後の1文だけ幅で変える**。PC は状態のバッジそのものが押せるが、
            スマホはカード全体が1つのボタンなので入れ子にできず、行き先は詳細シートの
            下端に集めてある。同じ文言のままだと「押しても動かない」と読まれる
          */}
          <LedgerFooter
            count={query.data?.pagination?.total ?? rows.length}
            total={query.data?.total_amount ?? 0}
            hideTotals={isMobile}
            note={`請求の状態（未請求／発行済／入金済）はこの台帳では変えられません。請求書の発行と入金の記録は「見積・請求」だけで行い、ここは結果を映します。${
              isMobile ? '行を押すと詳しい内容と「請求・入金をひらく」が出ます。' : '状態を押すとその画面に移ります。'
            }`}
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
