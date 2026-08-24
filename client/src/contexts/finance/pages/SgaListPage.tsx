/**
 * ⑤ 販管費（財務管理） (v4)
 *
 * **案件に紐づかない費用**です。ダッシュボードでは最後に引かれます。
 *
 * ── 勘定科目で絞れます（migration 166）──────────────────────
 *
 * モックどおり 通信費／地代家賃／旅費交通費／その他 で絞れます。
 * 科目は**マスター表**（`sga_account_titles`）から取るので、増やすときは
 * マイグレーションではなくデータを足すだけで済みます
 * （会計側で科目が増えた月に取り込みが全部落ちる、を避けるため）。
 *
 * **166 より前の行は科目を持ちません。** どの科目だったかはどこにも残っていないので
 * 埋めていません（埋めると作り話になる）。「未設定」のチップで探せます。
 *
 * 固定費／都度・社員／経理の絞り込みも残しています — 科目とは別の軸で、
 * どちらも経理が使います。
 *
 * ── 一覧の左端 ────────────────────────────────────────────
 *
 * **精算番号**を出します（旧実装もそうでした）。
 * 経理が楽楽精算の番号で突き合わせるので、ここに無いと画面を行き来します。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useCrudPage } from '@/hooks/useCrudPage';
import ExcelToolbar from '@/components/ExcelToolbar';
import type { SgaExpense, Vendor } from '@/types';
import SgaDialog, { type SgaFormData, initialFormData } from '../components/SgaDialog';
import { LedgerRows } from './ledger/LedgerRows';
import { LedgerFooter, LedgerSearch, MonthPicker } from './ledger/LedgerParts';
import type { LedgerRow } from './ledger/types';

/** 科目とは別の軸。**どちらも経理が使う**ので両方残す */
const CHIPS = [
  { key: 'all', label: 'すべて', expense_type: '', source: '', count: 'all' },
  { key: 'fixed', label: '固定費', expense_type: 'fixed', source: '', count: 'fixed' },
  { key: 'spot', label: '都度', expense_type: 'spot', source: '', count: 'spot' },
  { key: 'staff', label: '社員が入れた', expense_type: '', source: 'staff', count: 'staff' },
  { key: 'accounting', label: '経理の取込', expense_type: '', source: 'accounting', count: 'accounting' },
];

/** 按分中 > 固定 > 都度 の順に1つだけ出す（3つ並べると何が要点か分からない） */
function sgaState(item: SgaExpense): LedgerRow['state'] {
  if (item.amortize_start) {
    // 期間は「から/まで」で書く（`〜` の手打ちは `DateRange` を使う決めごとに反する）
    const to = item.amortize_end ? `${item.amortize_end} まで` : '終わり未定';
    return { label: '按分中', tone: 'info', title: `${item.amortize_start} から ${to} で分けています` };
  }
  if (item.expense_type === 'fixed') return { label: '固定', tone: 'ok', title: '毎月かかる費用' };
  return { label: '都度', tone: 'neutral', title: 'その都度の費用' };
}

