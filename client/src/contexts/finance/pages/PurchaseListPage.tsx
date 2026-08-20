/**
 * ④ 仕入（財務管理） (v4)
 *
 * **案件に紐づくものが変動原価、固定原価プロジェクトに付けたものが固定原価**です。
 * 2つは足し合わせる先が違う（変動原価は案件の粗利、固定原価は月の固定費）ので、
 * 同じ一覧に混ぜず**タブで分けます**。
 *
 * ── 「仮」は金額が確定していない見込み ─────────────────────────
 *
 * 精算が通ると確定に変わります。仮のまま月を締めると原価が過小に出るので、
 * 件数をチップに出して**残っていることが分かる**ようにしています。
 *
 * ── 旧実装から直したこと ────────────────────────────────────
 *
 * ・**固定原価を見る場所がありませんでした。** サーバーは `fixed_cost` で
 *   絞れるのに画面から渡していなかったため、変動原価と固定原価が1つの一覧に
 *   混ざったまま「合計」が出ていました（案件の原価と月の固定費の足し算）
 * ・**案件名で検索できませんでした**（売上と同じ抜け）
 * ・**合計はページではなく絞り込み全体**を出します
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, CircleDollarSign, Building2 } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useCrudPage } from '@/hooks/useCrudPage';
import ExcelToolbar from '@/components/ExcelToolbar';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import type { Vendor } from '@/types';
import { LedgerRows } from './ledger/LedgerRows';
import { LedgerFooter, LedgerSearch, MonthPicker } from './ledger/LedgerParts';
import { LedgerTabs } from './ledger/LedgerTabs';
import { PurchaseDialog, type PurchaseProjectOption } from './ledger/PurchaseDialog';
import type { LedgerRow, PurchaseRow } from './ledger/types';

const CHIPS = [
  { key: 'all', label: 'すべて', state: '' },
  { key: 'fixed', label: '確定', state: 'fixed' },
  { key: 'prov', label: '仮（見込み）', state: 'prov' },
  { key: 'nourl', label: '申請URLなし', state: 'nourl' },
];

/** 「仮」かどうか。**確定は印を出さない**（全部に印が付くと印の意味が消える） */
function purchaseState(p: PurchaseRow): LedgerRow['state'] {
  if (p.is_provisional) {
    return { label: '仮', tone: 'warn', title: 'まだ金額が確定していません。精算が通ると確定に変わります' };
  }
  if (p.settlement_url) {
    return { label: '確定', tone: 'ok', to: p.settlement_url, title: '精算ページを開く' };
  }
  return { label: '確定', tone: 'ok', title: '申請URLが登録されていません' };
}

