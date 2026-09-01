/**
 * GPM の請求タブ — 仕入フォームの状態と保存（段9）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 * **返り値を親で同じ名前に分割代入する**ので、この段では JSX を1行も触っていません
 * （差分＝宣言の移動だけ。JSX を動かすのは次の段）。
 *
 * ⚠️ **仕入先のクエリはここ（親で呼ぶ hook）に置きます。** ダイアログの中へ持って
 * いくと、Radix は閉じたときに中身を捨てるので**開閉のたびに取得のしかたが変わります**。
 * ここにあるからこそ「閉じている間は投げない・開いたら1回だけ」になります。
 *
 * ⚠️ **`useCallback` を付けないこと。** 毎レンダー作り直されているから最新の値を
 * 見ています。依存配列を付けると古い値を掴んだまま動きます（見た目は動くので
 * 気づけない種類のバグ）。
 *
 * ⚠️ **役務提供完了日は空で潰さない**（`toServiceDateInput` を通す）。
 * 潰すと、開き直して更新したときに保存済みの日付が消えます。
 */
import { useState } from 'react';
import { useQuery, useMutation, type QueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toServiceDateInput } from '@/contexts/finance/pages/ledger/serviceDate';
import type { Vendor } from '@/types';
import type { Purchase } from './types';

export function usePurchaseForm({ projectId, qc }: { projectId: string; qc: QueryClient }) {
  const [purDialogOpen, setPurDialogOpen] = useState(false);
  const [editingPurId, setEditingPurId] = useState<string | null>(null);
  const [purEpisodeId, setPurEpisodeId] = useState<string | null>(null); // 月次ユニット紐づけ
  const [purVendorId, setPurVendorId] = useState("");
  const [purAmount, setPurAmount] = useState(0);
  const [purDesc, setPurDesc] = useState("");
  const [purTax, setPurTax] = useState("tax10");
  const [purSettlement, setPurSettlement] = useState("rakuraku");
  const [purSettlementNo, setPurSettlementNo] = useState("");
  const [purSettlementUrl, setPurSettlementUrl] = useState("");
  const [purInvoice, setPurInvoice] = useState("qualified");
  // 計上月 (YYYY-MM)。財務側の仕入ダイアログと同じ「月」粒度で扱う (送信時に -01 を付与)
  const [purRecMonth, setPurRecMonth] = useState("");
  const [purServiceDate, setPurServiceDate] = useState(""); // 役務提供完了日
  const [purPayDueDate, setPurPayDueDate] = useState(""); // 支払予定日
  const [purIsProvisional, setPurIsProvisional] = useState(false); // 仮 (見込み仕入)
  const [purNotes, setPurNotes] = useState("");

  // Fetch purchases for this project
  const { data: purchasesData, isLoading: purchasesLoading } = useQuery({
    queryKey: ["purchases-project", projectId],
    queryFn: async () =>
      (await api.get("/purchases", { params: { project_id: projectId, limit: 100 } })).data,
  });
  const purchases: Purchase[] = purchasesData?.data ?? [];

  // 仕入先一覧
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
    enabled: purDialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  // 仕入 保存
  const savePurMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingPurId) {
        return (await api.put(`/purchases/${editingPurId}`, data)).data;
      }
      return (await api.post("/purchases", data)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["purchases-all"] });
      closePurDialog();
    },
  });

  // 仕入 削除
  const deletePurMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/purchases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["purchases-all"] });
    },
  });

  const closePurDialog = () => {
    setPurDialogOpen(false);
    setEditingPurId(null);
    setPurEpisodeId(null);
    setPurVendorId("");
    setPurAmount(0);
    setPurDesc("");
    setPurTax("tax10");
    setPurSettlement("rakuraku");
    setPurSettlementNo("");
    setPurSettlementUrl("");
    setPurInvoice("qualified");
    setPurRecMonth("");
    setPurServiceDate("");
    setPurPayDueDate("");
    setPurIsProvisional(false);
    setPurNotes("");
  };

  const openNewPurchase = () => {
    closePurDialog();
    setPurDialogOpen(true);
  };

  // 月次ユニット (エピソード) に紐づけた新規仕入を開く (計上月をその月で初期化)
  const openNewPurchaseForMonth = (epId: string, recMonth?: string) => {
    closePurDialog();
    setPurEpisodeId(epId);
    if (recMonth) setPurRecMonth(recMonth);
    setPurDialogOpen(true);
  };

  const openEditPurchase = (pu: Purchase) => {
    setEditingPurId(pu.id);
    setPurEpisodeId((pu as any).episode_id || null);
    setPurVendorId(pu.vendor_id || "");
    setPurAmount(pu.amount || 0);
    setPurDesc(pu.description || "");
    setPurTax(pu.tax_category || "tax10");
    setPurSettlement(pu.settlement_method || "rakuraku");
    setPurSettlementNo(pu.settlement_number && pu.settlement_number !== "pending" ? pu.settlement_number : "");
    setPurSettlementUrl((pu as any).settlement_url || "");
    setPurInvoice(pu.invoice_qualified ? "qualified" : "unqualified");
    setPurRecMonth(pu.recognition_date ? pu.recognition_date.slice(0, 7) : "");
    setPurServiceDate(toServiceDateInput((pu as any).service_completed_date)); // ⚠️ 空で潰すと更新時に消える
    setPurPayDueDate((pu as any).payment_due_date ? String((pu as any).payment_due_date).slice(0, 10) : "");
    setPurIsProvisional(!!(pu as any).is_provisional);
    setPurNotes((pu as any).notes || "");
    setPurDialogOpen(true);
  };

  const handlePurSubmit = () => {
    if (!purVendorId) return;
    savePurMutation.mutate({
      project_id: projectId,
      episode_id: purEpisodeId || null,
      vendor_id: purVendorId,
      amount: purAmount,
      description: purDesc || null,
      tax_category: purTax,
      settlement_method: purSettlement,
      settlement_number: purSettlementNo || null,
      settlement_url: purSettlementUrl || null,
      invoice_qualified: purInvoice === "qualified" ? 1 : 0,
      recognition_date: purRecMonth ? `${purRecMonth}-01` : null,
      service_completed_date: purServiceDate || null,
      payment_due_date: purPayDueDate || null,
      is_provisional: purIsProvisional,
      notes: purNotes || null,
    });
  };

  return {
    // ── 状態（親と同じ名前で返す。JSX を触らないため）──
    purDialogOpen, setPurDialogOpen,
    editingPurId, setEditingPurId,
    purEpisodeId, setPurEpisodeId,
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
    // ── データと操作 ──
    purchases, purchasesLoading, vendors,
    savePurMutation, deletePurMutation,
    closePurDialog, openNewPurchase, openNewPurchaseForMonth, openEditPurchase, handlePurSubmit,
  };
}
