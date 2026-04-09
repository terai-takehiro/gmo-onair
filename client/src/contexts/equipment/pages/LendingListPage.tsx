import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Plus } from "lucide-react";

type LendingStatus = "lent" | "returned" | "overdue" | "lost";

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "すべて", value: "" },
  { label: "貸出中", value: "lent" },
  { label: "返却済", value: "returned" },
  { label: "延滞", value: "overdue" },
  { label: "紛失", value: "lost" },
];

function statusBadge(status: LendingStatus) {
  const map: Record<LendingStatus, { label: string; cls: string }> = {
    lent: { label: "貸出中", cls: "bg-blue-100 text-blue-700" },
    returned: { label: "返却済", cls: "bg-green-100 text-green-700" },
    overdue: { label: "延滞", cls: "bg-red-100 text-red-700" },
    lost: { label: "紛失", cls: "bg-red-100 text-red-700" },
  };
  const m = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

interface EquipmentOption {
  id: string;
  name: string;
  eq_code: string;
}

interface ProjectOption {
  id: string;
  name: string;
  gls_number: string;
}

export default function LendingListPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnTargetId, setReturnTargetId] = useState("");
  const [returnTargetLabel, setReturnTargetLabel] = useState("");

  // Create form state
  const [equipmentId, setEquipmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [lentAt, setLentAt] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [conditionOut, setConditionOut] = useState("");
  const [notes, setNotes] = useState("");

  // Return form state
  const [conditionIn, setConditionIn] = useState("");
  const [returnNotes, setReturnNotes] = useState("");

  // Project search
  const [projectSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-lendings", statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return (await api.get("/equipment/lendings", { params })).data;
    },
  });

  const lendings = data?.data ?? [];

  // Equipment options (lendable, active)
  const { data: eqData } = useQuery({
    queryKey: ["equipment-items-lendable"],
    queryFn: async () =>
      (await api.get("/equipment/items", { params: { is_lendable: 1, status: "active" } })).data,
    enabled: dialogOpen,
  });
  const equipmentOptions: EquipmentOption[] = eqData?.data ?? [];

  // Project search
  const { data: projData } = useQuery({
    queryKey: ["equipment-projects", projectSearch],
    queryFn: async () =>
      (await api.get("/equipment/projects", { params: { search: projectSearch } })).data,
    enabled: dialogOpen,
  });
  const projectOptions: ProjectOption[] = projData?.data ?? [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/equipment/lendings", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-lendings"] });
      handleCloseDialog();
    },
  });

  // Return mutation
  const returnMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.put(`/equipment/lendings/${id}/return`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-lendings"] });
      handleCloseReturnDialog();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/lendings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-lendings"] });
    },
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEquipmentId("");
    setProjectId("");
    setBorrowerName("");
    setPurpose("");
    setLentAt("");
    setDueDate("");
    setConditionOut("");
    setNotes("");
  };

  const handleCloseReturnDialog = () => {
    setReturnDialogOpen(false);
    setReturnTargetId("");
    setReturnTargetLabel("");
    setConditionIn("");
    setReturnNotes("");
  };

  const handleCreate = () => {
    if (!equipmentId || !borrowerName) return;
    createMutation.mutate({
      equipment_id: equipmentId,
      project_id: projectId || null,
      borrower_name: borrowerName,
      purpose: purpose || null,
      lent_at: lentAt || null,
      due_date: dueDate || null,
      condition_out: conditionOut || null,
      notes: notes || null,
    });
  };

  const handleReturn = () => {
    if (!returnTargetId) return;
    returnMutation.mutate({
      id: returnTargetId,
      payload: {
        condition_in: conditionIn || null,
        notes: returnNotes || null,
      },
    });
  };

  const openReturnDialog = (l: Record<string, unknown>) => {
    setReturnTargetId(l.id as string);
    setReturnTargetLabel(`${l.eq_code as string} ${l.equipment_name as string}`);
    setReturnDialogOpen(true);
  };

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        {/* Header */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold">貸出管理</h1>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新規貸出
          </Button>
        </div>

        {/* Status tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : lendings.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">データがありません</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {lendings.map((l: Record<string, unknown>) => (
                <div
                  key={l.id as string}
                  className={`rounded-lg border p-3 ${
                    l.status === "overdue" ? "border-red-300 bg-red-50/50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{(l.eq_code as string) || "-"}</span>
                        {statusBadge(l.status as LendingStatus)}
                      </div>
                      <div className="text-sm mt-1 truncate">{(l.equipment_name as string) || "-"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        借用者: {(l.borrower_name as string) || "-"}
                        {l.gls_number ? ` / ${String(l.gls_number)}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        貸出: {formatDate(l.lent_at as string)} → 返却予定: {formatDate(l.due_date as string)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {l.status === "lent" || l.status === "overdue" ? (
                        <Button size="sm" variant="outline" onClick={() => openReturnDialog(l)}>
                          返却
                        </Button>
                      ) : null}
                    </div>
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
                    <TableHead>案件</TableHead>
                    <TableHead>借用者</TableHead>
                    <TableHead>貸出日</TableHead>
                    <TableHead>返却予定</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>アクション</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lendings.map((l: Record<string, unknown>) => (
                    <TableRow
                      key={l.id as string}
                      className={l.status === "overdue" ? "bg-red-50/50" : ""}
                    >
                      <TableCell>
                        <div>
                          <span className="font-mono text-xs">{(l.eq_code as string) || "-"}</span>
                          <div className="text-sm">{(l.equipment_name as string) || "-"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{(l.gls_number as string) || "-"}</span>
                      </TableCell>
                      <TableCell>{(l.borrower_name as string) || "-"}</TableCell>
                      <TableCell>{formatDate(l.lent_at as string)}</TableCell>
                      <TableCell>{formatDate(l.due_date as string)}</TableCell>
                      <TableCell>{statusBadge(l.status as LendingStatus)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(l.status === "lent" || l.status === "overdue") && (
                            <Button size="sm" variant="outline" onClick={() => openReturnDialog(l)}>
                              返却
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("この貸出記録を削除しますか？")) {
                                deleteMutation.mutate(l.id as string);
                              }
                            }}
                          >
                            削除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* New Lending Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新規貸出</DialogTitle>
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
                <Label>案件</Label>
                <SearchableSelect
                  options={projectOptions.map((p) => ({
                    value: p.id,
                    label: `${p.gls_number} ${p.name}`,
                  }))}
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="案件を検索..."
                />
              </div>
              <div>
                <Label>借用者 *</Label>
                <Input
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  placeholder="借用者名"
                />
              </div>
              <div>
                <Label>目的</Label>
                <Input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="使用目的"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>貸出日</Label>
                  <Input type="date" value={lentAt} onChange={(e) => setLentAt(e.target.value)} />
                </div>
                <div>
                  <Label>返却予定日</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>貸出時状態</Label>
                <Input
                  value={conditionOut}
                  onChange={(e) => setConditionOut(e.target.value)}
                  placeholder="機材の状態メモ"
                />
              </div>
              <div>
                <Label>備考</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="備考"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>キャンセル</Button>
              <Button
                disabled={!equipmentId || !borrowerName || createMutation.isPending}
                onClick={handleCreate}
              >
                {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                登録
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Return Dialog */}
        <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>返却処理</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {returnTargetLabel && (
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-sm font-medium">{returnTargetLabel}</div>
                </div>
              )}
              <div>
                <Label>返却時状態</Label>
                <Input
                  value={conditionIn}
                  onChange={(e) => setConditionIn(e.target.value)}
                  placeholder="機材の状態メモ"
                />
              </div>
              <div>
                <Label>備考</Label>
                <Textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="備考"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseReturnDialog}>キャンセル</Button>
              <Button
                disabled={returnMutation.isPending}
                onClick={handleReturn}
              >
                {returnMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                返却完了
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
