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
 *
 * ── スマホ（v4ネイティブUI化・2026-09）──────────────────────
 *
 * 一覧の形は `LedgerList` が幅で分けます（PC は表・スマホはカード）。
 * この画面が幅を見るのは**3つだけ**: Excel の道具・合計帯の場所・
 * ダイアログの「消す」。**販管費は案件に紐づかない**ので `onProject` は
 * 渡しません（詳細シートに「案件をひらく」が出ない＝行き止まりを作らない）。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useCrudPage } from '@/hooks/useCrudPage';
import ExcelToolbar from '@/components/ExcelToolbar';
import type { Vendor } from '@/types';
import SgaDialog, { type SgaFormData, initialFormData } from '../components/SgaDialog';
import { formFromSga } from '../components/sgaPrefill';
import { LedgerList } from './ledger/LedgerList';
import { LedgerFilterBar } from './ledger/LedgerFilterBar';
import { LedgerTotalBar } from './ledger/LedgerTotalBar';
import { LedgerFooter, LedgerPeriodNotice } from './ledger/LedgerParts';
import { useLedgerUrlPeriod } from './ledger/useLedgerUrlPeriod';
import { useLatestDataMonth, LatestMonthAction } from './ledger/LatestDataMonth';
/*
 * **この画面に残すのは「どう並べるか」だけ。** 行の詰め替え・絞り込みの2軸・
 * 詳細シートの項目は `ledger/ledgerDetail.tsx`（同じ値を別の場所に出しているだけ
 * なので、離すと必ず片方だけ直る。1ファイル400行の上限もある）
 */
import {
  sgaChipOf, sgaFilterGroups, sgaLedgerRows,
} from './ledger/sgaLedgerRows';
import type { SgaLedgerItem } from './ledger/types';
import { useEntityFilter, entityFilterGroup } from './shared/entityFilter';

