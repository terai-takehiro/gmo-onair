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
 *
 * ── スマホ（1023px 以下）─────────────────────────────────────
 *
 * 表を縮めるのではなくカードに替えます（`LedgerList` が幅の分岐を1か所で持ち、
 * **金額だけは畳まず**右端のレールで桁をそろえる）。変動原価／固定原価の
 * 切り替えは**絞り込みではなく別の集合**なので畳まず外に出したままにし、
 * 申請URLはカードでは**印だけ**にして、開くのは詳細シートからにしています
 * （カードの中に入れ子のリンク・ボタンを置かないため）。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, CircleDollarSign, Building2 } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useCrudPage } from '@/hooks/useCrudPage';
import ExcelToolbar from '@/components/ExcelToolbar';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import type { Vendor } from '@/types';
import { LedgerList } from './ledger/LedgerList';
import { LedgerFilterBar } from './ledger/LedgerFilterBar';
import { LedgerTotalBar } from './ledger/LedgerTotalBar';
import { LedgerFooter, LedgerPeriodNotice } from './ledger/LedgerParts';
import { purchaseDetailFields } from './ledger/ledgerDetail';
import { useLedgerUrlPeriod } from './ledger/useLedgerUrlPeriod';
import { useLatestDataMonth, LatestMonthAction } from './ledger/LatestDataMonth';
import { LedgerTabs } from './ledger/LedgerTabs';
import { PurchaseDialog, type PurchaseProjectOption } from './ledger/PurchaseDialog';
import { settlementState } from './ledger/settlementState';
import type { LedgerRow, PurchaseRow } from './ledger/types';

const CHIPS = [
  { key: 'all', label: 'すべて', state: '' },
  { key: 'fixed', label: '確定', state: 'fixed' },
  { key: 'prov', label: '仮（見込み）', state: 'prov' },
  { key: 'nourl', label: '申請URLなし', state: 'nourl' },
];

/**
 * 申請ステータス（仮 / 確定：未申請 / 確定：申請済）。**販管費と共通のロジック**
 * （`ledger/settlementState.ts`）。申請URLへの遷移はこのバッジではなく
 * 台帳の行・ダイアログの別ボタン（外部リンクアイコン）で行う（仕様変更 #4・#6・#7）
 */
function purchaseState(p: PurchaseRow): LedgerRow['state'] {
  return settlementState(p.is_provisional, p.settlement_number);
}

