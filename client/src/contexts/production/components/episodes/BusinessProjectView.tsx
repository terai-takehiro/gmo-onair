import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { issueDocPdf, type DocKind } from "@/lib/docPdf";
import { previousBusinessDay, toLocalDateStr } from "@gmo-onair/shared/src/utils/businessDays";
import { TaxHelperButton } from "@gmo-onair/shared/src/client/ui/tax-aware-amount-input";
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
  Receipt,
  FileSpreadsheet,
  ClipboardCheck,
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
  category?: string | null;
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

// 画面ごとに表を持つと足した区分が漏れる (実際に不課税がここだけ抜けていた)。
// 表は client/src/types/index.ts の TaxCategoryLabels 1本にする。
const taxLabels: Record<string, string> = TaxCategoryLabels;

export default function BusinessProjectView({ project, projectId, isEstimateMode }: Props) {
  const navigate = useNavigate();
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
    setPurServiceDate("");
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

  /**
   * 帳票を発行する（v4 で共通部品に寄せた）。
   *
   * 元はここに blob の受け取りとファイル名の取り出しが直に書いてあり、
   * 失敗すると `alert('PDF生成に失敗しました')` だけが出ていました
   * （権限が無いのか BOX が落ちているのか押した人には分からない）。
   * いまは `lib/docPdf.ts` が1つだけ持ち、**BOX に入ったかどうかも出します**。
   */
  const handleDownloadPdf = (revenueId: string, type: DocKind) =>
    issueDocPdf(`/revenues/${revenueId}/pdf`, type, { type });

  // 請求書 Excel (業務推進への監査提出用・BOX格納フォーマット) をダウンロード
  const handleDownloadExcel = async (revenueId: string) => {
    try {
      const res = await api.get(`/revenues/${revenueId}/excel`, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      a.download = match ? decodeURIComponent(match[1]) : 'invoice.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Excel生成に失敗しました');
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
      {/* Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() =>
            isEstimateMode
              ? navigate(`/sales/projects/${projectId}`)
              : navigate(isCategoryA ? "/sales/projects" : "/gpm/projects")
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
          {/* 確定案件でも案件名・パラメータを再編集できるよう編集フォームへの導線を出す
              (従来この画面には編集ボタンが無く、確定済みビジネス案件のタイトル等を直せなかった) */}
          {!isEstimateMode && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 ml-auto"
              onClick={() => navigate(`/sales/projects/${projectId}`)}
            >
              <Pencil className="h-4 w-4" />
              案件を編集
            </Button>
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

      {/* 月次請求 (ビジネス案件の月締め請求単位) — 1月 = 1請求単位 (GLS-XXXX-YYMM) */}
      {monthlyMode && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              月次管理（月締め：売上・仕入）
            </h2>
            <div className="flex items-center gap-2">
              <Input
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className="h-9 w-40"
                aria-label="追加する対象月"
              />
              <Button
                size="sm"
                disabled={!newMonth || addMonthMutation.isPending}
                onClick={() => addMonthMutation.mutate(newMonth)}
              >
                {addMonthMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                月を追加
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            月ごとに <span className="font-medium text-foreground">{project.gls_number}-YYMM</span>{" "}
            の請求単位を作り、その月の<span className="font-medium text-foreground">売上・仕入</span>をまとめて管理します（締め月が違っても月別に分けられます）。1月＝1請求書/見積書。
          </p>

          {monthEpisodes.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                月次ユニットがありません。上の入力欄で対象月を選び「月を追加」してください。
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {monthEpisodes.map((ep) => {
                const monthRevs = revenues.filter((r) => (r as any).episode_id === ep.id);
                const monthPurs = purchases.filter((p) => (p as any).episode_id === ep.id);
                const revTotal = monthRevs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                const purTotal = monthPurs.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                const primaryRev = monthRevs[0];
                // episode_code の末尾 YYMM から計上月 (YYYY-MM) を導出
                const mm = ep.episode_code.match(/-(\d{2})(\d{2})$/);
                const recMonth = mm ? `20${mm[1]}-${mm[2]}` : undefined;
                return (
                  <Card key={ep.id}>
                    <CardContent className="space-y-3 py-3 px-4">
                      {/* ヘッダー: コード + 売上/仕入/粗利 + 削除 */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold">
                          {ep.episode_code}
                          {ep.title && <span className="ml-2 text-muted-foreground font-normal">{ep.title}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span>売上 <span className="font-medium font-number">{formatCurrency(revTotal)}</span></span>
                          <span className="text-muted-foreground">仕入 <span className="font-medium font-number">{formatCurrency(purTotal)}</span></span>
                          <span className="text-primary">粗利 <span className="font-medium font-number">{formatCurrency(revTotal - purTotal)}</span></span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            title="この月ユニットを削除（紐づく売上/仕入がある場合は先に削除が必要）"
                            onClick={() => handleDeleteMonth(ep)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* 売上 */}
                      <div className="rounded-md border bg-muted/20 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">売上（請求）</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {primaryRev ? (
                              <>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openEdit(primaryRev)}>
                                  <Pencil className="h-3 w-3" />明細編集
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadPdf(primaryRev.id, "estimate")}>
                                  <FileText className="h-3 w-3" />見積書
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadPdf(primaryRev.id, "invoice")}>
                                  <Receipt className="h-3 w-3" />請求書
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadPdf(primaryRev.id, "inspection")}>
                                  <ClipboardCheck className="h-3 w-3" />検収書
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadExcel(primaryRev.id)}>
                                  <FileSpreadsheet className="h-3 w-3" />Excel
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openNewForMonth(ep.id, ep.title || "", mm ? `20${mm[1]}-${mm[2]}` : undefined)}>
                                <Plus className="h-3 w-3" />売上明細を入力
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 仕入 */}
                      <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">仕入</span>
                          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openNewPurchaseForMonth(ep.id, recMonth)}>
                            <Plus className="h-3 w-3" />仕入を追加
                          </Button>
                        </div>
                        {monthPurs.length > 0 && (
                          <div className="divide-y">
                            {monthPurs.map((pu) => (
                              <button
                                key={pu.id}
                                type="button"
                                className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs hover:bg-muted/40 rounded px-1"
                                onClick={() => openEditPurchase(pu)}
                                title="この仕入を編集"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {pu.vendor_name || "—"}
                                  {pu.description && <span className="text-muted-foreground ml-1">{pu.description}</span>}
                                </span>
                                <span className="font-number shrink-0">{formatCurrency(pu.amount)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Revenue List = 見積/売上明細 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {isEstimateMode ? "概算見積書" : monthlyMode ? "その他の売上明細（月次外）" : "見積・売上明細"}
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
        ) : flatRevenues.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {monthlyMode
                ? "月次以外の売上明細はありません。月締め請求は上の「月次請求」から管理します。"
                : "売上明細がありません。「明細追加」から見積構成を作成してください。"}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {flatRevenues.map((rev) => (
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
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="見積書PDFを発行"
                            onClick={() => handleDownloadPdf(rev.id, 'estimate')}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">見積書</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="請求書PDFを発行"
                            onClick={() => handleDownloadPdf(rev.id, 'invoice')}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">請求書</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="検収書PDFを発行"
                            onClick={() => handleDownloadPdf(rev.id, 'inspection')}
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">検収書</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="請求書Excelを発行（業務推進提出用）"
                            onClick={() => handleDownloadExcel(rev.id)}
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">請求書Excel</span>
                          </Button>
                        </>
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
                  {/* 明細項目: 表示 / インライン編集 (v2.8.104+) */}
                  {(rev.items && rev.items.length > 0) || inlineEditId === rev.id ? (
                    <div className="mt-3 border-t pt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-muted-foreground tracking-wide">明細項目</span>
                        {inlineEditId !== rev.id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => startInlineEdit(rev)}
                            title="明細項目をインラインで編集"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            明細を編集
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={cancelInlineEdit}
                              disabled={inlineSaveMutation.isPending}
                            >
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => inlineSaveMutation.mutate({ id: rev.id, items: inlineItems })}
                              disabled={inlineSaveMutation.isPending}
                            >
                              {inlineSaveMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : null}
                              保存
                            </Button>
                          </div>
                        )}
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-normal pb-1">項目</th>
                            <th className="text-right font-normal pb-1 w-16">数量</th>
                            <th className="text-right font-normal pb-1 w-24">単価</th>
                            <th className="text-right font-normal pb-1 w-24">金額</th>
                            {inlineEditId === rev.id && <th className="w-8"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {inlineEditId === rev.id
                            ? inlineItems.map((item, idx) => (
                                <tr key={idx} className="border-t border-dashed">
                                  <td className="py-1 pr-1">
                                    <Input
                                      value={item.description}
                                      onChange={(e) => updateInlineItem(idx, "description", e.target.value)}
                                      placeholder="項目名"
                                      className="h-7 text-xs"
                                    />
                                  </td>
                                  <td className="py-1 px-1">
                                    <Input
                                      type="number"
                                      min={1}
                                      value={item.quantity}
                                      onChange={(e) =>
                                        updateInlineItem(idx, "quantity", parseInt(e.target.value) || 0)
                                      }
                                      className="h-7 text-xs text-right"
                                    />
                                  </td>
                                  <td className="py-1 px-1">
                                    <div className="flex items-center gap-0.5">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={item.unit_price}
                                        onChange={(e) =>
                                          updateInlineItem(idx, "unit_price", parseInt(e.target.value) || 0)
                                        }
                                        className="h-7 text-xs text-right flex-1"
                                      />
                                      <TaxHelperButton
                                        fieldLabel="単価"
                                        defaultIncludedAmount={item.unit_price}
                                        onResult={(v) => updateInlineItem(idx, "unit_price", v)}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-1 text-right font-number font-medium tabular-nums">
                                    {formatCurrency(item.amount)}
                                  </td>
                                  <td className="py-1 pl-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => removeInlineItem(idx)}
                                      title="この行を削除"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            : rev.items!.map((item, idx) => (
                                <tr key={idx} className="border-t border-dashed">
                                  <td className="py-1">{item.description}</td>
                                  <td className="py-1 text-right font-number">{item.quantity}</td>
                                  <td className="py-1 text-right font-number">{formatCurrency(item.unit_price)}</td>
                                  <td className="py-1 text-right font-number font-medium">{formatCurrency(item.amount)}</td>
                                </tr>
                              ))}
                        </tbody>
                      </table>
                      {inlineEditId === rev.id && (
                        <div className="mt-2 flex items-center justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={addInlineItem}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            行追加
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            合計: <span className="font-number font-medium text-foreground">
                              {formatCurrency(inlineItems.reduce((s, it) => s + (it.amount || 0), 0))}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 border-t pt-2 flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-muted-foreground"
                        onClick={() => startInlineEdit(rev)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        明細項目を追加
                      </Button>
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
            {monthlyMode ? "その他の仕入（月次外）" : "仕入一覧"}
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
        ) : flatPurchases.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              {monthlyMode ? "月次以外の仕入はありません。月締めの仕入は上の「月次管理」から追加します。" : "仕入データがありません"}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {flatPurchases.map((pu) => (
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
        <DialogContent
          className="sm:max-w-[min(96vw,1400px)] max-h-[90vh] overflow-y-auto"
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
      <Dialog open={purDialogOpen} onOpenChange={(open) => { if (!open) closePurDialog(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPurId ? "仕入の編集" : "仕入の追加"}</DialogTitle>
          </DialogHeader>

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

          <DialogFooter className="flex sm:justify-between gap-2">
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
