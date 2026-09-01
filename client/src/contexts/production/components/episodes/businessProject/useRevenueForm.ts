/**
 * GPM の請求タブ — 売上明細（見積）ダイアログのフォーム（段12）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 * 宣言の順番も元のまま（`saveMutation.onSuccess` が、あとで宣言される `closeDialog` を
 * 呼ぶ形もそのまま。**並べ替えると初期化前の参照になります**）。
 *
 * ⚠️ **`closeDialog` は「閉じる」ではなく「初期値へ戻す」**。`openNew` /
 * `openNewForMonth` / `applySimulation` が**開く前に必ず呼んで**います。
 * 名前に釣られて中身を減らすと、**前に開いた明細が次の新規に残ります**。
 *
 * ⚠️ 月次ユニットから開いた新規は、計上日・請求日・支払期日を**営業日に寄せて**入れる
 * （`previousBusinessDay`）。財務ダッシュボードが計上日で月集計するため。
 */
import { useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { previousBusinessDay, toLocalDateStr } from '@gmo-onair/shared/src/utils/businessDays';
import type { DiscountResult } from '@/contexts/finance/components/DiscountDialog';
import type { PickedPricingItem } from '@/contexts/finance/components/PricingItemPicker';
import type { SimulationAppliedItem } from '@/contexts/sales/components/SimulationDialog';
import type { Project } from '@/types';
import type { Revenue, RevenueItem } from './types';

export function useRevenueForm({
  projectId, project, isEstimateMode, qc,
}: {
  projectId: string;
  project: Project;
  isEstimateMode?: boolean;
  qc: QueryClient;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  return {
    dialogOpen, setDialogOpen, editingId,
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
  };
}