export default function SgaListPage() {
  const { currentUser, hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const [searchParams] = useSearchParams();

  const [chip, setChip] = useState('all');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const cur = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];

  /** 勘定科目の絞り込み。空 = すべて ／ `none` = 科目が入っていない行 */
  const [titleKey, setTitleKey] = useState('');

  const { data: titlesData } = useQuery({
    queryKey: ['sga-account-titles'],
    queryFn: async () => (await api.get('/sga/account-titles')).data.data as { id: string; name: string }[],
    staleTime: 60 * 60 * 1000,
  });
  const titles = useMemo(() => titlesData ?? [], [titlesData]);

  const crud = useCrudPage<SgaExpense>({
    endpoint: '/sga',
    queryKey: ['sga-list'],
    extraParams: {
      source: cur.source || undefined,
      expense_type: cur.expense_type || undefined,
      account_title_id: titleKey || undefined,
      recognition_month: month || undefined,
    },
  });

  const raw = crud.raw as {
    total_amount?: number;
    state_counts?: Record<string, number>;
    account_title_counts?: Record<string, number>;
  } | undefined;
  const counts = raw?.state_counts ?? {};
  const titleCounts = raw?.account_title_counts ?? {};

  const [form, setForm] = useState<SgaFormData>(initialFormData);

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list-sga'],
    queryFn: async () => (await api.get('/vendors?limit=200&sga_payee_only=true')).data,
    enabled: crud.dialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users?limit=200')).data,
    enabled: crud.dialogOpen,
  });
  const users = usersData?.data ?? [];

  /** ダイアログを開く。**開くときに詰める** — 閉じたときに消し忘れる形をやめた */
  const openFor = (item: SgaExpense | null) => {
    if (item) {
      setForm({
        vendor_name: item.vendor_name ?? '',
        vendor_id: item.vendor_id ?? '',
        tax_category: item.tax_category ?? 'tax10',
        recognition_date: item.recognition_date?.slice(0, 10) ?? '',
        settlement_method: item.settlement_method ?? 'xpoint',
        settlement_number: item.settlement_number === 'pending' ? '' : (item.settlement_number ?? ''),
        settlement_number_pending: item.settlement_number === 'pending',
        settlement_url: item.settlement_url ?? '',
        amount: item.amount ?? 0,
        description: item.description ?? '',
        notes: item.notes ?? '',
        invoice_qualified: item.invoice_qualified ?? true,
        payment_due_date: item.payment_due_date?.slice(0, 10) ?? '',
        assigned_to: item.assigned_to ?? currentUser?.id ?? '',
        expense_type: item.expense_type ?? 'spot',
        account_title_id: (item as { account_title_id?: string | null }).account_title_id ?? '',
        amortize_enabled: !!item.amortize_start,
        amortize_start: item.amortize_start ?? '',
        amortize_end: item.amortize_end ?? '',
        source: item.source || 'staff',
      });
      crud.openEdit(item);
    } else {
      setForm({ ...initialFormData, assigned_to: currentUser?.id ?? '' });
      crud.openAdd();
    }
  };

  // 財務ダッシュボード等から ?edit={id} で来たら、その販管費を開く
  const editParam = searchParams.get('edit');
  useQuery({
    queryKey: ['sga-open-edit', editParam],
    queryFn: async () => {
      const row = (await api.get(`/sga/${editParam}`)).data?.data as SgaExpense | undefined;
      if (row) openFor(row);
      return row ?? null;
    },
    enabled: !!editParam,
    staleTime: Infinity,
  });

  const handleSubmit = () => {
    crud.save.mutate({
      vendor_name: form.vendor_name,
      vendor_id: form.vendor_id || null,
      tax_category: form.tax_category,
      recognition_date: form.recognition_date || null,
      settlement_method: form.settlement_method,
      settlement_number: form.settlement_number || null,
      settlement_url: form.settlement_url || null,
      amount: form.amount,
      description: form.description || null,
      notes: form.notes || null,
      invoice_qualified: form.invoice_qualified,
      payment_due_date: form.payment_due_date || null,
      assigned_to: form.assigned_to || null,
      expense_type: form.expense_type,
      account_title_id: form.account_title_id || null,
      amortize_start:
        form.expense_type === 'spot' && form.amortize_enabled && form.amortize_start
          ? form.amortize_start : null,
      amortize_end:
        form.expense_type === 'spot' && form.amortize_enabled && form.amortize_end
          ? form.amortize_end : null,
      source: form.source,
    });
  };

  const handleDelete = async (id: string) => {
    const item = crud.items.find((i) => i.id === id);
    const ok = await confirmAction({
      title: 'この販管費を消しますか',
      description: `${item?.vendor_name ?? '支払先なし'}「${item?.description ?? '詳細なし'}」を消します。元に戻せません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) crud.remove.mutate(id);
  };

  const items = useMemo(() => crud.items ?? [], [crud.items]);
  const ledgerRows: LedgerRow[] = useMemo(
    () => items.map((item) => ({
      id: item.id,
      // 勘定科目の列が無いので精算番号を出す（`pending` は「番号待ち」）
      code: item.settlement_number === 'pending' ? '番号待ち' : item.settlement_number,
      title: item.description || '（詳細なし）',
      sub: null,
      party: item.vendor_name,
      amount: Number(item.amount) || 0,
      tax_category: item.tax_category,
      recognition_date: item.recognition_date,
      state: sgaState(item),
      project_id: null,
    })),
    [items],
  );

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="販管費"
        sub="案件に紐づかない費用です。ダッシュボードでは最後に引かれます"
        primaryAction={
          canEdit ? (
            <Button onClick={() => openFor(null)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />販管費を登録
            </Button>
          ) : undefined
        }
      >
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExcelToolbar
            resource="/sga-expenses"
            name="販管費"
            queryKey={['sga-list']}
            hasDuplicateKey={false}
            exportParams={{
              search: crud.search || undefined,
              source: cur.source || undefined,
              expense_type: cur.expense_type || undefined,
              recognition_month: month || undefined,
            }}
          />
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <LedgerSearch
          value={crud.search}
          onChange={crud.setSearch}
          placeholder="支払先・詳細で探す"
        />
        <MonthPicker value={month} onChange={(v) => { setMonth(v); crud.setPage(1); }} />
      </div>

      <FilterChips
        label="販管費の種類で絞り込む"
        items={CHIPS.map((c) => ({
          key: c.key,
          label: c.label,
          count: counts[c.count] ?? null,
        }))}
        value={chip}
        onChange={(k) => { setChip(k); crud.setPage(1); }}
      />

      {/* 勘定科目（migration 166）。**「未設定」は 166 より前の行**で、
          どの科目だったか記録が無い。数えられるので隠さない */}
      <FilterChips
        label="勘定科目で絞り込む"
        items={[
          { key: '', label: '科目すべて', count: counts.all ?? null },
          ...titles.map((t) => ({ key: t.id, label: t.name, count: titleCounts[t.id] ?? 0 })),
          { key: 'none', label: '未設定', count: titleCounts.none ?? 0 },
        ]}
        value={titleKey}
        onChange={(k) => { setTitleKey(k); crud.setPage(1); }}
      />

      {crud.isError ? (
        <ErrorPanel title="販管費を読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : items.length === 0 ? (
        crud.search ? (
          <NoSearchResults
            keyword={crud.search}
            activeFilters={[
              cur.key !== 'all' ? `絞り込み: ${cur.label}` : '',
              titleKey ? `勘定科目: ${titleKey === 'none' ? '未設定' : (titles.find((t) => t.id === titleKey)?.name ?? '')}` : '',
              month ? `発生月: ${month}` : '',
            ].filter(Boolean)}
            onClearFilters={() => { crud.setSearch(''); setChip('all'); setMonth(''); }}
          />
        ) : (
          <EmptyState
            title={month ? `${month.replace('-', '年')}月の販管費はありません` : '販管費がありません'}
            description="社員が入れたものと、経理が取り込んだものの両方がここに並びます。"
          />
        )
      ) : (
        <>
          <div className="flex flex-col">
            <LedgerRows
              rows={ledgerRows}
              codeLabel="精算番号"
              titleLabel="詳細"
              partyLabel="支払先"
              stateLabel="種類"
              onOpen={(row) => {
                const full = items.find((i) => i.id === row.id);
                if (full && canEdit) openFor(full);
              }}
            />
          </div>

          <LedgerFooter
            count={crud.pagination?.total ?? items.length}
            total={raw?.total_amount ?? 0}
            note="販管費は案件に紐づきません。ダッシュボードで案件を絞り込むと集計から外れます。モックにある勘定科目での絞り込みは、その列がまだ無いため入れていません。"
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

      <SgaDialog
        open={crud.dialogOpen}
        onOpenChange={(v) => { if (!v) crud.closeDialog(); else crud.setDialogOpen(v); }}
        form={form}
        setForm={setForm}
        vendors={vendors}
        users={users}
        accountTitles={titles}
        editingId={crud.editingItem?.id ?? null}
        isSaving={crud.save.isPending}
        isDeleting={crud.remove.isPending}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onClose={crud.closeDialog}
      />
    </div>
  );
}
