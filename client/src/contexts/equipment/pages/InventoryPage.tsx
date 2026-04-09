import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Plus, ChevronRight, ArrowLeft, Save } from "lucide-react";

type CheckStatus = "draft" | "in_progress" | "completed";

const statusLabels: Record<CheckStatus, string> = {
  draft: "下書き",
  in_progress: "実施中",
  completed: "完了",
};

const statusBadgeClass: Record<CheckStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

function CheckStatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass[status] ?? "bg-gray-100 text-gray-700"}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

const foundOptions: { value: string; label: string }[] = [
  { value: "0", label: "未確認" },
  { value: "1", label: "所定位置" },
  { value: "2", label: "別の場所" },
  { value: "3", label: "未発見" },
];

interface InventoryCheck {
  id: string;
  title: string;
  check_date: string;
  status: CheckStatus;
  checked_by: string;
  notes: string;
  checked_count?: number;
  total_count?: number;
}

interface CheckItem {
  id: string;
  equipment_id: string;
  equipment_name: string;
  eq_code: string;
  expected_location: string;
  actual_location: string;
  found: number;
  condition: string;
  note: string;
  checked_at: string | null;
}

interface CheckDetail extends InventoryCheck {
  items: CheckItem[];
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);

  // Create form
  const [checkTitle, setCheckTitle] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [checkNotes, setCheckNotes] = useState("");

  // Inline edit state for items
  const [editingItems, setEditingItems] = useState<Record<string, Partial<CheckItem>>>({});

  // List query
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["inventory-checks"],
    queryFn: async () => (await api.get("/equipment/inventory-checks")).data,
  });
  const checks: InventoryCheck[] = listData?.data ?? [];

  // Detail query
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["inventory-check-detail", selectedCheckId],
    queryFn: async () =>
      (await api.get(`/equipment/inventory-checks/${selectedCheckId}`)).data,
    enabled: !!selectedCheckId,
  });
  const checkDetail: CheckDetail | null = detailData?.data ?? null;

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/equipment/inventory-checks", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-checks"] });
      handleCloseCreate();
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      checkId,
      itemId,
      payload,
    }: {
      checkId: string;
      itemId: string;
      payload: Record<string, unknown>;
    }) => api.put(`/equipment/inventory-checks/${checkId}/items/${itemId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-check-detail", selectedCheckId] });
      qc.invalidateQueries({ queryKey: ["inventory-checks"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ checkId, status }: { checkId: string; status: string }) =>
      api.put(`/equipment/inventory-checks/${checkId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-check-detail", selectedCheckId] });
      qc.invalidateQueries({ queryKey: ["inventory-checks"] });
    },
  });

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCheckTitle("");
    setCheckDate("");
    setCheckNotes("");
  };

  const handleCreateSubmit = () => {
    if (!checkTitle) return;
    createMutation.mutate({
      title: checkTitle,
      check_date: checkDate || null,
      notes: checkNotes || null,
    });
  };

  const getItemEdit = (itemId: string): Partial<CheckItem> => {
    return editingItems[itemId] || {};
  };

  const setItemField = (itemId: string, field: string, value: string | number) => {
    setEditingItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const saveItem = (item: CheckItem) => {
    if (!selectedCheckId) return;
    const edits = getItemEdit(item.id);
    updateItemMutation.mutate({
      checkId: selectedCheckId,
      itemId: item.id,
      payload: {
        found: edits.found !== undefined ? edits.found : item.found,
        actual_location:
          edits.actual_location !== undefined ? edits.actual_location : item.actual_location,
        condition: edits.condition !== undefined ? edits.condition : item.condition,
        note: edits.note !== undefined ? edits.note : item.note,
      },
    });
    // Clear local edits for this item
    setEditingItems((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  const getNextStatus = (current: CheckStatus): CheckStatus | null => {
    if (current === "draft") return "in_progress";
    if (current === "in_progress") return "completed";
    return null;
  };

  const nextStatusLabel = (current: CheckStatus): string | null => {
    if (current === "draft") return "実施開始";
    if (current === "in_progress") return "完了にする";
    return null;
  };

  const handleStatusChange = () => {
    if (!checkDetail) return;
    const next = getNextStatus(checkDetail.status);
    if (!next) return;
    updateStatusMutation.mutate({ checkId: checkDetail.id, status: next });
  };

  // Detail view
  if (selectedCheckId) {
    return (
      <PageTransition>
        <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setSelectedCheckId(null);
                setEditingItems({});
              }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                一覧に戻る
              </Button>
              {checkDetail && (
                <>
                  <h1 className="text-xl lg:text-2xl font-bold">{checkDetail.title}</h1>
                  <CheckStatusBadge status={checkDetail.status} />
                </>
              )}
            </div>
            {checkDetail && getNextStatus(checkDetail.status) && (
              <Button
                onClick={handleStatusChange}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                ステータス変更: {nextStatusLabel(checkDetail.status)}
              </Button>
            )}
          </div>

          {checkDetail && (
            <div className="text-sm text-muted-foreground">
              棚卸し日: {formatDate(checkDetail.check_date)}
              {checkDetail.checked_by && ` / 担当: ${checkDetail.checked_by}`}
              {checkDetail.notes && ` / ${checkDetail.notes}`}
            </div>
          )}

          {detailLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !checkDetail || checkDetail.items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              棚卸しアイテムがありません
            </p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {checkDetail.items.map((item) => {
                  const edits = getItemEdit(item.id);
                  const currentFound = edits.found !== undefined ? edits.found : item.found;
                  return (
                    <div key={item.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{item.eq_code}</span>
                        <span className="text-sm font-medium truncate">{item.equipment_name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        所定位置: {item.expected_location || "-"}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">確認結果</Label>
                          <Select
                            value={String(currentFound)}
                            onValueChange={(v) => setItemField(item.id, "found", Number(v))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {foundOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">実際の場所</Label>
                          <Input
                            className="h-8 text-xs"
                            value={edits.actual_location ?? item.actual_location ?? ""}
                            onChange={(e) =>
                              setItemField(item.id, "actual_location", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">状態</Label>
                          <Input
                            className="h-8 text-xs"
                            value={edits.condition ?? item.condition ?? ""}
                            onChange={(e) =>
                              setItemField(item.id, "condition", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">備考</Label>
                          <Input
                            className="h-8 text-xs"
                            value={edits.note ?? item.note ?? ""}
                            onChange={(e) =>
                              setItemField(item.id, "note", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={!editingItems[item.id] || updateItemMutation.isPending}
                        onClick={() => saveItem(item)}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        保存
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>機材コード</TableHead>
                      <TableHead>機材名</TableHead>
                      <TableHead>所定位置</TableHead>
                      <TableHead>確認結果</TableHead>
                      <TableHead>実際の場所</TableHead>
                      <TableHead>状態</TableHead>
                      <TableHead>備考</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkDetail.items.map((item) => {
                      const edits = getItemEdit(item.id);
                      const currentFound =
                        edits.found !== undefined ? edits.found : item.found;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="font-mono text-xs">{item.eq_code}</span>
                          </TableCell>
                          <TableCell>{item.equipment_name}</TableCell>
                          <TableCell>{item.expected_location || "-"}</TableCell>
                          <TableCell>
                            <Select
                              value={String(currentFound)}
                              onValueChange={(v) =>
                                setItemField(item.id, "found", Number(v))
                              }
                            >
                              <SelectTrigger className="h-8 w-[120px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {foundOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-xs w-[140px]"
                              value={edits.actual_location ?? item.actual_location ?? ""}
                              onChange={(e) =>
                                setItemField(item.id, "actual_location", e.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-xs w-[120px]"
                              value={edits.condition ?? item.condition ?? ""}
                              onChange={(e) =>
                                setItemField(item.id, "condition", e.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-xs w-[140px]"
                              value={edits.note ?? item.note ?? ""}
                              onChange={(e) =>
                                setItemField(item.id, "note", e.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                !editingItems[item.id] || updateItemMutation.isPending
                              }
                              onClick={() => saveItem(item)}
                            >
                              <Save className="h-3 w-3 mr-1" />
                              保存
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </PageTransition>
    );
  }

  // List view
  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold">棚卸し</h1>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新規棚卸し
          </Button>
        </div>

        {listLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : checks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">データがありません</p>
        ) : (
          <div className="space-y-2">
            {checks.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer"
                onClick={() => setSelectedCheckId(c.id)}
                role="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.title}</span>
                      <CheckStatusBadge status={c.status} />
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      棚卸し日: {formatDate(c.check_date)}
                      {c.checked_by && ` / 担当: ${c.checked_by}`}
                    </div>
                    {(c.checked_count !== undefined && c.total_count !== undefined) && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>進捗: {c.checked_count}/{c.total_count}</span>
                          <div className="flex-1 max-w-[200px] h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{
                                width: c.total_count > 0
                                  ? `${Math.round((c.checked_count / c.total_count) * 100)}%`
                                  : "0%",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {c.notes && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {c.notes}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New Check Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新規棚卸し</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>タイトル *</Label>
                <Input
                  value={checkTitle}
                  onChange={(e) => setCheckTitle(e.target.value)}
                  placeholder="例: 2026年4月棚卸し"
                />
              </div>
              <div>
                <Label>棚卸し日</Label>
                <Input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                />
              </div>
              <div>
                <Label>備考</Label>
                <Textarea
                  value={checkNotes}
                  onChange={(e) => setCheckNotes(e.target.value)}
                  placeholder="備考"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseCreate}>
                キャンセル
              </Button>
              <Button
                disabled={!checkTitle || createMutation.isPending}
                onClick={handleCreateSubmit}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                作成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
