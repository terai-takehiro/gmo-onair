import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
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
} from "lucide-react";

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  total_purchase: number;
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
  vendor_name: string;
  recognition_date: string;
  allocations: Allocation[];
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  total_purchase: number;
  members: GroupMember[];
  purchases: GroupPurchase[];
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

  // グループ仕入
  const savePurchaseMutation = useMutation({
    mutationFn: async (data: any) => {
      return (await api.post(`/project-groups/${selectedGroupId}/purchases`, data)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group-detail", selectedGroupId] });
      qc.invalidateQueries({ queryKey: ["purchases-all"] });
      closePurchaseDialog();
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
                          <span className="font-number text-lg font-bold">{formatCurrency(pu.amount)}</span>
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
              {detail.purchases.length > 0 && (
                <div className="flex justify-end">
                  <div className="rounded-lg bg-muted p-3 text-right">
                    <span className="text-sm text-muted-foreground mr-3">グループ仕入合計</span>
                    <span className="text-lg font-bold font-number">{formatCurrency(detail.total_purchase)}</span>
                  </div>
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
              <DialogTitle>グループ仕入登録</DialogTitle>
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
                  <span className="font-number text-sm font-medium">{formatCurrency(g.total_purchase)}</span>
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
