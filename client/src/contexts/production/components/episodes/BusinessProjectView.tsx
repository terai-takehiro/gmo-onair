import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { previousBusinessDay, toLocalDateStr } from "@gmo-onair/shared/src/utils/businessDays";
import { TaxHelperButton } from "@gmo-onair/shared/src/client/ui/tax-aware-amount-input";
import {
  TaxCategory,
  TaxCategoryLabels,
  getProjectCategory,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Loader2,
  Percent,
  Link2,
  Calculator,
} from "lucide-react";
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
import { useInlineItems } from './businessProject/useInlineItems';
import { useRevenueForm } from './businessProject/useRevenueForm';

export default function BusinessProjectView({ project, projectId, isEstimateMode }: Props) {
  const qc = useQueryClient();
  const isCategoryA = getProjectCategory(project.project_type) === "A";

  /*
   * 売上明細（見積）ダイアログのフォーム。中身は businessProject/useRevenueForm.ts。
   * ⚠️ **同じ名前で開く**ので、下の JSX は1行も触っていない（差分＝宣言の移動だけ）。
   */
  const {
    dialogOpen, editingId,
    taxCategory, setTaxCategory,
    recognitionDate, setRecognitionDate,
    billingDate, setBillingDate,
    paymentDueDate, setPaymentDueDate,
    notes, setNotes, subtitle, setSubtitle,
    items, totalAmount,
    discountDialog, setDiscountDialog,
    pricingPickerOpen, setPricingPickerOpen,
    simDialogOpen, setSimDialogOpen,
    saveMutation, deleteMutation,
    closeDialog, openNew, openNewForMonth, openEdit,
    updateItem, addItem, removeItem,
    openItemDiscount, openGlobalDiscount, applyDiscount, applyPricingItem, applySimulation,
    handleSubmit,
  } = useRevenueForm({ projectId, project, isEstimateMode, qc });

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
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent
          size="full" className="max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {isEstimateMode
                ? (editingId ? "概算見積の編集" : "概算見積の追加")
                : (editingId ? "売上明細の編集" : "売上明細の追加")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Subtitle (A-type only) */}
            {isCategoryA && (
              <div>
                <Label>番号ラベル（小見出し）</Label>
                <Input
                  placeholder="例: 2025年株主総会"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  この番号が何を表すかのラベル（番組名・イベント年度など）
                </p>
              </div>
            )}

            {/* Line Items */}
            <div>
              <Label className="text-sm font-semibold">明細項目</Label>
              <datalist id="revenue-item-categories">
                <option value="制作費" />
                <option value="機材費" />
                <option value="人件費" />
                <option value="スタジオ費" />
                <option value="配信費" />
                <option value="諸経費" />
              </datalist>

              {/* PC: table layout — dialog 幅を超えたら bordered 枠内で横スクロール (列は圧縮しない) */}
              <div className="hidden sm:block mt-2 rounded border overflow-x-auto">
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[220px]">内容</TableHead>
                      <TableHead className="w-32">カテゴリ</TableHead>
                      <TableHead className="w-20 text-right">数量</TableHead>
                      <TableHead className="w-40 text-right">単価</TableHead>
                      <TableHead className="w-28 text-right">金額</TableHead>
                      <TableHead className="w-[130px]">期間開始</TableHead>
                      <TableHead className="w-[130px]">期間終了</TableHead>
                      <TableHead className="min-w-[180px]">明細備考</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx} className="align-top">
                        <TableCell className="p-1">
                          <Textarea
                            value={item.description}
                            onChange={(e) => updateItem(idx, "description", e.target.value)}
                            placeholder="項目名・内容"
                            rows={1}
                            className="text-sm min-h-[36px] resize-y"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={item.category || ""}
                            onChange={(e) => updateItem(idx, "category", e.target.value || null)}
                            placeholder="カテゴリ"
                            className="h-9 text-sm"
                            list="revenue-item-categories"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                            className="h-9 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="flex items-center gap-0.5">
                            <CurrencyInput
                              value={item.unit_price}
                              onChange={(v) => updateItem(idx, "unit_price", v)}
                              className="h-8 text-sm flex-1"
                            />
                            <TaxHelperButton
                              fieldLabel="単価"
                              defaultIncludedAmount={item.unit_price}
                              onResult={(v) => updateItem(idx, "unit_price", v)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className={`p-1 text-right font-number text-sm font-medium ${(item.amount || 0) < 0 ? "text-amber-600" : ""}`}>
                          {formatCurrency(item.amount)}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="date"
                            value={item.period_start || ""}
                            onChange={(e) => updateItem(idx, "period_start", e.target.value || null)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="date"
                            value={item.period_end || ""}
                            onChange={(e) => updateItem(idx, "period_end", e.target.value || null)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Textarea
                            value={item.item_notes || ""}
                            onChange={(e) => updateItem(idx, "item_notes", e.target.value || null)}
                            className="text-xs min-h-[36px] resize-y"
                            rows={1}
                            placeholder="備考"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="flex items-center gap-0.5">
                            {(item.amount || 0) > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-amber-600 hover:bg-amber-50"
                                onClick={() => openItemDiscount(idx)}
                                title="値引きを追加"
                              >
                                <Percent className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {items.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: card layout */}
              <div className="sm:hidden mt-2 space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">項目 {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        {(item.amount || 0) > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-amber-600 hover:bg-amber-50"
                            onClick={() => openItemDiscount(idx)}
                            title="この項目に値引きを追加"
                          >
                            <Percent className="h-3 w-3 mr-1" />
                            値引き
                          </Button>
                        )}
                        {items.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Input
                      placeholder="項目名（例: コンサルティング費用）"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                    <div>
                      <Label className="text-xs">カテゴリ（任意・見積書でカテゴリ別に内訳整理）</Label>
                      <Input
                        placeholder="例: 機材費 / 人件費 / 制作費"
                        value={item.category || ""}
                        onChange={(e) => updateItem(idx, "category", e.target.value || null)}
                        list="revenue-item-categories"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">数量</Label>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)} />
                      </div>
                      <div>
                        <Label className="text-xs">単価</Label>
                        <div className="flex items-center gap-0.5">
                          <CurrencyInput value={item.unit_price} onChange={(v) => updateItem(idx, "unit_price", v)} />
                          <TaxHelperButton
                            fieldLabel="単価"
                            defaultIncludedAmount={item.unit_price}
                            onResult={(v) => updateItem(idx, "unit_price", v)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">金額</Label>
                        <p className="h-9 flex items-center font-number font-medium text-sm">{formatCurrency(item.amount)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">期間（開始）</Label>
                        <Input type="date" value={item.period_start || ""} onChange={(e) => updateItem(idx, "period_start", e.target.value || null)} />
                      </div>
                      <div>
                        <Label className="text-xs">期間（終了）</Label>
                        <Input type="date" value={item.period_end || ""} onChange={(e) => updateItem(idx, "period_end", e.target.value || null)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">明細備考</Label>
                      <Textarea
                        value={item.item_notes || ""}
                        onChange={(e) => updateItem(idx, "item_notes", e.target.value || null)}
                        placeholder="PDFに表示される商品説明・利用条件など（改行で複数行）"
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* v2.8.106+: 項目追加・料金表・シミュレーション・全体値引き ボタン
                  (PC table とモバイル card の両方で共通表示) */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  項目追加
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPricingPickerOpen(true)}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  料金表から追加
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSimDialogOpen(true)}
                >
                  <Calculator className="h-3 w-3 mr-1" />
                  シミュレーション
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-amber-700 border-amber-300 hover:bg-amber-50"
                  onClick={openGlobalDiscount}
                >
                  <Percent className="h-3 w-3 mr-1" />
                  全体値引き
                </Button>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-sm font-medium">合計金額</span>
              <span className="text-lg font-bold font-number">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            {/* Tax & Dates */}
            <div className={`grid gap-3 ${isEstimateMode ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
              <div>
                <Label>税区分</Label>
                <Select value={taxCategory} onValueChange={setTaxCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                      <SelectItem key={key} value={key}>{TaxCategoryLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isEstimateMode && (
                <>
                  <div>
                    <Label>計上日</Label>
                    <Input
                      type="date"
                      value={recognitionDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRecognitionDate(val);
                        // v2.8.103+: 計上日入力時、請求日 (計上月末) と支払期日 (翌月末) を
                        // 営業日調整して自動入力。既に値が入っている場合は上書きしない。
                        if (val) {
                          const [y, m] = val.split("-").map(Number);
                          if (y && m) {
                            if (!billingDate) {
                              setBillingDate(toLocalDateStr(previousBusinessDay(new Date(y, m, 0))));
                            }
                            if (!paymentDueDate) {
                              setPaymentDueDate(toLocalDateStr(previousBusinessDay(new Date(y, m + 1, 0))));
                            }
                          }
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      入力すると請求日（計上月末）・支払期日（翌月末）を営業日調整して自動入力（土日祝なら前営業日）
                    </p>
                  </div>
                  <div>
                    <Label>請求日</Label>
                    <Input
                      type="date"
                      value={billingDate}
                      onChange={(e) => setBillingDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>支払期日</Label>
                    <Input
                      type="date"
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>メモ</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="備考など"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                saveMutation.isPending ||
                items.filter((it) => it.description).length === 0
              }
            >
              {saveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