export default function PurchaseListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get('project_id') || '';
  const filterProjectName = searchParams.get('project_name') || '';
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  /*
   * **幅で変わるのはこの画面では3つだけ**（Excel の道具・合計帯の場所・注記の
   * 最後の1文）。一覧と絞り込みの形は `LedgerList` / `LedgerFilterBar` が
   * 自分で分ける。部品の中で分岐させない（`client/CLAUDE.md`「スマホ」）
   * 決めごとに合わせて、判定は `useIsMobile()` 1本にする
   */
  const isMobile = useIsMobile();

  /** `var`=変動原価（案件に付いたもの） / `fix`=固定原価プロジェクト */
  const [tab, setTab] = useState<'var' | 'fix'>('var');
  const [chip, setChip] = useState('all');
  /*
   * 計上月と、財務ダッシュボードから引き継いだ期間（仕様変更 #4）。
   * **単月で来たら計上月の欄に入り、月に収まらない期間は `range` で持つ**（排他）。
   * 理由と変換規則は `ledger/ledgerUrlPeriod.ts`（3台帳で共通）。
   */
  const period = useLedgerUrlPeriod(searchParams);
  const { month, range, setMonth } = period;

  const cur = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];

  const crud = useCrudPage<PurchaseRow>({
    endpoint: '/purchases',
    queryKey: ['purchases-all'],
    extraParams: {
      project_id: filterProjectId || undefined,
      recognition_month: month || undefined,
      // 月に収まらない期間で来たときだけ送る。**月とは排他**
      // （サーバーは AND で合成するので、両方送ると交差して0件になる）
      recognition_from: range?.from,
      recognition_to: range?.to,
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

  // 財務ダッシュボード等から ?edit={id} で来たら、その仕入の編集ダイアログを直接開く
  // （`SgaListPage.tsx` と同じ形。一覧のページには乗っていない行でも開けるよう、
  // 一覧とは別に単体で取得する）
  const editParam = searchParams.get('edit');
  useQuery({
    queryKey: ['purchase-open-edit', editParam],
    queryFn: async () => {
      const row = (await api.get(`/purchases/${editParam}`)).data?.data as PurchaseRow | undefined;
      if (row && canEdit) crud.openEdit(row);
      return row ?? null;
    },
    enabled: !!editParam,
    staleTime: Infinity,
  });

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
      settlement_url: p.settlement_url,
      // スマホの詳細シートに出す項目（PC は読まない）。**`useMemo` の外に出さない** —
      // 出すと20行ぶんを毎レンダリング作り直すことになる（`ledger/types.ts` の `detail`）
      detail: purchaseDetailFields(p),
    })),
    [items],
  );

  // 0件のときだけ「どの月なら仕入があるか」を引く（今の絞り込みのまま）
  const latestMonth = useLatestDataMonth('/purchases', {
    enabled: !crud.isLoading && items.length === 0 && !crud.appliedSearch,
    params: {
      fixed_cost: tab === 'fix' ? '1' : '0',
      state: cur.state || undefined,
      project_id: filterProjectId || undefined,
    },
  });

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
          {/*
            **Excel の取込・書き出しはスマホに出さない。** 取り込みは台帳に行を
            入れる操作で、途中で止まると二重に入る（取り消せない）。ファイル選択
            そのものもスマホでは実用にならない（`/budget/vendors` で落とした前例）
          */}
          {!isMobile && (
            <ExcelToolbar
              resource="/purchases"
              name="仕入"
              queryKey={['purchases-all']}
              hasDuplicateKey={false}
              exportParams={{
                search: crud.appliedSearch || undefined,  // 画面の結果と書き出しの中身を揃える
                project_id: filterProjectId || undefined,
                recognition_month: month || undefined,
                recognition_from: range?.from,
                recognition_to: range?.to,
                fixed_cost: tab === 'fix' ? '1' : '0',
                state: cur.state || undefined,
              }}
            />
          )}
          {/*
            **「按分グループ」はスマホにも残す。** 行き先の一覧
            （`/sales/project-groups`）はスマホで開ける画面なので行き止まりにならない
            （`/budget/vendors` の「仕入先集計」を落とした理由は行き先が PC 専用だから）。
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

      {/* 財務ダッシュボードの期間で絞り込んで来たときの案内（仕様変更 #4） */}
      <LedgerPeriodNotice period={period} />

      <LedgerTabs
        value={tab}
        onChange={(v) => { setTab(v as 'var' | 'fix'); crud.setPage(1); }}
        items={[
          { key: 'var', label: '変動原価', icon: <CircleDollarSign className="h-4 w-4" aria-hidden="true" /> },
          { key: 'fix', label: '固定原価', icon: <Building2 className="h-4 w-4" aria-hidden="true" /> },
        ]}
      />

      {/*
        PC は「検索欄 ＋ 計上月 ＋ チップの帯」、スマホは検索欄と「絞り込み」1つに
        畳む。**効いている数の数え方は部品が持つ**（3画面に書くと必ず数え漏らし、
        絞り込んでいることを忘れたまま「件数が少ない」と読むことになる）。
        入力欄の値は即時で、遅らせるのは問い合わせに渡す値だけ（`useCrudPage` の中）
      */}
      <LedgerFilterBar
        search={{
          value: crud.search,
          onChange: crud.setSearch,  // `setSearch` がページを1に戻す
          placeholder: 'GLS番号・案件名・仕入先・説明で探す',
        }}
        month={month}
        onMonth={(v) => { setMonth(v); crud.setPage(1); }}
        period={period}
        onClearAll={() => { setChip('all'); setMonth(''); period.clearPeriod(); crud.setPage(1); }}
        groups={[{
          key: 'state',
          label: '仕入の状態で絞り込む',
          sheetLabel: '申請ステータス',
          items: CHIPS.map((c) => ({
            key: c.key,
            label: c.label,
            count: c.state ? (counts[c.state] ?? null) : null,
          })),
          value: chip,
          defaultValue: 'all',
          onChange: (k) => { setChip(k); crud.setPage(1); },
        }]}
      />

      {crud.isError ? (
        <ErrorPanel title="仕入を読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : items.length === 0 ? (
        crud.appliedSearch ? (
          <NoSearchResults
            keyword={crud.appliedSearch}
            activeFilters={[
              tab === 'fix' ? '固定原価' : '変動原価',
              cur.key !== 'all' ? `絞り込み: ${cur.label}` : '',
              month ? `計上月: ${month}` : '',
              // 期間で絞り込んで来たときも「なぜ0件か」が読めるようにする
              range ? `期間: ${range.label || range.from}` : '',
            ].filter(Boolean)}
            onClearFilters={() => { crud.setSearch(''); setChip('all'); setMonth(''); }}
          />
        ) : (
          <EmptyState
            title={
              month
                ? `${month.replace('-', '年')}月の${tab === 'fix' ? '固定原価' : '変動原価'}はありません`
                : (tab === 'fix' ? '固定原価がありません' : '変動原価がありません')
            }
            description={
              tab === 'fix'
                ? '固定原価プロジェクト（FIXED-COGS）に付けた仕入がここに並びます。'
                : '案件に付けた仕入がここに並びます。'
            }
            action={
              <LatestMonthAction
                month={latestMonth}
                current={month}
                what={tab === 'fix' ? '固定原価' : '変動原価'}
                onJump={(m) => { setMonth(m); crud.setPage(1); }}
              />
            }
          />
        )
      ) : (
        <>
          {/*
            スマホは合計を**上に貼り付ける**（台帳は「いくらあるか」を見に来る画面
            なので、スクロールで消えると読み直しになる）。PC は今までどおり下の
            `LedgerFooter` が持つ。⚠️ **変動原価と固定原価は足す先が違う**ので、
            この合計はいま開いているタブのぶんだけ（サーバーが `fixed_cost` で絞る）
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
              codeLabel="GLS番号 ／ 話数"
              titleLabel="案件 ／ 説明"
              itemLabel="仕入"
              partyLabel="仕入先"
              stateLabel="申請"
              canEdit={canEdit}
              onRefresh={crud.refetch}
              // 詳細シートの「案件をひらく」。**固定原価には案件が無い**ので、
              // `project_id` を持たない行では部品側が出さない
              onProject={(row) => { if (row.project_id) navigate(`/sales/projects/${row.project_id}`); }}
              onOpen={(row) => {
                const full = items.find((p) => p.id === row.id);
                if (full && canEdit) { crud.openEdit(full); return; }
                // 台帳から「案件を開く ↗」を消した（9/2 仕様変更）ので、編集できない人が
                // 行を押しても何も起きない＝押せる見た目だけの行き止まりになっていた。
                // 売上台帳と同じく、案件へ移す行き先をここで持つ
                if (!canEdit && row.project_id) navigate(`/sales/projects/${row.project_id}`);
              }}
            />
          </div>

          {/*
            注記の**最後の1文だけ幅で変える**。PC は行の中の外部リンクボタンから
            精算ページへ移れるが、スマホはカード全体が1つのボタンなので入れ子にできず、
            行き先は詳細シートの下端に集めてある（同じ文言だと「押しても動かない」と
            読まれる）。合計はスマホでは上の帯が持つので、ここでは注記だけ出す
          */}
          <LedgerFooter
            count={crud.pagination?.total ?? items.length}
            total={raw?.total_amount ?? 0}
            hideTotals={isMobile}
            note={`「仮」は金額が確定していない見込みです。精算が通ると確定に変わり、精算番号が入ると「申請済」になります。${
              isMobile
                ? '申請URLを入れてある行にはリンクの印が付き、行を押すと出る詳しい内容から精算ページを開けます。'
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
