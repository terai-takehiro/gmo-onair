import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatDate, formatCurrency } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import { Loader2, Plus, Pencil } from "lucide-react";

type RecordType = "breakdown" | "repair" | "maintenance" | "inspection";
type MaintStatus = "reported" | "in_progress" | "completed" | "cancelled";

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "すべて", value: "" },
  { label: "報告済", value: "reported" },
  { label: "対応中", value: "in_progress" },
  { label: "完了", value: "completed" },
  { label: "キャンセル", value: "cancelled" },
];

const TYPE_OPTIONS: { label: string; value: RecordType }[] = [
  { label: "故障", value: "breakdown" },
  { label: "修理", value: "repair" },
  { label: "定期メンテ", value: "maintenance" },
  { label: "点検", value: "inspection" },
];

const typeLabels: Record<RecordType, string> = {
  breakdown: "故障",
  repair: "修理",
  maintenance: "定期メンテ",
  inspection: "点検",
};

const typeBadgeClass: Record<RecordType, string> = {
  breakdown: "bg-red-100 text-red-700",
  repair: "bg-orange-100 text-orange-700",
  maintenance: "bg-blue-100 text-blue-700",
  inspection: "bg-gray-100 text-gray-700",
};

const statusLabels: Record<MaintStatus, string> = {
  reported: "報告済",
  in_progress: "対応中",
  completed: "完了",
  cancelled: "キャンセル",
};

const statusBadgeClass: Record<MaintStatus, string> = {
  reported: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
};

