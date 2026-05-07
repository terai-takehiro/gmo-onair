import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { previousBusinessDay, toLocalDateStr } from "@gmo-onair/shared/src/utils/businessDays";
import {
  Project,
  Vendor,
  ProjectTypeLabels,
  BroadcastTypeLabels,
  MediaPlatformLabels,
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
  getProjectCategory,
} from "@/types";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  FileText,
  Download,
  ShoppingCart,
  Percent,
  Link2,
  Calculator,
} from "lucide-react";
import { AnimatedCurrency } from "@/components/ui/animated-number";
import DiscountDialog, { DiscountResult } from "@/contexts/finance/components/DiscountDialog";
import PricingItemPicker, { PickedPricingItem } from "@/contexts/finance/components/PricingItemPicker";
import SimulationDialog, { SimulationAppliedItem } from "@/contexts/sales/components/SimulationDialog";

interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  period_start?: string | null;
  period_end?: string | null;
  item_notes?: string | null;
}

interface Revenue {
  id: string;
  billing_key: string;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  subtitle: string | null;
  customer_name: string;
  items?: RevenueItem[];
  group_name?: string | null;
  allocated_amount?: number | null;
  group_id?: string | null;
}

interface Purchase {
  id: string;
  amount: number;
  description: string | null;
  vendor_id: string;
  vendor_name: string;
  recognition_date: string | null;
  settlement_method: string | null;
  settlement_number: string | null;
  tax_category: string;
  invoice_qualified: number;
  group_name?: string | null;
  group_id?: string | null;
  allocated_amount?: number | null;
}

interface Props {
  project: Project;
  projectId: string;
  isEstimateMode?: boolean;
}

const taxLabels: Record<string, string> = {
  tax10: "10%課税",
  tax8: "8%課税(軽減)",
  exempt: "非課税",
};

