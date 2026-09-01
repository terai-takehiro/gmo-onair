/**
 * GPM の請求タブ／案件の見積タブ — 売上・仕入・月次請求のコンソール
 *
 * ── 2,030行の1ファイルを分けたあとの「組み立て役」 ─────────────
 *
 * この画面は **hook を並べて、部品に配るだけ**です。中身は `businessProject/` にあります。
 *
 * | 置き場 | 何が入っているか |
 * | --- | --- |
 * | `useRevenueForm.ts` | 売上明細（見積）ダイアログのフォーム・保存・値引き・料金表・シミュレーション |
 * | `useInlineItems.ts` | 売上カード上での明細項目インライン編集 |
 * | `usePurchaseForm.ts` | 仕入ダイアログのフォーム・保存 |
 * | `useMonthUnits.ts` | 月次ユニット（エピソードを「月」として流用）の作成・削除 |
 * | `ProjectHeader` / `SummaryCards` | 見出しと KPI |
 * | `MonthlyBilling` / `RevenueList` / `PurchaseList` | 3つの一覧 |
 * | `RevenueDialog` / `RevenueItemRows` / `PurchaseDialog` | ダイアログの見た目 |
 * | `types.ts` / `downloads.ts` | 型と PDF・Excel の書き出し |
 *
 * ⚠️ **hook を呼ぶ順番に意味があります。** `useMonthUnits` は `useRevenueForm` の
 * `openEdit` / `openNewForMonth` を受け取る（月を作った直後に売上ダイアログを開くため）。
 * **先に呼ぶと初期化前の参照になります。**
 *
 * ⚠️ **ダイアログには hook の返り値を `form` 1つで渡します。** 25〜30 個の値を
 * 1つずつ props にすると**型を推測して間違えます**（過去の分割で5件間違えた）。
 *
 * ⚠️ **月次モードのときフラット一覧から月ユニット付きの行を外す**（`flatRevenues` /
 * `flatPurchases`）。外さないと同じ売上が2か所に出て、合計を二重に読まれます。
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { getProjectCategory } from "@/types";
import DiscountDialog from "@/contexts/finance/components/DiscountDialog";
import PricingItemPicker from "@/contexts/finance/components/PricingItemPicker";
import SimulationDialog from "@/contexts/sales/components/SimulationDialog";

import type { Revenue, Props } from './businessProject/types';
import { handleDownloadPdf, handleDownloadExcel } from './businessProject/downloads';
import { PurchaseList } from './businessProject/PurchaseList';
import { SummaryCards } from './businessProject/SummaryCards';
import { ProjectHeader } from './businessProject/ProjectHeader';
import { RevenueList } from './businessProject/RevenueList';
import { MonthlyBilling } from './businessProject/MonthlyBilling';
import { usePurchaseForm } from './businessProject/usePurchaseForm';
import { PurchaseDialog } from './businessProject/PurchaseDialog';
import { RevenueDialog } from './businessProject/RevenueDialog';
import { useInlineItems } from './businessProject/useInlineItems';
import { useRevenueForm } from './businessProject/useRevenueForm';
import { useMonthUnits } from './businessProject/useMonthUnits';

export default function BusinessProjectView({ project, projectId, isEstimateMode }: Props) {
  const qc = useQueryClient();
  const isCategoryA = getProjectCategory(project.project_type) === "A";

  /*
   * 売上明細（見積）ダイアログのフォームは businessProject/useRevenueForm.ts、
   * 見た目は businessProject/RevenueDialog.tsx。
   * ⚠️ **返り値はまとめて `RevenueDialog` へ渡す**（30 個近い値を1つずつ props にすると
   * 型を推測して間違えます）。ここで開くのは、この画面自身が使うぶんだけ。
   */
  const revenueForm = useRevenueForm({ projectId, project, isEstimateMode, qc });
  const {
    deleteMutation, openNew, openEdit, openNewForMonth,
    discountDialog, setDiscountDialog, applyDiscount,
    pricingPickerOpen, setPricingPickerOpen, applyPricingItem,
    simDialogOpen, setSimDialogOpen, applySimulation,
  } = revenueForm;




  // 仕入ダイアログ
  /*
   * 仕入フォームの状態と保存は businessProject/usePurchaseForm.ts、
   * ダイアログの見た目は businessProject/PurchaseDialog.tsx。
   * ⚠️ **返り値はまとめて `PurchaseDialog` へ渡す**（25 個を1つずつ props にすると
   * 型を推測して間違えます）。ここで開くのは、この画面自身が使うぶんだけ。
   */
  const purchaseForm = usePurchaseForm({ projectId, qc });
  const {
    purchases, purchasesLoading, deletePurMutation,
    openNewPurchase, openNewPurchaseForMonth, openEditPurchase,
  } = purchaseForm;

  // Fetch revenues for this project
  const { data: revenuesData, isLoading } = useQuery({
    queryKey: ["revenues-project", projectId],
    queryFn: async () =>
      (await api.get("/revenues", { params: { project_id: projectId, limit: 100 } })).data,
  });
  const revenues: Revenue[] = revenuesData?.data ?? [];

  // v2.8.104+: 売上明細カード上での明細項目インライン編集
  // （中身は businessProject/useInlineItems.ts。**同じ名前で開く**ので JSX は無変更）
  const {
    inlineEditId, inlineItems, inlineSaveMutation,
    startInlineEdit, cancelInlineEdit, updateInlineItem, addInlineItem, removeInlineItem,
  } = useInlineItems({ projectId, project, revenues, qc });

  // 月次管理モード: 確定済みビジネス案件 (GLS発番済・非A系・非見積モード) で有効
  const monthlyMode = !isEstimateMode && !isCategoryA && !!project.gls_number;

  // 月次ユニット（中身は businessProject/useMonthUnits.ts。**同じ名前で開く**ので JSX は無変更）
  const { newMonth, setNewMonth, monthEpisodes, addMonthMutation, handleDeleteMonth } =
    useMonthUnits({ projectId, monthlyMode, revenues, purchases, openEdit, openNewForMonth, qc });



  // Fetch project summary
  const { data: summaryData } = useQuery({
    queryKey: ["project-summary", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/summary`)).data,
  });
  const summary = summaryData?.data;


  // 月次モードでは月ユニットに紐づく売上/仕入は「月次管理」セクションで表示するため、
  // 下のフラット一覧からは除外して二重表示を防ぐ。
  // 存在する月ユニットの id 集合で照合する (月が削除済み等で紐づき先が無いレコードは
  // フラット一覧に出して見えなくならないようにする)。
  const monthEpisodeIds = new Set(monthEpisodes.map((e) => e.id));
  const flatRevenues = monthlyMode
    ? revenues.filter((r) => !monthEpisodeIds.has((r as any).episode_id))
    : revenues;
  const flatPurchases = monthlyMode
    ? purchases.filter((p) => !monthEpisodeIds.has((p as any).episode_id))
    : purchases;


  return (
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      {/* ヘッダー（中身は businessProject/ProjectHeader.tsx） */}
      <ProjectHeader project={project} projectId={projectId} isCategoryA={isCategoryA} isEstimateMode={isEstimateMode} />

      {/* KPI と Qシートへの入口（中身は businessProject/SummaryCards.tsx） */}
      <SummaryCards project={project} projectId={projectId} summary={summary} />

      {/* 月次管理（中身は businessProject/MonthlyBilling.tsx。**条件と位置はここに残す**） */}
      {monthlyMode && (
        <MonthlyBilling
          project={project}
          monthEpisodes={monthEpisodes}
          revenues={revenues}
          purchases={purchases}
          newMonth={newMonth}
          setNewMonth={setNewMonth}
          addMonthMutation={addMonthMutation}
          handleDeleteMonth={handleDeleteMonth}
          openEdit={openEdit}
          openNewForMonth={openNewForMonth}
          openEditPurchase={openEditPurchase}
          openNewPurchaseForMonth={openNewPurchaseForMonth}
          handleDownloadPdf={handleDownloadPdf}
          handleDownloadExcel={handleDownloadExcel}
        />
      )}

      {/* 見積・売上明細の一覧（中身は businessProject/RevenueList.tsx） */}
      <RevenueList
        monthlyMode={monthlyMode}
        isEstimateMode={isEstimateMode}
        isLoading={isLoading}
        flatRevenues={flatRevenues}
        openNew={openNew}
        openEdit={openEdit}
        deleteMutation={deleteMutation}
        setSimDialogOpen={setSimDialogOpen}
        handleDownloadPdf={handleDownloadPdf}
        handleDownloadExcel={handleDownloadExcel}
        inlineEditId={inlineEditId}
        inlineItems={inlineItems}
        inlineSaveMutation={inlineSaveMutation}
        startInlineEdit={startInlineEdit}
        cancelInlineEdit={cancelInlineEdit}
        addInlineItem={addInlineItem}
        updateInlineItem={updateInlineItem}
        removeInlineItem={removeInlineItem}
      />

      {/* 仕入一覧（中身は businessProject/PurchaseList.tsx。**条件と位置はここに残す**） */}
      <PurchaseList
        monthlyMode={monthlyMode}
        isEstimateMode={isEstimateMode}
        purchasesLoading={purchasesLoading}
        flatPurchases={flatPurchases}
        openNewPurchase={openNewPurchase}
        openEditPurchase={openEditPurchase}
        deletePurMutation={deletePurMutation}
      />

      {/* 明細追加/編集ダイアログ */}
      {/* 明細追加/編集ダイアログ（中身は businessProject/RevenueDialog.tsx） */}
      <RevenueDialog form={revenueForm} isCategoryA={isCategoryA} isEstimateMode={isEstimateMode} />

      {/* 仕入追加/編集ダイアログ (businessProject/PurchaseDialog.tsx) */}
      <PurchaseDialog form={purchaseForm} monthEpisodes={monthEpisodes} />

      {/* 値引きダイアログ */}
      <DiscountDialog
        open={discountDialog.open}
        onOpenChange={(open) =>
          setDiscountDialog((prev) => ({ ...prev, open }))
        }
        mode={discountDialog.mode}
        targetDescription={discountDialog.targetDescription}
        baseAmount={discountDialog.baseAmount}
        onApply={applyDiscount}
      />

      {/* 料金表ピッカー */}
      <PricingItemPicker
        open={pricingPickerOpen}
        onOpenChange={setPricingPickerOpen}
        customerType={(project as any)?.customer_type === "internal" ? "internal" : "external"}
        onSelect={applyPricingItem}
        projectId={projectId}
      />

      {/* 料金シミュレーション */}
      <SimulationDialog
        open={simDialogOpen}
        onOpenChange={setSimDialogOpen}
        projectId={projectId}
        onApply={applySimulation}
      />
    </div>
  );
}
