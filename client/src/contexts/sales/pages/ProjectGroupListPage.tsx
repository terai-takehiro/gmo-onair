import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import {
  Customer,
  Vendor,
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
} from "@/types";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FolderOpen,
  ShoppingCart,
  FileText,
} from "lucide-react";

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  total_purchase: number;
  total_revenue: number;
}

interface GroupMember {
  id: string;
  gls_number: string;
  name: string;
  stage: string;
  customer_name: string;
}

interface Allocation {
  project_id: string;
  allocated_amount: number;
  project_name?: string;
  gls_number?: string;
}

interface GroupPurchase {
  id: string;
  amount: number;
  description: string;
  vendor_id: string;
  vendor_name: string;
  tax_category: string;
  settlement_method: string;
  settlement_number: string | null;
  recognition_date: string;
  allocations: Allocation[];
}

interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface GroupRevenue {
  id: string;
  billing_key: string;
  amount: number;
  subtitle: string | null;
  tax_category: string;
  customer_id: string;
  customer_name: string;
  recognition_date: string | null;
  billing_date: string | null;
  notes: string | null;
  status: string;
  items: RevenueItem[];
  allocations: Allocation[];
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  total_purchase: number;
  total_revenue: number;
  members: GroupMember[];
  purchases: GroupPurchase[];
  revenues: GroupRevenue[];
}

interface GlsProject {
  id: string;
  gls_number: string;
  name: string;
  customer_name: string;
}

