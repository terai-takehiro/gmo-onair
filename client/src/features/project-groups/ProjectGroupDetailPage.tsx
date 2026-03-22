import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type {
  Project,
  Purchase,
  PurchaseAllocation,
  Vendor,
} from "@/types";
import {
  SettlementMethodLabels,
  TaxCategoryLabels,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Plus, Trash2, Calculator, Pencil, Loader2,
} from "lucide-react";

// ---------- Purchase form ----------
interface PurchaseForm {
  vendor_id: string;
  amount: string;
  description: string;
  tax_category: string;
  settlement_method: string;
  invoice_qualified: boolean;
  recognition_date: string;
  notes: string;
}

export default function ProjectGroupDetailPage() {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ---------- Group detail ----------
  const { data: groupData, isLoading: groupLoading } = useQuery({
    queryKey: ["project-group", groupId],
    queryFn: async () => (await api.get(`/project-groups/${groupId}`)).data,
    enabled: !!groupId,
  });
  const group = groupData?.data;
  const projects: Project[] = group?.projects ?? [];
  const purchases: Purchase[] = group?.purchases ?? [];

  // ---------- Vendors ----------
  const { data: vendorData } = useQuery({
    queryKey: ["vendors-all"],
    queryFn: async () => (await api.get("/vendors", { params: { limit: 200 } })).data,
  });
  const vendors: Vendor[] = vendorData?.data ?? [];

  // ---------- Project add dialog ----------
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const { data: unassignedData } = useQuery({
    queryKey: ["projects-unassigned", projectSearch],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 50, unassigned_group: "true" };
      if (projectSearch) params.search = projectSearch;
      return (await api.get("/projects", { params })).data;
    },
    enabled: addProjectOpen,
  });
  const unassignedProjects: Project[] = unassignedData?.data ?? [];

  const addProjectsMutation = useMutation({
    mutationFn: (project_ids: string[]) =>
      api.post(`/project-groups/${groupId}/projects`, { project_ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group", groupId] });
      setAddProjectOpen(false);
      setSelectedProjectIds([]);
      setProjectSearch("");
    },
  });

  const removeProjectMutation = useMutation({
    mutationFn: (projectId: string) =>
      api.delete(`/project-groups/${groupId}/projects/${projectId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group", groupId] });
    },
  });

  // ---------- Purchase dialog ----------
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const purchaseForm = useForm<PurchaseForm>({
    defaultValues: {
      vendor_id: "",
      amount: "",
      description: "",
      tax_category: "tax10",
      settlement_method: "rakuraku",
      invoice_qualified: true,
      recognition_date: "",
      notes: "",
    },
  });

  function openCreatePurchase() {
    setEditingPurchase(null);
    purchaseForm.reset({
      vendor_id: "",
      amount: "",
      description: "",
      tax_category: "tax10",
      settlement_method: "rakuraku",
      invoice_qualified: true,
      recognition_date: "",
      notes: "",
    });
    setPurchaseDialogOpen(true);
  }

  function openEditPurchase(p: Purchase) {
    setEditingPurchase(p);
    purchaseForm.reset({
      vendor_id: p.vendor_id,
      amount: String(p.amount),
      description: p.description ?? "",
      tax_category: p.tax_category,
      settlement_method: p.settlement_method ?? "rakuraku",
      invoice_qualified: p.invoice_qualified,
      recognition_date: p.recognition_date ?? "",
      notes: p.notes ?? "",
    });
    setPurchaseDialogOpen(true);
  }

  const createPurchaseMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post(`/project-groups/${groupId}/purchases`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group", groupId] });
      setPurchaseDialogOpen(false);
    },
  });

  const updatePurchaseMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.put(`/project-groups/${groupId}/purchases/${editingPurchase!.id}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group", groupId] });
      setPurchaseDialogOpen(false);
    },
  });

  const deletePurchaseMutation = useMutation({
    mutationFn: (purchaseId: string) =>
      api.delete(`/project-groups/${groupId}/purchases/${purchaseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-group", groupId] });
    },
  });

  const allocateMutation = useMutation({
    mutationFn: (purchaseId: string) =>
      api.post(`/project-groups/${groupId}/purchases/${purchaseId}/allocate`),
    onSuccess: (_data, purchaseId) => {
      qc.invalidateQueries({ queryKey: ["project-group", groupId] });
      qc.invalidateQueries({ queryKey: ["group-allocations", purchaseId] });
    },
  });

  function onSubmitPurchase(values: PurchaseForm) {
    const payload = {
      vendor_id: values.vendor_id,
      amount: Number(values.amount),
      description: values.description || undefined,
      tax_category: values.tax_category,
      settlement_method: values.settlement_method,
      invoice_qualified: values.invoice_qualified,
      recognition_date: values.recognition_date || undefined,
      notes: values.notes || undefined,
    };
    if (editingPurchase) {
      updatePurchaseMutation.mutate(payload);
    } else {
      createPurchaseMutation.mutate(payload);
    }
  }

  // ---------- Allocation expand ----------
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);

  function toggleExpand(purchaseId: string) {
    setExpandedPurchaseId((prev) => (prev === purchaseId ? null : purchaseId));
  }

  if (groupLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        グループが見つかりません。
      </div>
    );
  }

  const isSavingPurchase = createPurchaseMutation.isPending || updatePurchaseMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/project-groups")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          {group.description && (
            <p className="text-sm text-muted-foreground">{group.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {group.period_start && (
            <Badge variant="outline">{formatDate(group.period_start)}</Badge>
          )}
          {group.period_end && (
            <Badge variant="outline">{formatDate(group.period_end)}</Badge>
          )}
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">子案件一覧</TabsTrigger>
          <TabsTrigger value="purchases">共通仕入</TabsTrigger>
        </TabsList>

        {/* ==================== Tab 1: Projects ==================== */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddProjectOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              案件追加
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GLS番号</TableHead>
                <TableHead>案件名</TableHead>
                <TableHead>顧客</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">按分仕入合計</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    子案件がありません
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-primary">{p.gls_number}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.customer_name ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(p.group_allocated_cost)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("このグループから案件を外しますか？")) {
                            removeProjectMutation.mutate(p.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* ==================== Tab 2: Purchases ==================== */}
        <TabsContent value="purchases" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreatePurchase}>
              <Plus className="mr-2 h-4 w-4" />
              仕入追加
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>仕入先</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>按分状況</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    共通仕入がありません
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((p) => (
                  <PurchaseRow
                    key={p.id}
                    purchase={p}
                    groupId={groupId!}
                    expanded={expandedPurchaseId === p.id}
                    onToggle={() => toggleExpand(p.id)}
                    onEdit={() => openEditPurchase(p)}
                    onDelete={() => {
                      if (confirm("この仕入を削除しますか？")) {
                        deletePurchaseMutation.mutate(p.id);
                      }
                    }}
                    onAllocate={() => allocateMutation.mutate(p.id)}
                    isAllocating={allocateMutation.isPending}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* ==================== Add project dialog ==================== */}
      <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>案件追加</DialogTitle>
            <DialogDescription>
              グループに追加する案件を選択してください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="GLS番号・案件名で検索..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
            />
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {unassignedProjects.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  該当する案件がありません
                </p>
              ) : (
                unassignedProjects.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjectIds((prev) => [...prev, p.id]);
                        } else {
                          setSelectedProjectIds((prev) =>
                            prev.filter((id) => id !== p.id)
                          );
                        }
                      }}
                    />
                    <span className="text-sm text-primary">{p.gls_number}</span>
                    <span className="text-sm">{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddProjectOpen(false);
                setSelectedProjectIds([]);
                setProjectSearch("");
              }}
            >
              キャンセル
            </Button>
            <Button
              disabled={selectedProjectIds.length === 0 || addProjectsMutation.isPending}
              onClick={() => addProjectsMutation.mutate(selectedProjectIds)}
            >
              {addProjectsMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              追加 ({selectedProjectIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Purchase dialog ==================== */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPurchase ? "仕入編集" : "仕入追加"}
            </DialogTitle>
            <DialogDescription>
              共通仕入の情報を入力してください。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={purchaseForm.handleSubmit(onSubmitPurchase)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>仕入先 *</Label>
              <Select
                value={purchaseForm.watch("vendor_id")}
                onValueChange={(v) => purchaseForm.setValue("vendor_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="仕入先を選択" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">金額 *</Label>
              <Input
                id="amount"
                type="number"
                {...purchaseForm.register("amount", { required: true })}
                placeholder="1000000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">摘要</Label>
              <Input
                id="description"
                {...purchaseForm.register("description")}
                placeholder="仕入の摘要"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>税区分</Label>
                <Select
                  value={purchaseForm.watch("tax_category")}
                  onValueChange={(v) => purchaseForm.setValue("tax_category", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TaxCategoryLabels).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>精算方法</Label>
                <Select
                  value={purchaseForm.watch("settlement_method")}
                  onValueChange={(v) => purchaseForm.setValue("settlement_method", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SettlementMethodLabels).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="recognition_date">計上日</Label>
                <Input
                  id="recognition_date"
                  type="date"
                  {...purchaseForm.register("recognition_date")}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...purchaseForm.register("invoice_qualified")}
                  />
                  適格請求書
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                {...purchaseForm.register("notes")}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPurchaseDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isSavingPurchase}>
                {isSavingPurchase && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingPurchase ? "更新" : "追加"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Purchase Row with Allocation Expand ====================

interface PurchaseRowProps {
  purchase: Purchase;
  groupId: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAllocate: () => void;
  isAllocating: boolean;
}

function PurchaseRow({
  purchase,
  groupId,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAllocate,
  isAllocating,
}: PurchaseRowProps) {
  const qc = useQueryClient();

  const { data: allocData, isLoading: allocLoading } = useQuery({
    queryKey: ["group-allocations", purchase.id],
    queryFn: async () =>
      (await api.get(`/project-groups/${groupId}/purchases/${purchase.id}/allocations`)).data,
    enabled: expanded,
  });
  const allocations: PurchaseAllocation[] = allocData?.data ?? [];

  const [editedAllocations, setEditedAllocations] = useState<
    Record<string, string>
  >({});

  // Sync local edit state when allocations load
  // Reset edited allocations when allocations change
  const allocKey = allocations.map((a) => `${a.project_id}:${a.allocated_amount}`).join(",");
  void allocKey; // used for dependency tracking

  function handleAllocChange(projectId: string, value: string) {
    setEditedAllocations((prev) => ({ ...prev, [projectId]: value }));
  }

  const saveAllocationsMutation = useMutation({
    mutationFn: (allocs: { project_id: string; allocated_amount: number }[]) =>
      api.put(`/project-groups/${groupId}/purchases/${purchase.id}/allocations`, {
        allocations: allocs,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-allocations", purchase.id] });
      qc.invalidateQueries({ queryKey: ["project-group", groupId] });
      setEditedAllocations({});
    },
  });

  function saveAllocations() {
    const allocs = allocations.map((a) => ({
      project_id: a.project_id,
      allocated_amount:
        editedAllocations[a.project_id] !== undefined
          ? Number(editedAllocations[a.project_id])
          : a.allocated_amount,
    }));
    saveAllocationsMutation.mutate(allocs);
  }

  const allocationStatus =
    (purchase.allocation_count ?? 0) > 0
      ? `${purchase.allocation_count}件按分済`
      : "未按分";

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={onToggle}
      >
        <TableCell>{purchase.vendor_name ?? "-"}</TableCell>
        <TableCell>{purchase.description ?? "-"}</TableCell>
        <TableCell className="text-right font-medium">
          {formatCurrency(purchase.amount)}
        </TableCell>
        <TableCell>
          <Badge variant={(purchase.allocation_count ?? 0) > 0 ? "default" : "secondary"}>
            {allocationStatus}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              title="一括按分"
              onClick={onAllocate}
              disabled={isAllocating}
            >
              <Calculator className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/50 p-4">
            {allocLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : allocations.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                按分データがありません。「一括按分」ボタンで均等按分できます。
              </p>
            ) : (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GLS番号</TableHead>
                      <TableHead>案件名</TableHead>
                      <TableHead className="text-right">按分額</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-primary">
                          {a.gls_number ?? "-"}
                        </TableCell>
                        <TableCell>{a.project_name ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="w-32 ml-auto text-right"
                            value={
                              editedAllocations[a.project_id] !== undefined
                                ? editedAllocations[a.project_id]
                                : String(a.allocated_amount)
                            }
                            onChange={(e) =>
                              handleAllocChange(a.project_id, e.target.value)
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={saveAllocations}
                    disabled={saveAllocationsMutation.isPending}
                  >
                    {saveAllocationsMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    按分額を保存
                  </Button>
                </div>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