export default function BusinessProjectView({ project, projectId, isEstimateMode }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isCategoryA = getProjectCategory(project.project_type) === "A";

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
  const [purDialogOpen, setPurDialogOpen] = useState(false);
  const [editingPurId, setEditingPurId] = useState<string | null>(null);
  const [purVendorId, setPurVendorId] = useState("");
  const [purAmount, setPurAmount] = useState(0);
  const [purDesc, setPurDesc] = useState("");
  const [purTax, setPurTax] = useState("tax10");
  const [purSettlement, setPurSettlement] = useState("rakuraku");
  const [purSettlementNo, setPurSettlementNo] = useState("");
  const [purInvoice, setPurInvoice] = useState("qualified");
  const [purRecDate, setPurRecDate] = useState("");

  // Fetch revenues for this project
  const { data: revenuesData, isLoading } = useQuery({
    queryKey: ["revenues-project", projectId],
    queryFn: async () =>
      (await api.get("/revenues", { params: { project_id: projectId, limit: 100 } })).data,
  });
  const revenues: Revenue[] = revenuesData?.data ?? [];

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
    setPurVendorId("");
    setPurAmount(0);
    setPurDesc("");
    setPurTax("tax10");
    setPurSettlement("rakuraku");
    setPurSettlementNo("");
    setPurInvoice("qualified");
    setPurRecDate("");
  };

  const openNewPurchase = () => {
    closePurDialog();
    setPurDialogOpen(true);
  };

  const openEditPurchase = (pu: Purchase) => {
    setEditingPurId(pu.id);
    setPurVendorId(pu.vendor_id || "");
    setPurAmount(pu.amount || 0);
    setPurDesc(pu.description || "");
    setPurTax(pu.tax_category || "tax10");
    setPurSettlement(pu.settlement_method || "rakuraku");
    setPurSettlementNo(pu.settlement_number || "");
    setPurInvoice(pu.invoice_qualified ? "qualified" : "unqualified");
    setPurRecDate(pu.recognition_date?.slice(0, 10) || "");
    setPurDialogOpen(true);
  };

  const handlePurSubmit = () => {
    if (!purVendorId) return;
    savePurMutation.mutate({
      project_id: projectId,
      vendor_id: purVendorId,
      amount: purAmount,
      description: purDesc || null,
      tax_category: purTax,
      settlement_method: purSettlement,
      settlement_number: purSettlementNo || null,
      invoice_qualified: purInvoice === "qualified" ? 1 : 0,
      recognition_date: purRecDate || null,
    });
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

  const handleDownloadPdf = async (revenueId: string) => {
    try {
      const res = await api.get(`/revenues/${revenueId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      a.download = match ? decodeURIComponent(match[1]) : 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF生成に失敗しました');
    }
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
    setItems([{ description: "", quantity: 1, unit_price: 0, amount: 0, period_start: null, period_end: null, item_notes: null }]);
  };

  const openNew = () => {
    closeDialog();
    setDialogOpen(true);
  };

  const openEdit = async (rev: Revenue) => {
    setEditingId(rev.id);
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
    setItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unit_price: 0, amount: 0 },
    ]);
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
      {/* Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() =>
            isEstimateMode
              ? navigate(`/sales/projects/${projectId}`)
              : navigate(
                  isCategoryA
                    ? "/projects/confirmed/studio"
                    : "/projects/confirmed/business"
                )
          }
        >
          <ArrowLeft className="h-4 w-4" />
          {isEstimateMode ? "案件に戻る" : "確定案件一覧"}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl lg:text-2xl font-bold">
            {project.gls_number && (
              <span className=" text-primary">
                {project.gls_number}{" "}
              </span>
            )}
            {project.name}
          </h1>
          {isEstimateMode && (
            <Badge className="bg-orange-500 text-white">概算見積</Badge>
          )}
          {isCategoryA && project.broadcast_type && (
            <Badge color="#005bac">
              {BroadcastTypeLabels[
                project.broadcast_type as keyof typeof BroadcastTypeLabels
              ] ?? project.broadcast_type}
            </Badge>
          )}
          {isCategoryA && project.media_platform && (
            <Badge variant="outline">
              {MediaPlatformLabels[
                project.media_platform as keyof typeof MediaPlatformLabels
              ] ?? project.media_platform}
            </Badge>
          )}
          {!isCategoryA && (
            <Badge variant="outline">
              {ProjectTypeLabels[
                project.project_type as keyof typeof ProjectTypeLabels
              ] || project.project_type}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {(project as any).customer_name}
        </p>
      </div>

      {/* Estimate mode info banner */}
      {isEstimateMode && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            概算見積の作成モードです。ここで作成した見積はGLS発番時に自動で確定売上に変換されます。
          </span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              売上高計
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <AnimatedCurrency value={summary?.total_revenue ?? 0} className="text-lg font-bold font-number" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              仕入実績計
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <AnimatedCurrency value={summary?.total_purchase ?? 0} className="text-lg font-bold font-number" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              粗利(実績)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <AnimatedCurrency value={summary?.gross_profit ?? 0} className="text-lg font-bold font-number" />
          </CardContent>
        </Card>
      </div>

      {/* Qsheet link */}
      {project.gls_number && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-rose-500" />
              <div>
                <span className="text-sm font-medium">Qシート</span>
                <span className="text-xs text-muted-foreground ml-2">放送進行表</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <a href={`/qsheet?project=${projectId}`}>
                <FileText className="h-3.5 w-3.5" />
                Qシート管理
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Revenue List = 見積/売上明細 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {isEstimateMode ? "概算見積書" : "見積・売上明細"}
          </h2>
          <div className="flex items-center gap-2">
            {isEstimateMode && (
              <Button size="sm" variant="outline" onClick={() => setSimDialogOpen(true)}>
                <Calculator className="h-4 w-4 mr-1" />
                シミュレーション
              </Button>
            )}
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              {isEstimateMode ? "見積追加" : "明細追加"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : revenues.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              売上明細がありません。「明細追加」から見積構成を作成してください。
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {revenues.map((rev) => (
              <Card key={rev.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className=" text-sm font-semibold">
                          {rev.billing_key}
                        </span>
                        {rev.subtitle && (
                          <span className="text-sm font-medium">{rev.subtitle}</span>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {taxLabels[rev.tax_category] || rev.tax_category}
                        </Badge>
                        {rev.group_name && (
                          <Badge variant="secondary" className="text-xs">按分: {rev.group_name}</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {rev.recognition_date && (
                          <span>計上日: {formatDate(rev.recognition_date)}</span>
                        )}
                        {rev.billing_date && (
                          <span>請求日: {formatDate(rev.billing_date)}</span>
                        )}
                        {rev.payment_due_date && (
                          <span>支払期日: {formatDate(rev.payment_due_date)}</span>
                        )}
                      </div>
                      {rev.notes && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          {rev.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="text-right mr-2">
                        <span className="font-number text-lg font-bold">
                          {formatCurrency(rev.allocated_amount != null ? rev.allocated_amount : rev.amount)}
                        </span>
                        {rev.allocated_amount != null && rev.allocated_amount !== rev.amount && (
                          <div className="text-xs text-muted-foreground font-number">
                            全体 {formatCurrency(rev.amount)}
                          </div>
                        )}
                      </div>
                      {rev.items && rev.items.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="PDF出力"
                          onClick={() => handleDownloadPdf(rev.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(rev)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          if (confirm("この明細を削除しますか？"))
                            deleteMutation.mutate(rev.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* 明細項目の展開表示 */}
                  {rev.items && rev.items.length > 0 && (
                    <div className="mt-3 border-t pt-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-normal pb-1">項目</th>
                            <th className="text-right font-normal pb-1 w-16">数量</th>
                            <th className="text-right font-normal pb-1 w-24">単価</th>
                            <th className="text-right font-normal pb-1 w-24">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rev.items.map((item, idx) => (
                            <tr key={idx} className="border-t border-dashed">
                              <td className="py-1">{item.description}</td>
                              <td className="py-1 text-right font-number">{item.quantity}</td>
                              <td className="py-1 text-right font-number">{formatCurrency(item.unit_price)}</td>
                              <td className="py-1 text-right font-number font-medium">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 仕入一覧 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            仕入一覧
          </h2>
          {!isEstimateMode && (
            <Button size="sm" onClick={openNewPurchase}>
              <Plus className="h-4 w-4 mr-1" />
              仕入追加
            </Button>
          )}
        </div>

        {purchasesLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : purchases.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              仕入データがありません
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {purchases.map((pu) => (
              <Card key={pu.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">
                        {pu.description || "（説明なし）"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {pu.vendor_name}
                        {pu.recognition_date && ` / ${formatDate(pu.recognition_date)}`}
                      </div>
                      {pu.group_name && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          按分: {pu.group_name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {pu.allocated_amount != null && pu.allocated_amount !== pu.amount ? (
                          <>
                            <span className="font-number text-lg font-bold">{formatCurrency(pu.allocated_amount)}</span>
                            <div className="text-xs text-muted-foreground">
                              全体 {formatCurrency(pu.amount)}
                            </div>
                          </>
                        ) : (
                          <span className="font-number text-lg font-bold">{formatCurrency(pu.amount)}</span>
                        )}
                      </div>
                      {!pu.group_id && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPurchase(pu)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                            if (confirm("この仕入を削除しますか？")) deletePurMutation.mutate(pu.id);
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 明細追加/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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

              {/* PC: table layout */}
              <div className="hidden sm:block mt-2 rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>内容</TableHead>
                      <TableHead className="w-14 text-right">数量</TableHead>
                      <TableHead className="w-28 text-right">単価</TableHead>
                      <TableHead className="w-28 text-right">金額</TableHead>
                      <TableHead className="w-[132px]">期間開始</TableHead>
                      <TableHead className="w-[132px]">期間終了</TableHead>
                      <TableHead className="w-28">明細備考</TableHead>
                      <TableHead className="w-14"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="p-1">
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(idx, "description", e.target.value)}
                            placeholder="項目名"
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <CurrencyInput
                            value={item.unit_price}
                            onChange={(v) => updateItem(idx, "unit_price", v)}
                            className="h-8 text-sm"
                          />
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
                            className="text-xs min-h-[32px] resize-none"
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
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">数量</Label>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)} />
                      </div>
                      <div>
                        <Label className="text-xs">単価</Label>
                        <CurrencyInput value={item.unit_price} onChange={(v) => updateItem(idx, "unit_price", v)} />
                      </div>
                      <div>
                        <Label className="text-xs">金額</Label>
                        <p className="h-9 flex items-center font-number font-medium text-sm">{formatCurrency(item.amount)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                    <SelectItem value="tax10">10%課税</SelectItem>
                    <SelectItem value="tax8">8%課税(軽減)</SelectItem>
                    <SelectItem value="exempt">非課税</SelectItem>
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
      <Dialog open={purDialogOpen} onOpenChange={(open) => { if (!open) closePurDialog(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPurId ? "仕入の編集" : "仕入の追加"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
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
              <CurrencyInput value={purAmount} onChange={setPurAmount} />
            </div>

            <div>
              <Label>説明</Label>
              <Input value={purDesc} onChange={(e) => setPurDesc(e.target.value)} placeholder="仕入の説明" />
            </div>

            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>精算番号</Label>
                <Input value={purSettlementNo} onChange={(e) => setPurSettlementNo(e.target.value)} placeholder="任意" />
              </div>
              <div>
                <Label>計上日</Label>
                <Input type="date" value={purRecDate} onChange={(e) => setPurRecDate(e.target.value)} />
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePurDialog}>キャンセル</Button>
            <Button disabled={!purVendorId || savePurMutation.isPending} onClick={handlePurSubmit}>
              {savePurMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingPurId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        customerType={
          (project as any)?.customer_type === "internal" ? "internal" : "external"
        }
        onSelect={applyPricingItem}
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