export default function PurchaseListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get('project_id') || '';
  const filterProjectName = searchParams.get('project_name') || '';
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');

  /** `var`=変動原価（案件に付いたもの） / `fix`=固定原価プロジェクト */
  const [tab, setTab] = useState<'var' | 'fix'>('var');
  const [chip, setChip] = useState('all');
  const [month, setMonth] = useState(() => {
    if (searchParams.get('project_id')) return '';
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const cur = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];

  const crud = useCrudPage<PurchaseRow>({
    endpoint: '/purchases',
    queryKey: ['purchases-all'],
    extraParams: {
      project_id: filterProjectId || undefined,
      recognition_month: month || undefined,
      fixed_cost: tab === 'fix' ? '1' : '0',
      state: cur.state || undefined,
    },
  });

  const raw = crud.raw as { total_amount?: number; state_counts?: Record<string, number> } | undefined;
  const counts = raw?.state_counts ?? {};

  // **GLS発番済みではなく「受注確定済み」で絞る**（v4.1.8・矛盾修正）。
  // 受注 (`a_won`) は原則 GLS 番号が自動で付くが、案件分類が未設定の
  // 古いデータでは例外的に番号だけ付かないことがあり、GLS番号の有無を
  // 基準にすると受注済みの案件に仕入を記録できない詰みが起きるため
  const { data: wonProjectsData } = useQuery({
    queryKey: ['won-projects-for-purchase'],
    queryFn: async () => (await api.get('/projects/won-projects')).data,
    enabled: crud.dialogOpen,
  });
  const glsProjects: PurchaseProjectOption[] = wonProjectsData?.data ?? [];

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors?limit=200')).data,
    enabled: crud.dialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  const items = useMemo(() => crud.items ?? [], [crud.items]);
  const ledgerRows: LedgerRow[] = useMemo(
    () => items.map((p) => ({
      id: p.id,
      code: p.episode_code || p.gls_number,
      title: p.description || p.project_name || '（説明なし）',
      // 案件名と按分グループを下に出す。**同じ説明の仕入が並ぶ**ので、
      // どの案件のものか分からないと選べない
      sub: [p.project_name, p.group_name].filter(Boolean).join(' ／ ') || null,
      party: p.vendor_name,
      amount: Number(p.amount) || 0,
      tax_category: p.tax_category,
      recognition_date: p.recognition_date,
      state: purchaseState(p),
      project_id: p.project_id,
    })),
    [items],
  );

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="仕入"
        sub={
          filterProjectName
            ? `${filterProjectName} の仕入`
            : '案件に紐づくものが変動原価、固定原価プロジェクトに付けたものが固定原価です'
        }
        primaryAction={
          canEdit ? (
            <Button onClick={crud.openAdd}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />仕入を登録
            </Button>
          ) : undefined
        }
      >
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExcelToolbar
            resource="/purchases"
            name="仕入"
            queryKey={['purchases']}
            hasDuplicateKey={false}
            exportParams={{
              search: crud.search || undefined,
              project_id: filterProjectId || undefined,
              recognition_month: month || undefined,
              fixed_cost: tab === 'fix' ? '1' : '0',
              state: cur.state || undefined,
            }}
          />
          {/*
            ⚠️ **`/project-groups` ではありません。** 案件管理の下（`/sales/…`）です。
            接頭辞の無い旧 URL はルート表に無く、`<Route path="*">` が拾って
            **黙ってホームに戻ります**（押しても何も起きないように見える）。
          */}
          <Button variant="outline" onClick={() => navigate('/sales/project-groups')}>按分グループ</Button>
        </div>
      </PageHeader>

      {filterProjectId && (
        <ProjectQuickLinks
          projectId={filterProjectId}
          projectName={filterProjectName}
          currentPage="purchases"
        />
      )}

      <LedgerTabs
        value={tab}
        onChange={(v) => { setTab(v as 'var' | 'fix'); crud.setPage(1); }}
        items={[
          { key: 'var', label: '変動原価', icon: <CircleDollarSign className="h-4 w-4" aria-hidden="true" /> },
          { key: 'fix', label: '固定原価', icon: <Building2 className="h-4 w-4" aria-hidden="true" /> },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <LedgerSearch
          value={crud.search}
          onChange={crud.setSearch}
          placeholder="GLS番号・案件名・仕入先・説明で探す"
        />
        <MonthPicker value={month} onChange={(v) => { setMonth(v); crud.setPage(1); }} />
      </div>

      <FilterChips
        label="仕入の状態で絞り込む"
        items={CHIPS.map((c) => ({
          key: c.key,
          label: c.label,
          count: c.state ? (counts[c.state] ?? null) : null,
        }))}
        value={chip}
        onChange={(k) => { setChip(k); crud.setPage(1); }}
      />

      {crud.isError ? (
        <ErrorPanel title="仕入を読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : items.length === 0 ? (
        crud.search ? (
          <NoSearchResults
            keyword={crud.search}
            activeFilters={[
              tab === 'fix' ? '固定原価' : '変動原価',
              cur.key !== 'all' ? `絞り込み: ${cur.label}` : '',
              month ? `計上月: ${month}` : '',
            ].filter(Boolean)}
            onClearFilters={() => { crud.setSearch(''); setChip('all'); setMonth(''); }}
          />
        ) : (
          <EmptyState
            title={tab === 'fix' ? '固定原価がありません' : '変動原価がありません'}
            description={
              tab === 'fix'
                ? '固定原価プロジェクト（FIXED-COGS）に付けた仕入がここに並びます。'
                : '案件に付けた仕入がここに並びます。'
            }
          />
        )
      ) : (
        <>
          <div className="flex flex-col">
            <LedgerRows
              rows={ledgerRows}
              codeLabel="GLS番号 ／ 話数"
              titleLabel="案件 ／ 説明"
              partyLabel="仕入先"
              stateLabel="申請"
              onOpen={(row) => {
                const full = items.find((p) => p.id === row.id);
                if (full && canEdit) crud.openEdit(full);
              }}
            />
          </div>

          <LedgerFooter
            count={crud.pagination?.total ?? items.length}
            total={raw?.total_amount ?? 0}
            note="「仮」は金額が確定していない見込みです。精算が通ると確定に変わります。確定した行の状態を押すと精算ページを開きます（申請URLを入れてあるときだけ）。"
          />

          <Pagination
            page={crud.page}
            totalPages={crud.pagination?.totalPages ?? 1}
            total={crud.pagination?.total ?? 0}
            onChange={crud.setPage}
            disabled={crud.isLoading}
          />
        </>
      )}

      {crud.dialogOpen && (
        <PurchaseDialog
          key={crud.editingItem?.id ?? 'new'}
          editing={crud.editingItem ?? null}
          defaultProjectId={filterProjectId}
          projects={glsProjects}
          vendors={vendors}
          saving={crud.save.isPending}
          deleting={crud.remove.isPending}
          onSave={(payload) => crud.save.mutate(payload)}
          onDelete={(id) => crud.remove.mutate(id, { onSuccess: () => crud.closeDialog() })}
          onClose={crud.closeDialog}
        />
      )}
    </div>
  );
}
