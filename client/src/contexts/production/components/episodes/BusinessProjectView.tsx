import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { previousBusinessDay, toLocalDateStr } from "@gmo-onair/shared/src/utils/businessDays";
import { TaxHelperButton } from "@gmo-onair/shared/src/client/ui/tax-aware-amount-input";
import {
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
  getProjectCategory,
} from "@/types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
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
import DiscountDialog, { DiscountResult } from "@/contexts/finance/components/DiscountDialog";
import PricingItemPicker, { PickedPricingItem } from "@/contexts/finance/components/PricingItemPicker";
import SimulationDialog, { SimulationAppliedItem } from "@/contexts/sales/components/SimulationDialog";

import type { RevenueItem, Revenue, Props } from './businessProject/types';
import { handleDownloadPdf, handleDownloadExcel } from './businessProject/downloads';
import { PurchaseList } from './businessProject/PurchaseList';
import { SummaryCards } from './businessProject/SummaryCards';
import { ProjectHeader } from './businessProject/ProjectHeader';
import { RevenueList } from './businessProject/RevenueList';
import { MonthlyBilling } from './businessProject/MonthlyBilling';
import { usePurchaseForm } from './businessProject/usePurchaseForm';

export default function BusinessProjectView({ project, projectId, isEstimateMode }: Props) {
  const qc = useQueryClient();
  const isCategoryA = getProjectCategory(project.project_type) === "A";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // v2.8.104+: 売上明細カード上での明細項目インライン編集
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineItems, setInlineItems] = useState<RevenueItem[]>([]);
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [recognitionDate, setRecognitionDate] = useState("");
  const [billingDate, setBillingDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [items, setItems] = useState<RevenueItem[]>([
    { description: "", quantity: 1, unit_price: 0, amount: 0 },
  ]);
  // 月次ユニット (ビジネス案件の月締め請求単位) — 売上をエピソード(月)に紐づける
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [newMonth, setNewMonth] = useState(""); // YYYY-MM (月を追加ピッカー)

  // 値引きダイアログ
  const [discountDialog, setDiscountDialog] = useState<{
    open: boolean;
    mode: "item" | "global";
    targetIdx?: number;
    targetDescription?: string;
    baseAmount: number;
  }>({ open: false, mode: "item", baseAmount: 0 });

  // 料金表ピッカー
  const [pricingPickerOpen, setPricingPickerOpen] = useState(false);

  // 料金シミュレーション
  const [simDialogOpen, setSimDialogOpen] = useState(false);

  // 仕入ダイアログ
  /*
   * 仕入フォームの状態と保存は businessProject/usePurchaseForm.ts。
   * ⚠️ **同じ名前で分割代入する**ので、この段では JSX を1行も触っていない
   * （差分＝宣言の移動だけ）。
   */
  const {
    purDialogOpen,
    editingPurId,
    purEpisodeId,
    purVendorId, setPurVendorId,
    purAmount, setPurAmount,
    purDesc, setPurDesc,
    purTax, setPurTax,
    purSettlement, setPurSettlement,
    purSettlementNo, setPurSettlementNo,
    purSettlementUrl, setPurSettlementUrl,
    purInvoice, setPurInvoice,
    purRecMonth, setPurRecMonth,
    purServiceDate, setPurServiceDate,
    purPayDueDate, setPurPayDueDate,
    purIsProvisional, setPurIsProvisional,
    purNotes, setPurNotes,
    purchases, purchasesLoading, vendors,
    savePurMutation, deletePurMutation,
    closePurDialog, openNewPurchase, openNewPurchaseForMonth, openEditPurchase, handlePurSubmit,
  } = usePurchaseForm({ projectId, qc });

  // Fetch revenues for this project
  const { data: revenuesData, isLoading } = useQuery({
    queryKey: ["revenues-project", projectId],
    queryFn: async () =>
      (await api.get("/revenues", { params: { project_id: projectId, limit: 100 } })).data,
  });
  const revenues: Revenue[] = revenuesData?.data ?? [];

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

  // Create/Update revenue
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingId) {
        return (await api.put(`/revenues/${editingId}`, data)).data;
      }
      return (await api.post("/revenues", data)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      closeDialog();
    },
  });

  // Delete revenue
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/revenues/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
    },
  });

  // v2.8.104+: 売上明細項目のインライン保存 (ダイアログを開かずに items のみ更新)
  const inlineSaveMutation = useMutation({
    mutationFn: async ({ id, items }: { id: string; items: RevenueItem[] }) => {
      const rev = revenues.find((r) => r.id === id);
      if (!rev) throw new Error("revenue not found");
      const cleanedItems = items.filter((it) => it.description);
      const totalAmount = cleanedItems.reduce((s, it) => s + (it.amount || 0), 0);
      return (
        await api.put(`/revenues/${id}`, {
          project_id: projectId,
          customer_id: project?.customer_id,
          tax_category: rev.tax_category,
          amount: totalAmount,
          recognition_date: rev.recognition_date,
          billing_date: rev.billing_date,
          payment_due_date: rev.payment_due_date,
          notes: rev.notes,
          subtitle: rev.subtitle,
          items: cleanedItems,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      setInlineEditId(null);
      setInlineItems([]);
    },
  });

  const startInlineEdit = (rev: Revenue) => {
    setInlineEditId(rev.id);
    // 既存 items を deep copy。空ならテンプレ 1 行を提示。
    const seed: RevenueItem[] =
      rev.items && rev.items.length > 0
        ? rev.items.map((it) => ({ ...it }))
        : [{ description: "", quantity: 1, unit_price: 0, amount: 0 }];
    setInlineItems(seed);
  };
  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineItems([]);
  };
  const updateInlineItem = (idx: number, field: keyof RevenueItem, value: string | number) => {
    setInlineItems((prev) => {
      const next = [...prev];
      const it = { ...next[idx], [field]: value };
      // 数量・単価変更時は金額を再計算
      if (field === "quantity" || field === "unit_price") {
        const q = field === "quantity" ? Number(value) : it.quantity;
        const u = field === "unit_price" ? Number(value) : it.unit_price;
        it.amount = (q || 0) * (u || 0);
      }
      next[idx] = it;
      return next;
    });
  };
  const addInlineItem = () => {
    setInlineItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, amount: 0 }]);
  };
  const removeInlineItem = (idx: number) => {
    setInlineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setTaxCategory("tax10");
    setRecognitionDate("");
    setBillingDate("");
    setPaymentDueDate("");
    setNotes("");
    setSubtitle("");
    setEpisodeId(null);
    setItems([{ description: "", quantity: 1, unit_price: 0, amount: 0, period_start: null, period_end: null, item_notes: null }]);
  };

  const openNew = () => {
    closeDialog();
    setDialogOpen(true);
  };

  // 月次ユニット (エピソード) に紐づけた新規売上を開く。
  // recMonth ("YYYY-MM") を渡すと計上日=その月末・請求日=計上月末・支払期日=翌月末を自動入力し、
  // 財務ダッシュボード (計上日で月集計) にその月として確実に反映されるようにする。
  const openNewForMonth = (epId: string, monthTitle: string, recMonth?: string) => {
    closeDialog();
    setEpisodeId(epId);
    setSubtitle(monthTitle);
    if (recMonth) {
      const [y, m] = recMonth.split("-").map(Number);
      if (y && m) {
        setRecognitionDate(toLocalDateStr(previousBusinessDay(new Date(y, m, 0))));
        setBillingDate(toLocalDateStr(previousBusinessDay(new Date(y, m, 0))));
        setPaymentDueDate(toLocalDateStr(previousBusinessDay(new Date(y, m + 1, 0))));
      }
    }
    setDialogOpen(true);
  };

  const openEdit = async (rev: Revenue) => {
    setEditingId(rev.id);
    setEpisodeId((rev as any).episode_id || null);
    setTaxCategory(rev.tax_category || "tax10");
    setRecognitionDate(rev.recognition_date || "");
    setBillingDate(rev.billing_date || "");
    setPaymentDueDate(rev.payment_due_date || "");
    setNotes(rev.notes || "");
    setSubtitle(rev.subtitle || "");
    // Fetch detail with items
    try {
      const res = await api.get(`/revenues/${rev.id}`);
      const detail = res.data.data;
      if (detail.items && detail.items.length > 0) {
        setItems(
          detail.items.map((it: any) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            amount: it.amount,
            period_start: it.period_start || null,
            period_end: it.period_end || null,
            item_notes: it.item_notes || null,
            category: it.category || null,
          }))
        );
      } else {
        setItems([
          {
            description: "",
            quantity: 1,
            unit_price: rev.amount,
            amount: rev.amount,
          },
        ]);
      }
    } catch {
      setItems([
        {
          description: "",
          quantity: 1,
          unit_price: rev.amount,
          amount: rev.amount,
        },
      ]);
    }
    setDialogOpen(true);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unit_price") {
          updated.amount = (updated.quantity || 0) * (updated.unit_price || 0);
        }
        return updated;
      })
    );
  };

  const addItem = () => {
    setItems((prev) => {
      // 項目追加時は1つ前の入力分の日付・カテゴリをコピーする (連続入力の手間を軽減)
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          description: "", quantity: 1, unit_price: 0, amount: 0,
          period_start: last?.period_start ?? null,
          period_end: last?.period_end ?? null,
          category: last?.category ?? null,
        },
      ];
    });
  };

  // 項目値引きダイアログを開く
  const openItemDiscount = (idx: number) => {
    const item = items[idx];
    if (!item || (item.amount || 0) <= 0) {
      alert("値引きの対象となる金額が0円以下です");
      return;
    }
    setDiscountDialog({
      open: true,
      mode: "item",
      targetIdx: idx,
      targetDescription: item.description,
      baseAmount: item.amount,
    });
  };

  // 全体値引きダイアログを開く
  const openGlobalDiscount = () => {
    const positiveSubtotal = items.reduce(
      (s, it) => s + Math.max(0, it.amount || 0),
      0
    );
    if (positiveSubtotal <= 0) {
      alert("値引きの対象となる小計が0円以下です");
      return;
    }
    setDiscountDialog({
      open: true,
      mode: "global",
      baseAmount: positiveSubtotal,
    });
  };

  // 値引き適用
  const applyDiscount = (result: DiscountResult) => {
    const newItem: RevenueItem = {
      description: result.description,
      quantity: result.quantity,
      unit_price: result.unit_price,
      amount: result.amount,
    };
    setItems((prev) => {
      if (discountDialog.mode === "item" && discountDialog.targetIdx !== undefined) {
        // 対象明細の直下に挿入
        const next = [...prev];
        next.splice(discountDialog.targetIdx + 1, 0, newItem);
        return next;
      }
      // 末尾に追加
      return [...prev, newItem];
    });
  };

  // 料金表ピッカー選択時
  const applyPricingItem = (picked: PickedPricingItem) => {
    const desc = picked.sub_label
      ? `${picked.name}（${picked.sub_label}）`
      : picked.name;
    setItems((prev) => [
      ...prev,
      {
        description: desc,
        quantity: 1,
        unit_price: picked.unit_price,
        amount: picked.unit_price,
      },
    ]);
  };

  // シミュレーション適用時
  const applySimulation = (_total: number, simItems: SimulationAppliedItem[]) => {
    const mapped = simItems.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      amount: it.amount,
    }));
    if (dialogOpen) {
      // ダイアログが開いている場合は追加
      setItems((prev) => [...prev, ...mapped]);
    } else {
      // ダイアログが閉じている場合は新規見積として開く
      closeDialog();
      setItems(mapped.length > 0 ? mapped : [{ description: "", quantity: 1, unit_price: 0, amount: 0, period_start: null, period_end: null, item_notes: null }]);
      setDialogOpen(true);
    }
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = items.reduce((s, it) => s + (it.amount || 0), 0);

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

  const handleSubmit = () => {
    saveMutation.mutate({
      project_id: projectId,
      customer_id: project.customer_id,
      episode_id: episodeId || null,
      tax_category: taxCategory,
      amount: totalAmount,
      recognition_date: recognitionDate || null,
      billing_date: billingDate || null,
      payment_due_date: paymentDueDate || null,
      notes: notes || null,
      subtitle: subtitle || null,
      items: items.filter((it) => it.description),
      ...(isEstimateMode ? { status: 'estimate' } : {}),
    });
  };

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

      {/* 仕入追加/編集ダイアログ */}
      <FormDialog
        open={purDialogOpen}
        onOpenChange={(open) => { if (!open) closePurDialog(); }}
        title={editingPurId ? "仕入の編集" : "仕入の追加"} size="lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {editingPurId && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!confirm("この仕入を削除しますか？この操作は元に戻せません。")) return;
                    deletePurMutation.mutate(editingPurId, { onSuccess: () => closePurDialog() });
                  }}
                  disabled={deletePurMutation.isPending}
                >
                  {deletePurMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-4 w-4" />
                  )}
                  削除
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={closePurDialog}>キャンセル</Button>
              <Button disabled={!purVendorId || savePurMutation.isPending} onClick={handlePurSubmit}>
                {savePurMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingPurId ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        }
      >
          <div className="space-y-4">
            {purEpisodeId && (
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
                月次ユニット{" "}
                <span className="font-medium">
                  {monthEpisodes.find((e) => e.id === purEpisodeId)?.episode_code || ""}
                </span>
                {" "}に紐づけて登録します
              </div>
            )}
            <div>
              <Label>仕入先 *</Label>
              <SearchableSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || "" }))}
                value={purVendorId}
                onChange={setPurVendorId}
                placeholder="仕入先を検索..."
              />
            </div>

            <div>
              <Label>金額</Label>
              <div className="flex items-center gap-1">
                <div className="flex-1">
                  <CurrencyInput value={purAmount} onChange={setPurAmount} />
                </div>
                <TaxHelperButton
                  fieldLabel="仕入金額"
                  defaultIncludedAmount={purAmount}
                  onResult={setPurAmount}
                />
              </div>
            </div>

            <div>
              <Label>説明</Label>
              <Textarea
                value={purDesc}
                onChange={(e) => setPurDesc(e.target.value)}
                placeholder="仕入の説明"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pur-is-provisional" className="cursor-pointer">
                仮（確定前の見込み仕入）
              </Label>
              <Switch
                id="pur-is-provisional"
                checked={purIsProvisional}
                onCheckedChange={(v) => setPurIsProvisional(!!v)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>税区分</Label>
                <Select value={purTax} onValueChange={setPurTax}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                      <SelectItem key={key} value={key}>{TaxCategoryLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>精算方法</Label>
                <Select value={purSettlement} onValueChange={setPurSettlement}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map((key) => (
                      <SelectItem key={key} value={key}>{SettlementMethodLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div>
                <Label>役務提供完了日</Label>
                <Input
                  type="date"
                  value={purServiceDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPurServiceDate(val);
                    if (val) {
                      const [y, m] = val.split("-").map(Number);
                      if (y && m) {
                        setPurRecMonth(`${y}-${String(m).padStart(2, "0")}`);
                        // 翌月末が土日祝のときは前営業日に調整
                        setPurPayDueDate(toLocalDateStr(previousBusinessDay(new Date(y, m + 1, 0))));
                      }
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  入力すると計上月（当月）・支払予定日（翌月末、土日祝は前営業日）を自動入力します
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>計上月</Label>
                  <Input
                    type="month"
                    value={purRecMonth}
                    onChange={(e) => setPurRecMonth(e.target.value)}
                  />
                </div>
                <div>
                  <Label>支払予定日</Label>
                  <Input
                    type="date"
                    value={purPayDueDate}
                    onChange={(e) => setPurPayDueDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>精算番号</Label>
                <Input value={purSettlementNo} onChange={(e) => setPurSettlementNo(e.target.value)} placeholder="任意" />
              </div>
              <div>
                <Label>申請URL</Label>
                <Input
                  type="url"
                  value={purSettlementUrl}
                  onChange={(e) => setPurSettlementUrl(e.target.value)}
                  placeholder="精算申請ページのURL（任意）"
                />
              </div>
            </div>

            <div>
              <Label>インボイス</Label>
              <Select value={purInvoice} onValueChange={setPurInvoice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">適格事業者</SelectItem>
                  <SelectItem value="unqualified">非適格事業者</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>備考</Label>
              <Textarea
                value={purNotes}
                onChange={(e) => setPurNotes(e.target.value)}
                placeholder="任意"
                rows={2}
              />
            </div>
          </div>
      </FormDialog>

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