export default function SgaListPage() {
  const { currentUser, hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  // 幅の判定は `useIsMobile()` 1本（部品の中で分岐させない・`client/CLAUDE.md`「スマホ」）
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [chip, setChip] = useState('all');
  /*
   * 計上月と、財務ダッシュボードから引き継いだ期間（仕様変更 #4）。
   * **単月で来たら計上月の欄に入り、月に収まらない期間は `range` で持つ**（排他）。
   * 理由と変換規則は `ledger/ledgerUrlPeriod.ts`（3台帳で共通。販管費は案件に
   * 紐づかないので `project_id` は元から受け取らない＝そこだけ効かない）。
   */
  const period = useLedgerUrlPeriod(searchParams);
  const { month, range, setMonth } = period;
  const { entity, setEntity, options: entityOptions } = useEntityFilter(); // `?entity=` が正。省略=全社合算

  const cur = sgaChipOf(chip);

  /** 勘定科目の絞り込み。空 = すべて ／ `none` = 科目が入っていない行 */
  const [titleKey, setTitleKey] = useState('');

  const { data: titlesData } = useQuery({
    queryKey: ['sga-account-titles'],
    queryFn: async () => (await api.get('/sga/account-titles')).data.data as { id: string; name: string }[],
    staleTime: 60 * 60 * 1000,
  });
  const titles = useMemo(() => titlesData ?? [], [titlesData]);

  const crud = useCrudPage<SgaLedgerItem>({
    endpoint: '/sga',
    queryKey: ['sga-list'],
    extraParams: {
      source: cur.source || undefined,
      expense_type: cur.expense_type || undefined,
      account_title_id: titleKey || undefined,
      recognition_month: month || undefined,
      // 月に収まらない期間で来たときだけ送る。**月とは排他**
      // （サーバーは AND で合成するので、両方送ると交差して0件になる）
      recognition_from: range?.from,
      recognition_to: range?.to,
      entity_code: entity || undefined, // `buildSgaBaseWhere` が絞り込む（P2 Round 1・並行実装済み）
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
  const openFor = (item: SgaLedgerItem | null) => {
    if (item) {
      // マッピングは `SgaDialog.tsx` の `formFromSga`（財務ダッシュボードの
      // 閲覧専用ダイアログと共用・仕様変更 #3）
      setForm(formFromSga(item, currentUser?.id ?? ''));
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
      const row = (await api.get(`/sga/${editParam}`)).data?.data as SgaLedgerItem | undefined;
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
      is_provisional: form.is_provisional,
    });
  };

  const handleDelete = async (id: string) => {
    const item = crud.items.find((i) => i.id === id);
    const ok = await confirmAction({
      title: 'この販管費を削除しますか',
      description: `${item?.vendor_name ?? '支払先なし'}「${item?.description ?? '詳細なし'}」を削除します。元に戻せません。`,
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) crud.remove.mutate(id);
  };

  const items = useMemo(() => crud.items ?? [], [crud.items]);
  // **必ず `useMemo` の中で作る** — 詳細シートの項目まで一緒に組み立てるので、
  // 外に出すと20行ぶんを毎レンダリング作り直すことになる（`ledger/types.ts` の `detail`）
  const ledgerRows = useMemo(() => sgaLedgerRows(items), [items]);

  // 0件のときだけ「どの月なら販管費があるか」を引く（今の絞り込みのまま）
  const latestMonth = useLatestDataMonth('/sga', {
    enabled: !crud.isLoading && items.length === 0 && !crud.appliedSearch,
    params: {
      source: cur.source || undefined,
      expense_type: cur.expense_type || undefined,
      account_title_id: titleKey || undefined,
      entity_code: entity || undefined,
    },
  });

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
        {/*
          **Excel の取込・書き出しはスマホに出さない。** 取り込みは台帳に行を
          入れる操作で、途中で止まると二重に入る（取り消せない）。ファイル選択
          そのものもスマホでは実用にならない（`/budget/vendors` で落とした前例）
        */}
        {!isMobile && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <ExcelToolbar
              resource="/sga-expenses"
              name="販管費"
              queryKey={['sga-list']}
              hasDuplicateKey={false}
              exportParams={{
                search: crud.appliedSearch || undefined,  // 画面の結果と書き出しの中身を揃える
                source: cur.source || undefined,
                expense_type: cur.expense_type || undefined,
                account_title_id: titleKey || undefined,  // 科目で絞ったまま書き出す
                recognition_month: month || undefined,
                recognition_from: range?.from,
                recognition_to: range?.to,
                entity_code: entity || undefined,
              }}
            />
          </div>
        )}
      </PageHeader>

      {/* 財務ダッシュボードの期間で絞り込んで来たときの案内（仕様変更 #4） */}
      <LedgerPeriodNotice period={period} />

      {/*
        PC は「検索欄 ＋ 発生月 ＋ チップの帯2本」、スマホは検索欄と「絞り込み」1つに
        畳む。**効いている数の数え方は部品が持つ**（3画面に書くと必ず数え漏らし、
        絞り込んでいることを忘れたまま「件数が少ない」と読むことになる）。
        販管費は軸が2つ（種類・勘定科目）あるので、**畳んだときの数え漏らしが
        いちばん起きやすい画面**でもある
      */}
      <LedgerFilterBar
        search={{ value: crud.search, onChange: crud.setSearch, placeholder: '支払先・詳細で探す' }}
        month={month}
        onMonth={(v) => { setMonth(v); crud.setPage(1); }}
        period={period}
        onClearAll={() => {
          setChip('all'); setTitleKey(''); setMonth(''); setEntity(''); period.clearPeriod(); crud.setPage(1);
        }}
        groups={[...sgaFilterGroups({
          chip,
          onChip: (k) => { setChip(k); crud.setPage(1); },
          titleKey,
          onTitle: (k) => { setTitleKey(k); crud.setPage(1); },
          counts,
          titleCounts,
          titles,
        }), entityFilterGroup({ entity, setEntity, options: entityOptions })]}
      />

      {crud.isError ? (
        <ErrorPanel title="販管費を読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : items.length === 0 ? (
        crud.appliedSearch ? (
          <NoSearchResults
            keyword={crud.appliedSearch}
            activeFilters={[
              cur.key !== 'all' ? `絞り込み: ${cur.label}` : '',
              titleKey ? `勘定科目: ${titleKey === 'none' ? '未設定' : (titles.find((t) => t.id === titleKey)?.name ?? '')}` : '',
              month ? `発生月: ${month}` : '',
              // 期間で絞り込んで来たときも「なぜ0件か」が読めるようにする
              range ? `期間: ${range.label || range.from}` : '',
            ].filter(Boolean)}
            // ⚠️ 勘定科目も外す。**上の一覧に「勘定科目: 通信費」と出しているのに
            //    外れないと、押しても0件のままで「壊れている」と読まれる**
            onClearFilters={() => { crud.setSearch(''); setChip('all'); setTitleKey(''); setMonth(''); setEntity(''); }}
          />
        ) : (
          <EmptyState
            title={month ? `${month.replace('-', '年')}月の販管費はありません` : '販管費がありません'}
            description="社員が入れたものと、経理が取り込んだものの両方がここに並びます。"
            action={
              <LatestMonthAction
                month={latestMonth}
                current={month}
                what="販管費"
                onJump={(m) => { setMonth(m); crud.setPage(1); }}
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
              count={crud.pagination?.total ?? items.length}
              total={raw?.total_amount ?? 0}
            />
          )}

          <div className="flex flex-col">
            <LedgerList
              rows={ledgerRows}
              codeLabel="精算番号"
              titleLabel="詳細"
              itemLabel="販管費"
              partyLabel="支払先"
              stateLabel="申請"
              canEdit={canEdit}
              onRefresh={crud.refetch}
              /* `onProject` は渡さない — 販管費は案件を持たないので、
                 詳細シートに「案件をひらく」を出すと行き止まりになる */
              onOpen={(row) => {
                const full = items.find((i) => i.id === row.id);
                if (full && canEdit) openFor(full);
              }}
            />
          </div>

          {/*
            注記の**最後の1文だけ幅で変える**。PC は行の申請URLのボタンが押せるが、
            スマホはカード全体が1つのボタンなので入れ子にできず、行き先は詳細シートの
            下端に集めてある。同じ文言のままだと「押しても動かない」と読まれる
          */}
          <LedgerFooter
            count={crud.pagination?.total ?? items.length}
            total={raw?.total_amount ?? 0}
            hideTotals={isMobile}
            note={`販管費は案件に紐づきません。ダッシュボードで案件を絞り込むと集計から外れます。「仮」は金額が確定していない見込みで、精算番号が入ると「申請済」になります。${
              isMobile
                ? '行を押すと勘定科目・支払期日が読め、申請URLのある行は「精算ページをひらく」が出ます。'
                : '申請URLを入れてある行は外部リンクのボタンから精算ページを開けます。'
            }`}
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
        /*
         * **消すのはスマホに出さない。** 元に戻せない操作で、確認を1つ挟んでいても
         * 指では2つ続けて押しやすい（`MobileCollect` の「取り消しはここに置かない・
         * 記録が残る場所でやる」と同じ考え方）。消すのは PC から
         */
        onDelete={isMobile ? undefined : handleDelete}
        onClose={crud.closeDialog}
      />
    </div>
  );
}