function TypeBadge({ type }: { type: RecordType }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeClass[type] ?? "bg-gray-100 text-gray-700"}`}>
      {typeLabels[type] ?? type}
    </span>
  );
}

function MaintStatusBadge({ status }: { status: MaintStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass[status] ?? "bg-gray-100 text-gray-700"}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

interface MaintenanceRecord {
  id: string;
  equipment_id: string;
  equipment_name: string;
  eq_code: string;
  record_type: RecordType;
  title: string;
  description: string;
  reported_by: string;
  reported_at: string;
  assigned_to: string;
  vendor_name: string;
  repair_cost: number | null;
  started_at: string | null;
  completed_at: string | null;
  status: MaintStatus;
  result: string | null;
}

interface EquipmentOption {
  id: string;
  name: string;
  eq_code: string;
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MaintenanceRecord | null>(null);

  // Create form
  const [equipmentId, setEquipmentId] = useState("");
  const [recordType, setRecordType] = useState<string>("breakdown");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [repairCost, setRepairCost] = useState<number>(0);

  // Edit form (additional fields)
  const [editStatus, setEditStatus] = useState<string>("reported");
  const [editResult, setEditResult] = useState("");
  const [editStartedAt, setEditStartedAt] = useState("");
  const [editCompletedAt, setEditCompletedAt] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editVendorName, setEditVendorName] = useState("");
  const [editRepairCost, setEditRepairCost] = useState<number>(0);

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-maintenance", statusFilter, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.record_type = typeFilter;
      return (await api.get("/equipment/maintenance", { params })).data;
    },
  });

  const records: MaintenanceRecord[] = data?.data ?? [];

  // Equipment options for dialog
  const { data: eqData } = useQuery({
    queryKey: ["equipment-items-all"],
    queryFn: async () =>
      (await api.get("/equipment/items", { params: { status: "active" } })).data,
    enabled: createOpen,
  });
  const equipmentOptions: EquipmentOption[] = eqData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/equipment/maintenance", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-maintenance"] });
      handleCloseCreate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.put(`/equipment/maintenance/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-maintenance"] });
      handleCloseEdit();
    },
  });

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setEquipmentId("");
    setRecordType("breakdown");
    setTitle("");
    setDescription("");
    setAssignedTo("");
    setVendorName("");
    setRepairCost(0);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setEditTarget(null);
  };

  const handleCreateSubmit = () => {
    if (!equipmentId || !title) return;
    createMutation.mutate({
      equipment_id: equipmentId,
      record_type: recordType,
      title,
      description: description || null,
      assigned_to: assignedTo || null,
      vendor_name: vendorName || null,
      repair_cost: repairCost || null,
    });
  };

  const handleEditSubmit = () => {
    if (!editTarget) return;
    updateMutation.mutate({
      id: editTarget.id,
      payload: {
        title: editTitle,
        description: editDescription || null,
        assigned_to: editAssignedTo || null,
        vendor_name: editVendorName || null,
        repair_cost: editRepairCost || null,
        status: editStatus,
        result: editResult || null,
        started_at: editStartedAt || null,
        completed_at: editCompletedAt || null,
      },
    });
  };

  const openEdit = (r: MaintenanceRecord) => {
    setEditTarget(r);
    setEditTitle(r.title);
    setEditDescription(r.description || "");
    setEditAssignedTo(r.assigned_to || "");
    setEditVendorName(r.vendor_name || "");
    setEditRepairCost(r.repair_cost ?? 0);
    setEditStatus(r.status);
    setEditResult(r.result || "");
    setEditStartedAt(r.started_at?.slice(0, 10) || "");
    setEditCompletedAt(r.completed_at?.slice(0, 10) || "");
    setEditOpen(true);
  };

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        {/* Header */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold">メンテナンス管理</h1>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新規登録
          </Button>
        </div>

        {/* Status Tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Type filter */}
        <div className="flex flex-wrap gap-1">
          <Button
            variant={typeFilter === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter("")}
          >
            すべて
          </Button>
          {TYPE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={typeFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : records.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">データがありません</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {records.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  onClick={() => openEdit(r)}
                  role="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{r.eq_code}</span>
                        <TypeBadge type={r.record_type} />
                        <MaintStatusBadge status={r.status} />
                      </div>
                      <div className="text-sm mt-1 font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.assigned_to && `担当: ${r.assigned_to} / `}
                        報告: {formatDate(r.reported_at)}
                      </div>
                    </div>
                    {r.repair_cost != null && r.repair_cost > 0 && (
                      <div className="text-right shrink-0">
                        <div className="font-medium font-number text-sm">
                          {formatCurrency(r.repair_cost)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>機材</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead>タイトル</TableHead>
                    <TableHead>担当</TableHead>
                    <TableHead>報告日</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">修理費</TableHead>
                    <TableHead>アクション</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{r.eq_code}</span>
                      </TableCell>
                      <TableCell>
                        <TypeBadge type={r.record_type} />
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate">
                        {r.title}
                      </TableCell>
                      <TableCell>{r.assigned_to || "-"}</TableCell>
                      <TableCell>{formatDate(r.reported_at)}</TableCell>
                      <TableCell>
                        <MaintStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-right font-number">
                        {r.repair_cost != null && r.repair_cost > 0
                          ? formatCurrency(r.repair_cost)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="h-3 w-3 mr-1" />
                          編集
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新規メンテナンス登録</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>機材 *</Label>
                <SearchableSelect
                  options={equipmentOptions.map((e) => ({
                    value: e.id,
                    label: `${e.eq_code} ${e.name}`,
                  }))}
                  value={equipmentId}
                  onChange={setEquipmentId}
                  placeholder="機材を検索..."
                />
              </div>
              <div>
                <Label>種別 *</Label>
                <Select value={recordType} onValueChange={setRecordType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>タイトル *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="タイトル"
                />
              </div>
              <div>
                <Label>説明</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="詳細説明"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>担当者</Label>
                  <Input
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="担当者名"
                  />
                </div>
                <div>
                  <Label>業者名</Label>
                  <Input
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="業者名"
                  />
                </div>
              </div>
              <div>
                <Label>修理費</Label>
                <CurrencyInput value={repairCost} onChange={setRepairCost} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseCreate}>
                キャンセル
              </Button>
              <Button
                disabled={!equipmentId || !title || createMutation.isPending}
                onClick={handleCreateSubmit}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                登録
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>メンテナンス編集</DialogTitle>
            </DialogHeader>
            {editTarget && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-sm font-medium">
                    {editTarget.eq_code} {editTarget.equipment_name}
                  </div>
                  <TypeBadge type={editTarget.record_type} />
                </div>
                <div>
                  <Label>タイトル *</Label>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="タイトル"
                  />
                </div>
                <div>
                  <Label>説明</Label>
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="詳細説明"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>担当者</Label>
                    <Input
                      value={editAssignedTo}
                      onChange={(e) => setEditAssignedTo(e.target.value)}
                      placeholder="担当者名"
                    />
                  </div>
                  <div>
                    <Label>業者名</Label>
                    <Input
                      value={editVendorName}
                      onChange={(e) => setEditVendorName(e.target.value)}
                      placeholder="業者名"
                    />
                  </div>
                </div>
                <div>
                  <Label>修理費</Label>
                  <CurrencyInput value={editRepairCost} onChange={setEditRepairCost} />
                </div>
                <div>
                  <Label>ステータス</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reported">報告済</SelectItem>
                      <SelectItem value="in_progress">対応中</SelectItem>
                      <SelectItem value="completed">完了</SelectItem>
                      <SelectItem value="cancelled">キャンセル</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>結果</Label>
                  <Textarea
                    value={editResult}
                    onChange={(e) => setEditResult(e.target.value)}
                    placeholder="対応結果"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>開始日</Label>
                    <Input
                      type="date"
                      value={editStartedAt}
                      onChange={(e) => setEditStartedAt(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>完了日</Label>
                    <Input
                      type="date"
                      value={editCompletedAt}
                      onChange={(e) => setEditCompletedAt(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseEdit}>
                キャンセル
              </Button>
              <Button
                disabled={!editTitle || updateMutation.isPending}
                onClick={handleEditSubmit}
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                更新
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
