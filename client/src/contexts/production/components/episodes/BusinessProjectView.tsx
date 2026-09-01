import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

  // 月次ユニット (ビジネス案件の月締め請求単位) — 売上をエピソード(月)に紐づける
  const [newMonth, setNewMonth] = useState(""); // YYYY-MM (月を追加ピッカー)



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

  // 月次ユニット (エピソードを「月」として流用) の一覧
  const { data: episodesData } = useQuery({
    queryKey: ["episodes-months", projectId],
    queryFn: async () =>
      (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data,
    enabled: monthlyMode,
  });
  const monthEpisodes: Array<{ id: string; episode_code: string; episode_number: number; title: string | null }> =
    episodesData?.data ?? [];

  // 月ユニット作成 → その月の売上明細入力ダイアログを開く
  const addMonthMutation = useMutation({
    mutationFn: async (ym: string) =>
      (await api.post(`/projects/${projectId}/episodes/month`, { year_month: ym })).data,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["episodes-months", projectId] });
      setNewMonth("");
      const ep = res.data;
      // 既にその月の売上があればそれを編集、無ければ新規で開く
      const existingRev = revenues.find((r) => (r as any).episode_id === ep.id);
      if (existingRev) openEdit(existingRev);
      else {
        const mm2 = String(ep.episode_code || "").match(/-(\d{2})(\d{2})$/);
        openNewForMonth(ep.id, ep.title || "", mm2 ? `20${mm2[1]}-${mm2[2]}` : undefined);
      }
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message || err?.message || "月ユニットの作成に失敗しました";
      alert(`月の追加に失敗しました: ${msg}`);
    },
  });

  // 月ユニット削除 (紐づく売上/仕入が残っている場合は先に削除を促す)
  const deleteMonthMutation = useMutation({
    mutationFn: async (epId: string) =>
      (await api.delete(`/projects/${projectId}/episodes/${epId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episodes-months", projectId] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message || err?.message || "削除に失敗しました";
      alert(`月ユニットの削除に失敗しました: ${msg}`);
    },
  });

  const handleDeleteMonth = (ep: { id: string; episode_code: string }) => {
    const linkedRevs = revenues.filter((r) => (r as any).episode_id === ep.id).length;
    const linkedPurs = purchases.filter((p) => (p as any).episode_id === ep.id).length;
    if (linkedRevs > 0 || linkedPurs > 0) {
      alert(
        `${ep.episode_code} には売上 ${linkedRevs} 件 / 仕入 ${linkedPurs} 件が紐づいています。\n先にそれらを削除（または編集で紐づけを変更）してから月を削除してください。`,
      );
      return;
    }
    if (!confirm(`${ep.episode_code} を削除しますか？`)) return;
    deleteMonthMutation.mutate(ep.id);
  };


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