export default function ProjectGroupListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // 仕入登録ダイアログ
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purVendorId, setPurVendorId] = useState("");
  const [purAmount, setPurAmount] = useState(0);
  const [purDesc, setPurDesc] = useState("");
  const [purTax, setPurTax] = useState("tax10");
  const [purSettlement, setPurSettlement] = useState("rakuraku");
  const [purSettlementNo, setPurSettlementNo] = useState("");
  const [purRecDate, setPurRecDate] = useState("");
  const [purAllocMode, setPurAllocMode] = useState<"equal" | "custom">("equal");
  const [customAllocations, setCustomAllocations] = useState<Record<string, number>>({});

  // 売上登録ダイアログ
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [revCustomerId, setRevCustomerId] = useState("");
  const [revTax, setRevTax] = useState("tax10");
  const [revSubtitle, setRevSubtitle] = useState("");
  const [revRecDate, setRevRecDate] = useState("");
  const [revBillingDate, setRevBillingDate] = useState("");
  const [revNotes, setRevNotes] = useState("");
  const [revStatus, setRevStatus] = useState<"estimate" | "confirmed">("confirmed");
  const [revItems, setRevItems] = useState<RevenueItem[]>([{ description: "", quantity: 1, unit_price: 0, amount: 0 }]);
  const [revAllocMode, setRevAllocMode] = useState<"equal" | "custom">("equal");
  const [revCustomAllocations, setRevCustomAllocations] = useState<Record<string, number>>({});

  // グループ一覧
  const { data: groupsData, isLoading } = useQuery({
    queryKey: ["project-groups"],
    queryFn: async () => (await api.get("/project-groups?limit=100")).data,
  });
  const groups: GroupSummary[] = groupsData?.data ?? [];

  // グループ詳細
  const { data: detailData } = useQuery({
    queryKey: ["project-group-detail", selectedGroupId],
    queryFn: async () => (await api.get(`/project-groups/${selectedGroupId}`)).data,
    enabled: !!selectedGroupId,
  });
  const detail: GroupDetail | null = detailData?.data ?? null;

  // GLS案件一覧
  const { data: glsData } = useQuery({
    queryKey: ["gls-projects-for-groups"],
    queryFn: async () => (await api.get("/projects/gls-projects")).data,
    enabled: groupDialogOpen,
  });
  const glsProjects: GlsProject[] = glsData?.data ?? [];

  // 仕入先一覧
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
    enabled: purchaseDialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  // 顧客一覧
  const { data: customersData } = useQuery({
    queryKey: ["customers-list"],
    queryFn: async () => (await api.get("/customers?limit=200")).data,
    enabled: revenueDialogOpen,
  });
  const customers: Customer[] = customersData?.data ?? [];

  // グループCRUD
  const saveGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; member_project_ids: string[] }) => {
      if (editingGroupId) {
        return (await api.put(`/project-groups/${editingGroupId}`, data)).data;
      }
      return (await api.post("/project-groups", data)).data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["project-groups"] });
      qc.invalidateQueries({ queryKey: ["project-group-detail"] });
      closeGroupDialog();
      setSelectedGroupId(result.data.id);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/project-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-groups"] });
      setSelectedGroupId(null);
    },
  });

  // 編集中のID
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editingRevenueId, setEditingRevenueId] = useState<string | null>(null);

  // グループ仕入（新規 or 更新）
  const savePurchaseMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingPurchaseId) {
        return (await api.put(`/project-groups/${selectedGroupId}/purchases/${editingPurchaseId}`, data)).data;
      }
      return (await api.post(`/project-groups/${selectedGroupId}/purchases`, data)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group-detail", selectedGroupId] });
      qc.invalidateQueries({ queryKey: ["purchases-all"] });
      closePurchaseDialog();
    },
  });

  // グループ仕入削除
  const deletePurchaseMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      return (await api.delete(`/project-groups/${selectedGroupId}/purchases/${purchaseId}`)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group-detail", selectedGroupId] });
      qc.invalidateQueries({ queryKey: ["purchases-all"] });
      qc.invalidateQueries({ queryKey: ["project-groups"] });
    },
  });

  // グループ売上（新規 or 更新）
  const saveRevenueMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingRevenueId) {
        return (await api.put(`/project-groups/${selectedGroupId}/revenues/${editingRevenueId}`, data)).data;
      }
      return (await api.post(`/project-groups/${selectedGroupId}/revenues`, data)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group-detail", selectedGroupId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      qc.invalidateQueries({ queryKey: ["project-groups"] });
      closeRevenueDialog();
    },
  });

  // グループ売上削除
  const deleteRevenueMutation = useMutation({
    mutationFn: async (revenueId: string) => {
      return (await api.delete(`/project-groups/${selectedGroupId}/revenues/${revenueId}`)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group-detail", selectedGroupId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      qc.invalidateQueries({ queryKey: ["project-groups"] });
    },
  });

  const closeGroupDialog = () => {
    setGroupDialogOpen(false);
    setEditingGroupId(null);
    setGroupName("");
    setGroupDesc("");
    setSelectedMemberIds([]);
  };

  const openEditGroup = () => {
    if (!detail) return;
    setEditingGroupId(detail.id);
    setGroupName(detail.name);
    setGroupDesc(detail.description || "");
    setSelectedMemberIds(detail.members.map((m) => m.id));
    setGroupDialogOpen(true);
  };

  const closePurchaseDialog = () => {
    setPurchaseDialogOpen(false);
    setEditingPurchaseId(null);
    setPurVendorId("");
    setPurAmount(0);
    setPurDesc("");
    setPurTax("tax10");
    setPurSettlement("rakuraku");
    setPurSettlementNo("");
    setPurRecDate("");
    setPurAllocMode("equal");
    setCustomAllocations({});
  };

  const openEditPurchase = (pu: any) => {
    setEditingPurchaseId(pu.id);
    setPurVendorId(pu.vendor_id || "");
    setPurAmount(pu.amount || 0);
    setPurDesc(pu.description || "");
    setPurTax(pu.tax_category || "tax10");
    setPurSettlement(pu.settlement_method || "rakuraku");
    setPurSettlementNo(pu.settlement_number || "");
    setPurRecDate(pu.recognition_date?.slice(0, 10) || "");
    // 按分モード: カスタムアロケーションがあればcustom
    if (pu.allocations && pu.allocations.length > 0) {
      const allEqual = pu.allocations.every((a: Allocation) =>
        Math.abs(a.allocated_amount - pu.amount / pu.allocations.length) <= 1
      );
      if (allEqual) {
        setPurAllocMode("equal");
        setCustomAllocations({});
      } else {
        setPurAllocMode("custom");
        const ca: Record<string, number> = {};
        pu.allocations.forEach((a: Allocation) => { ca[a.project_id] = a.allocated_amount; });
        setCustomAllocations(ca);
      }
    }
    setPurchaseDialogOpen(true);
  };

  const closeRevenueDialog = () => {
    setRevenueDialogOpen(false);
    setEditingRevenueId(null);
    setRevCustomerId("");
    setRevTax("tax10");
    setRevSubtitle("");
    setRevRecDate("");
    setRevBillingDate("");
    setRevNotes("");
    setRevStatus("confirmed");
    setRevItems([{ description: "", quantity: 1, unit_price: 0, amount: 0 }]);
    setRevAllocMode("equal");
    setRevCustomAllocations({});
  };

  const openEditRevenue = (rev: any) => {
    setEditingRevenueId(rev.id);
    setRevCustomerId(rev.customer_id || "");
    setRevTax(rev.tax_category || "tax10");
    setRevSubtitle(rev.subtitle || "");
    setRevRecDate(rev.recognition_date?.slice(0, 10) || "");
    setRevBillingDate(rev.billing_date?.slice(0, 10) || "");
    setRevNotes(rev.notes || "");
    setRevStatus(rev.status || "confirmed");
    if (rev.items && rev.items.length > 0) {
      setRevItems(rev.items.map((it: any) => ({
        description: it.description || "",
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        amount: it.amount || 0,
      })));
    } else {
      setRevItems([{ description: "", quantity: 1, unit_price: 0, amount: 0 }]);
    }
    if (rev.allocations && rev.allocations.length > 0) {
      const revAmt = rev.amount || 0;
      const allEqual = rev.allocations.every((a: Allocation) =>
        Math.abs(a.allocated_amount - revAmt / rev.allocations.length) <= 1
      );
      if (allEqual) {
        setRevAllocMode("equal");
        setRevCustomAllocations({});
      } else {
        setRevAllocMode("custom");
        const ca: Record<string, number> = {};
        rev.allocations.forEach((a: Allocation) => { ca[a.project_id] = a.allocated_amount; });
        setRevCustomAllocations(ca);
      }
    }
    setRevenueDialogOpen(true);
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // 按分プレビュー
  const allocPreview = useMemo(() => {
    if (!detail || detail.members.length === 0 || !purAmount) return [];
    const members = detail.members;
    if (purAllocMode === "equal") {
      const per = Math.floor(purAmount / members.length);
      const remainder = purAmount - per * members.length;
      return members.map((m, idx) => ({
        project_id: m.id,
        gls_number: m.gls_number,
        name: m.name,
        allocated_amount: per + (idx === 0 ? remainder : 0),
      }));
    }
    // custom
    return members.map((m) => ({
      project_id: m.id,
      gls_number: m.gls_number,
      name: m.name,
      allocated_amount: customAllocations[m.id] || 0,
    }));
  }, [detail, purAmount, purAllocMode, customAllocations]);

  const customTotal = allocPreview.reduce((s, a) => s + a.allocated_amount, 0);

  // 売上按分プレビュー
  const revTotal = revItems.reduce((s, it) => s + it.amount, 0);
  const revAllocPreview = useMemo(() => {
    if (!detail || detail.members.length === 0 || !revTotal) return [];
    const members = detail.members;
    if (revAllocMode === "equal") {
      const per = Math.floor(revTotal / members.length);
      const remainder = revTotal - per * members.length;
      return members.map((m, idx) => ({
        project_id: m.id,
        gls_number: m.gls_number,
        name: m.name,
        allocated_amount: per + (idx === 0 ? remainder : 0),
      }));
    }
    return members.map((m) => ({
      project_id: m.id,
      gls_number: m.gls_number,
      name: m.name,
      allocated_amount: revCustomAllocations[m.id] || 0,
    }));
  }, [detail, revTotal, revAllocMode, revCustomAllocations]);

  const revCustomTotal = revAllocPreview.reduce((s, a) => s + a.allocated_amount, 0);

  const handleRevenueSubmit = () => {
    saveRevenueMutation.mutate({
      customer_id: revCustomerId,
      tax_category: revTax,
      subtitle: revSubtitle || null,
      recognition_date: revRecDate || null,
      billing_date: revBillingDate || null,
      notes: revNotes || null,
      status: revStatus,
      items: revItems.filter((it) => it.description || it.amount),
      allocations: revAllocPreview.map((a) => ({
        project_id: a.project_id,
        allocated_amount: a.allocated_amount,
      })),
    });
  };

  const updateRevItem = (idx: number, field: keyof RevenueItem, value: string | number) => {
    setRevItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        next[idx].amount = (next[idx].quantity || 0) * (next[idx].unit_price || 0);
      }
      return next;
    });
  };

  const addRevItem = () => {
    setRevItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, amount: 0 }]);
  };

  const removeRevItem = (idx: number) => {
    setRevItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePurchaseSubmit = () => {
    savePurchaseMutation.mutate({
      vendor_id: purVendorId,
      amount: purAmount,
      description: purDesc || null,
      tax_category: purTax,
      settlement_method: purSettlement,
      settlement_number: purSettlementNo || null,
      invoice_qualified: true,
      recognition_date: purRecDate || null,
      allocations: allocPreview.map((a) => ({
        project_id: a.project_id,
        allocated_amount: a.allocated_amount,
      })),
    });
  };

  // 詳細ビュー
  if (selectedGroupId) {
    return (
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setSelectedGroupId(null)}>
            <ArrowLeft className="h-4 w-4" />
            グループ一覧
          </Button>
          {detail ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl lg:text-2xl font-bold">{detail.name}</h1>
                <Badge variant="outline">{detail.members.length}案件</Badge>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={openEditGroup}>
                    <Pencil className="h-4 w-4 mr-1" />編集
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => {
                    if (confirm("このグループを削除しますか？")) deleteGroupMutation.mutate(detail.id);
                  }}>
                    <Trash2 className="h-4 w-4 mr-1" />削除
                  </Button>
                </div>
              </div>
              {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

              {/* メンバー案件 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">所属案件</CardTitle>
                </CardHeader>
                <CardContent>
                  {detail.members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">案件が登録されていません</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                          <div>
                            <span className="font-mono text-primary mr-2">{m.gls_number}</span>
                            <span>{m.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{m.customer_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* グループ売上 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    グループ売上（按分）
                  </h2>
                  <Button size="sm" onClick={() => setRevenueDialogOpen(true)} disabled={detail.members.length === 0}>
                    <Plus className="h-4 w-4 mr-1" />
                    売上追加
                  </Button>
                </div>

                {detail.revenues.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      グループ売上がありません
                    </CardContent>
                  </Card>
                ) : (
                  detail.revenues.map((rev) => (
                    <Card key={rev.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold">{rev.billing_key}</span>
                              {rev.subtitle && <span className="text-sm">{rev.subtitle}</span>}
                              <Badge variant="outline" className="text-[10px]">
                                {rev.status === "estimate" ? "見積" : "確定"}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {rev.customer_name}
                              {rev.recognition_date && ` / ${formatDate(rev.recognition_date)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-number text-lg font-bold">{formatCurrency(rev.amount)}</span>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRevenue(rev)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                                if (confirm("この売上を削除しますか？")) deleteRevenueMutation.mutate(rev.id);
                              }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        {rev.items && rev.items.length > 0 && (
                          <div className="mt-2 border-t pt-2">
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
                        {rev.allocations && rev.allocations.length > 0 && (
                          <div className="mt-2 border-t pt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">按分内訳</p>
                            {rev.allocations.map((a: Allocation, i: number) => (
                              <div key={i} className="flex justify-between text-xs py-0.5">
                                <span className="font-mono">{a.gls_number} {a.project_name}</span>
                                <span className="font-number font-medium">{formatCurrency(a.allocated_amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* グループ仕入 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    グループ仕入（按分）
                  </h2>
                  <Button size="sm" onClick={() => setPurchaseDialogOpen(true)} disabled={detail.members.length === 0}>
                    <Plus className="h-4 w-4 mr-1" />
                    仕入追加
                  </Button>
                </div>

                {detail.purchases.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      グループ仕入がありません
                    </CardContent>
                  </Card>
                ) : (
                  detail.purchases.map((pu) => (
                    <Card key={pu.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{pu.description || "（説明なし）"}</div>
                            <div className="text-xs text-muted-foreground">{pu.vendor_name}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-number text-lg font-bold">{formatCurrency(pu.amount)}</span>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPurchase(pu)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                                if (confirm("この仕入を削除しますか？")) deletePurchaseMutation.mutate(pu.id);
                              }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        {pu.allocations && pu.allocations.length > 0 && (
                          <div className="mt-3 border-t pt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">按分内訳</p>
                            {pu.allocations.map((a: Allocation, i: number) => (
                              <div key={i} className="flex justify-between text-xs py-0.5">
                                <span className="font-mono">{a.gls_number} {a.project_name}</span>
                                <span className="font-number font-medium">{formatCurrency(a.allocated_amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* 合計 */}
              {(detail.purchases.length > 0 || detail.revenues.length > 0) && (
                <div className="flex justify-end gap-4 flex-wrap">
                  {detail.revenues.length > 0 && (
                    <div className="rounded-lg bg-muted p-3 text-right">
                      <span className="text-sm text-muted-foreground mr-3">グループ売上合計</span>
                      <span className="text-lg font-bold font-number">{formatCurrency(detail.total_revenue)}</span>
                    </div>
                  )}
                  {detail.purchases.length > 0 && (
                    <div className="rounded-lg bg-muted p-3 text-right">
                      <span className="text-sm text-muted-foreground mr-3">グループ仕入合計</span>
                      <span className="text-lg font-bold font-number">{formatCurrency(detail.total_purchase)}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* 仕入登録ダイアログ */}
        <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPurchaseId ? 'グループ仕入編集' : 'グループ仕入登録'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>仕入先 *</Label>
                <SearchableSelect
                  options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
                  value={purVendorId}
                  onChange={setPurVendorId}
                  placeholder="仕入先を検索..."
                />
              </div>
              <div>
                <Label>金額 *</Label>
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
                      {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((k) => (
                        <SelectItem key={k} value={k}>{TaxCategoryLabels[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>精算方法</Label>
                  <Select value={purSettlement} onValueChange={setPurSettlement}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map((k) => (
                        <SelectItem key={k} value={k}>{SettlementMethodLabels[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>精算番号</Label>
                  <Input value={purSettlementNo} onChange={(e) => setPurSettlementNo(e.target.value)} placeholder="任意" />
                </div>
                <div>
                  <Label>計上日</Label>
                  <Input type="date" value={purRecDate} onChange={(e) => setPurRecDate(e.target.value)} />
                </div>
              </div>

              {/* 按分設定 */}
              {detail && detail.members.length > 0 && purAmount > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-semibold">按分方法</Label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" checked={purAllocMode === "equal"} onChange={() => setPurAllocMode("equal")} className="accent-primary" />
                        均等按分
                      </label>
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" checked={purAllocMode === "custom"} onChange={() => setPurAllocMode("custom")} className="accent-primary" />
                        任意比率
                      </label>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    {allocPreview.map((a) => (
                      <div key={a.project_id} className="flex items-center justify-between gap-2">
                        <span className="text-sm">
                          <span className="font-mono text-primary mr-1">{a.gls_number}</span>
                          {a.name}
                        </span>
                        {purAllocMode === "custom" ? (
                          <CurrencyInput
                            value={customAllocations[a.project_id] || 0}
                            onChange={(v) => setCustomAllocations((prev) => ({ ...prev, [a.project_id]: v }))}
                          />
                        ) : (
                          <span className="font-number font-medium text-sm">{formatCurrency(a.allocated_amount)}</span>
                        )}
                      </div>
                    ))}
                    {purAllocMode === "custom" && (
                      <div className="flex justify-between border-t pt-2 text-sm">
                        <span className="font-medium">按分合計</span>
                        <span className={`font-number font-bold ${customTotal !== purAmount ? 'text-destructive' : ''}`}>
                          {formatCurrency(customTotal)} / {formatCurrency(purAmount)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closePurchaseDialog}>キャンセル</Button>
              <Button
                onClick={handlePurchaseSubmit}
                disabled={
                  !purVendorId || !purAmount || savePurchaseMutation.isPending ||
                  (purAllocMode === "custom" && customTotal !== purAmount)
                }
              >
                {savePurchaseMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                登録
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 売上登録ダイアログ */}
        <Dialog open={revenueDialogOpen} onOpenChange={setRevenueDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRevenueId ? 'グループ売上編集' : 'グループ売上登録'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>顧客 *</Label>
                <SearchableSelect
                  options={customers.map((c) => ({ value: c.id, label: c.name, subLabel: c.short_name || '' }))}
                  value={revCustomerId}
                  onChange={setRevCustomerId}
                  placeholder="顧客を検索..."
                />
              </div>
              <div>
                <Label>件名</Label>
                <Input value={revSubtitle} onChange={(e) => setRevSubtitle(e.target.value)} placeholder="見積件名" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ステータス</Label>
                  <Select value={revStatus} onValueChange={(v) => setRevStatus(v as "estimate" | "confirmed")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="estimate">見積</SelectItem>
                      <SelectItem value="confirmed">確定</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>税区分</Label>
                  <Select value={revTax} onValueChange={setRevTax}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((k) => (
                        <SelectItem key={k} value={k}>{TaxCategoryLabels[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>計上日</Label>
                  <Input type="date" value={revRecDate} onChange={(e) => setRevRecDate(e.target.value)} />
                </div>
                <div>
                  <Label>請求日</Label>
                  <Input type="date" value={revBillingDate} onChange={(e) => setRevBillingDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>備考</Label>
                <Input value={revNotes} onChange={(e) => setRevNotes(e.target.value)} placeholder="備考" />
              </div>

              {/* 明細行 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">明細項目</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addRevItem}>
                    <Plus className="h-3 w-3 mr-1" />行追加
                  </Button>
                </div>
                {revItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      {idx === 0 && <Label className="text-xs">項目名</Label>}
                      <Input value={item.description} onChange={(e) => updateRevItem(idx, "description", e.target.value)} placeholder="項目" />
                    </div>
                    <div className="w-16">
                      {idx === 0 && <Label className="text-xs">数量</Label>}
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateRevItem(idx, "quantity", Number(e.target.value))} />
                    </div>
                    <div className="w-28">
                      {idx === 0 && <Label className="text-xs">単価</Label>}
                      <CurrencyInput value={item.unit_price} onChange={(v) => updateRevItem(idx, "unit_price", v)} />
                    </div>
                    <div className="w-28">
                      {idx === 0 && <Label className="text-xs">金額</Label>}
                      <div className="h-9 flex items-center justify-end text-sm font-number font-medium">
                        {formatCurrency(item.amount)}
                      </div>
                    </div>
                    {revItems.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeRevItem(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex justify-end text-sm">
                  <span className="text-muted-foreground mr-2">合計:</span>
                  <span className="font-number font-bold">{formatCurrency(revTotal)}</span>
                </div>
              </div>

              {/* 按分設定 */}
              {detail && detail.members.length > 0 && revTotal > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-semibold">按分方法</Label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" checked={revAllocMode === "equal"} onChange={() => setRevAllocMode("equal")} className="accent-primary" />
                        均等按分
                      </label>
                      <label className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="radio" checked={revAllocMode === "custom"} onChange={() => setRevAllocMode("custom")} className="accent-primary" />
                        任意比率
                      </label>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    {revAllocPreview.map((a) => (
                      <div key={a.project_id} className="flex items-center justify-between gap-2">
                        <span className="text-sm">
                          <span className="font-mono text-primary mr-1">{a.gls_number}</span>
                          {a.name}
                        </span>
                        {revAllocMode === "custom" ? (
                          <CurrencyInput
                            value={revCustomAllocations[a.project_id] || 0}
                            onChange={(v) => setRevCustomAllocations((prev) => ({ ...prev, [a.project_id]: v }))}
                          />
                        ) : (
                          <span className="font-number font-medium text-sm">{formatCurrency(a.allocated_amount)}</span>
                        )}
                      </div>
                    ))}
                    {revAllocMode === "custom" && (
                      <div className="flex justify-between border-t pt-2 text-sm">
                        <span className="font-medium">按分合計</span>
                        <span className={`font-number font-bold ${revCustomTotal !== revTotal ? 'text-destructive' : ''}`}>
                          {formatCurrency(revCustomTotal)} / {formatCurrency(revTotal)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeRevenueDialog}>キャンセル</Button>
              <Button
                onClick={handleRevenueSubmit}
                disabled={
                  !revCustomerId || revTotal <= 0 || saveRevenueMutation.isPending ||
                  (revAllocMode === "custom" && revCustomTotal !== revTotal)
                }
              >
                {saveRevenueMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                登録
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* グループ編集ダイアログ（共通） */}
        <GroupFormDialog
          open={groupDialogOpen}
          onClose={closeGroupDialog}
          glsProjects={glsProjects}
          name={groupName}
          setName={setGroupName}
          desc={groupDesc}
          setDesc={setGroupDesc}
          selectedIds={selectedMemberIds}
          toggleMember={toggleMember}
          onSubmit={() => saveGroupMutation.mutate({ name: groupName, description: groupDesc, member_project_ids: selectedMemberIds })}
          isPending={saveGroupMutation.isPending}
          isEdit={!!editingGroupId}
        />
      </div>
    );
  }

  // 一覧ビュー
  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/purchases")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl lg:text-2xl font-bold">按分グループ</h1>
        </div>
        <Button onClick={() => { closeGroupDialog(); setGroupDialogOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" />
          新規グループ
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>按分グループがありません</p>
            <p className="text-xs mt-1">複数案件で費用を共有する場合にグループを作成してください</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedGroupId(g.id)}>
              <CardContent className="p-4">
                <div className="font-medium">{g.name}</div>
                {g.description && <p className="text-xs text-muted-foreground mt-1 truncate">{g.description}</p>}
                <div className="flex items-center justify-between mt-3">
                  <Badge variant="outline">{g.member_count}案件</Badge>
                  <div className="text-right text-xs">
                    {g.total_revenue > 0 && <div className="font-number">売上 {formatCurrency(g.total_revenue)}</div>}
                    {g.total_purchase > 0 && <div className="font-number">仕入 {formatCurrency(g.total_purchase)}</div>}
                    {g.total_revenue === 0 && g.total_purchase === 0 && <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GroupFormDialog
        open={groupDialogOpen}
        onClose={closeGroupDialog}
        glsProjects={glsProjects}
        name={groupName}
        setName={setGroupName}
        desc={groupDesc}
        setDesc={setGroupDesc}
        selectedIds={selectedMemberIds}
        toggleMember={toggleMember}
        onSubmit={() => saveGroupMutation.mutate({ name: groupName, description: groupDesc, member_project_ids: selectedMemberIds })}
        isPending={saveGroupMutation.isPending}
        isEdit={!!editingGroupId}
      />
    </div>
    </PageTransition>
  );
}

// グループ作成/編集ダイアログ（共通コンポーネント）
function GroupFormDialog({ open, onClose, glsProjects, name, setName, desc, setDesc, selectedIds, toggleMember, onSubmit, isPending, isEdit }: {
  open: boolean;
  onClose: () => void;
  glsProjects: GlsProject[];
  name: string;
  setName: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  selectedIds: string[];
  toggleMember: (id: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  isEdit: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "グループ編集" : "新規按分グループ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>グループ名 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: GH 2026年度 IR関連" />
          </div>
          <div>
            <Label>説明</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="グループの目的・対象案件の説明" rows={2} />
          </div>
          <div>
            <Label>所属案件 *</Label>
            <div className="max-h-48 overflow-y-auto rounded border p-2 space-y-1 mt-1">
              {glsProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">GLS発番済み案件がありません</p>
              ) : (
                glsProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-accent">
                    <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggleMember(p.id)} />
                    <span className="text-sm">
                      <span className="font-mono text-primary mr-1">{p.gls_number}</span>
                      {p.name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">{p.customer_name}</span>
                  </label>
                ))
              )}
            </div>
            {selectedIds.length > 0 && <p className="text-xs text-muted-foreground mt-1">{selectedIds.length}案件選択中</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={onSubmit} disabled={!name || selectedIds.length < 2 || isPending}>
            {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? "更新" : "作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
