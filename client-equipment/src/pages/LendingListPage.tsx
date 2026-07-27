import { useSearchParams } from "react-router-dom";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, ArrowRightLeft, RotateCcw, Search, Check, ChevronRight, X } from "lucide-react";
import { TYPE_CODES } from "@/lib/constants";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

const today = new Date().toISOString().split("T")[0];

export default function LendingListPage() {
  const qc = useQueryClient();
  // 案件から来たとき (`?project_id=`) は番組貸出として案件を最初から入れておく (§4.16)。
  // ここで拾わないと「案件から貸出を始められる」が案件を選び直させる導線になってしまう。
  const [urlParams] = useSearchParams();
  const fromProjectId = urlParams.get("project_id") ?? "";
  const fromProjectName = urlParams.get("project_name") ?? "";

  // ─── Lending list state ───────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("lent");

  // ─── Dialog state ─────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<"select" | "form">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [typeTab, setTypeTab] = useState("");
  const [lendingType, setLendingType] = useState<"standalone" | "program">(
    fromProjectId ? "program" : "standalone"
  );
  const [projectSearch, setProjectSearch] = useState(fromProjectName);
  const [form, setForm] = useState({
    borrower_name: "", purpose: "",
    lent_at: today, due_date: "", notes: "", project_id: fromProjectId,
  });

  // ─── Return dialog ────────────────────────────────────────
  const [returnDialogId, setReturnDialogId] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState("good");
  const [returnNotes, setReturnNotes] = useState("");

  // ─── Queries ──────────────────────────────────────────────
  const { data: lendingsData, isLoading } = useQuery({
    queryKey: ["equipment-lendings", filterStatus],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      return (await api.get("/equipment/lendings", { params })).data.data;
    },
  });
  const lendings: any[] = lendingsData ?? [];

  const { data: lendableData, isLoading: lendableLoading } = useQuery({
    queryKey: ["equipment-lendable"],
    queryFn: async () => (await api.get("/equipment/items", {
      params: { is_rental_listed: "true", status: "active", include_children: "1" },
    })).data.data,
    enabled: dialogOpen,
    staleTime: 30_000,
  });
  const lendableItems: any[] = lendableData ?? [];

  const { data: projectsData } = useQuery({
    queryKey: ["equipment-projects", projectSearch],
    queryFn: async () => (await api.get("/equipment/projects", { params: { search: projectSearch } })).data.data,
    enabled: dialogOpen && lendingType === "program" && projectSearch.length >= 1,
  });
  const projects: any[] = projectsData ?? [];

  // ─── Computed ─────────────────────────────────────────────
  const childrenMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of lendableItems) {
      if (item.parent_id) {
        if (!map.has(item.parent_id)) map.set(item.parent_id, []);
        map.get(item.parent_id)!.push(item);
      }
    }
    return map;
  }, [lendableItems]);

  const parentItems = useMemo(() => lendableItems.filter(i => !i.parent_id), [lendableItems]);

  const availableTypes = useMemo(() => {
    const codes = new Set(parentItems.map(i => i.equipment_type_code));
    return TYPE_CODES.filter(t => codes.has(t.code));
  }, [parentItems]);

  const filteredItems = useMemo(() => {
    if (!typeTab) return parentItems;
    return parentItems.filter(i => i.equipment_type_code === typeTab);
  }, [parentItems, typeTab]);

  const selectedItems = useMemo(() => {
    return parentItems.filter(i => selectedIds.has(i.id));
  }, [parentItems, selectedIds]);

  // ─── Helpers ──────────────────────────────────────────────
  const toggleItem = (item: any) => {
    if (item.current_lending) return;
    const children = childrenMap.get(item.id) ?? [];
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        children.forEach(c => next.delete(c.id));
      } else {
        next.add(item.id);
        children.filter(c => !c.current_lending).forEach(c => next.add(c.id));
      }
      return next;
    });
  };

  const resetAndClose = () => {
    setDialogOpen(false);
    setStep("select");
    setSelectedIds(new Set());
    setTypeTab("");
    setLendingType("standalone");
    setProjectSearch("");
    setForm({ borrower_name: "", purpose: "", lent_at: today, due_date: "", notes: "", project_id: fromProjectId });
  };

  const openDialog = () => {
    resetAndClose();
    setDialogOpen(true);
  };

  // ─── Mutations ────────────────────────────────────────────
  const batchLendMutation = useMutation({
    mutationFn: (payload: any) => api.post("/equipment/lendings/batch", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-lendings"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
      qc.invalidateQueries({ queryKey: ["equipment-lendable"] });
      resetAndClose();
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => api.put(`/equipment/lendings/${id}/return`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-lendings"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
      qc.invalidateQueries({ queryKey: ["equipment-lendable"] });
      setReturnDialogId(null);
    },
  });

  const handleSubmit = () => {
    if (selectedIds.size === 0 || !form.borrower_name) return;
    batchLendMutation.mutate({
      equipment_ids: Array.from(selectedIds),
      ...form,
      project_id: lendingType === "program" ? (form.project_id || null) : null,
      due_date: form.due_date || null,
    });
  };

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>貸出管理</PageTitle>
        <Button size="sm" onClick={openDialog}>
          <Plus className="h-4 w-4 mr-1" />
          貸出登録
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="lent">貸出中</SelectItem>
            <SelectItem value="returned">返却済</SelectItem>
            <SelectItem value="overdue">返却遅延</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lending list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : lendings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>貸出記録がありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {lendings.map((l: any) => {
            const isOverdue = l.status === "lent" && l.due_date && l.due_date < today;
            return (
              <Card key={l.id} className={isOverdue ? "border-warning" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {l.equipment_name}
                          {l.unit_number && <span className="text-primary ml-1">No.{l.unit_number}</span>}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={l.status === "lent" ? "default" : "secondary"}
                          className={isOverdue ? "bg-warning" : ""}
                        >
                          {l.status === "lent" ? (isOverdue ? "返却遅延" : "貸出中") : "返却済"}
                        </Badge>
                        <span className="text-sm">{l.borrower_name}</span>
                        {l.gls_number && (
                          <Badge variant="outline" className="text-xs">
                            {l.gls_number} {l.project_name}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        貸出: {l.lent_at?.split("T")[0]}
                        {l.due_date && ` / 期限: ${l.due_date}`}
                        {l.returned_at && ` / 返却: ${l.returned_at.split("T")[0]}`}
                      </div>
                      {l.purpose && <div className="text-xs text-muted-foreground">{l.purpose}</div>}
                    </div>
                    {l.status === "lent" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setReturnDialogId(l.id); setReturnCondition("good"); setReturnNotes(""); }}
                        className="shrink-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        返却
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── New Lending Dialog ────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle>新規貸出登録</DialogTitle>
          </DialogHeader>

          {/* ── STEP 1: Equipment picker ── */}
          {step === "select" && (
            <div className="flex flex-col min-h-0 flex-1">
              {/* Type tabs */}
              <div className="flex gap-1.5 px-4 py-2.5 border-b overflow-x-auto shrink-0 scrollbar-none">
                <button
                  onClick={() => setTypeTab("")}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    !typeTab ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  全て {lendableItems.length > 0 && `(${lendableItems.length})`}
                </button>
                {availableTypes.map(t => {
                  const count = lendableItems.filter(i => i.equipment_type_code === t.code).length;
                  return (
                    <button
                      key={t.code}
                      onClick={() => setTypeTab(t.code)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        typeTab === t.code ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {t.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Equipment card grid */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {lendableLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                    <ArrowRightLeft className="h-10 w-10 opacity-30" />
                    <p className="text-sm">貸出可能な機材がありません</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredItems.map((item: any) => {
                      const isSelected = selectedIds.has(item.id);
                      const isLent = !!item.current_lending;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isLent}
                          onClick={() => toggleItem(item)}
                          className={cn(
                            "relative w-full text-left rounded-lg border p-2.5 transition-all text-sm",
                            isSelected
                              ? "ring-2 ring-primary border-primary bg-primary/5"
                              : "hover:bg-muted/50 hover:border-muted-foreground/30",
                            isLent && "opacity-50 cursor-not-allowed bg-muted/30"
                          )}
                        >
                          {isSelected && (
                            <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                              <Check className="h-2.5 w-2.5 text-white" />
                            </span>
                          )}
                          <div className="pr-5 font-medium leading-tight line-clamp-2 text-xs sm:text-sm">
                            {item.name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.unit_number != null ? `No.${item.unit_number}` : item.eq_code}
                          </div>
                          {item.location_name && (
                            <div className="mt-0.5 text-xs text-muted-foreground truncate">{item.location_name}</div>
                          )}
                          {(childrenMap.get(item.id)?.length ?? 0) > 0 && (
                            <div className="mt-1 text-xs text-primary font-medium">
                              付属品 {childrenMap.get(item.id)!.length}点含む
                            </div>
                          )}
                          {isLent && (
                            <div className="mt-1 text-xs font-medium text-warning-strong">貸出中</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer: selected chips + next button */}
              <div className="border-t px-4 py-3 shrink-0 space-y-2">
                {selectedItems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedItems.map(item => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium"
                      >
                        {item.name}{item.unit_number != null ? ` No.${item.unit_number}` : ""}
                        <button type="button" onClick={() => toggleItem(item)} className="hover:text-primary">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {selectedItems.length > 0 ? `${selectedItems.length} 台選択中` : "機材をタップして選択"}
                  </span>
                  <Button
                    size="sm"
                    disabled={selectedItems.length === 0}
                    onClick={() => setStep("form")}
                  >
                    次へ: {selectedItems.length} 台を貸出
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Borrower form ── */}
          {step === "form" && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {/* Selected items summary */}
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">選択機材 ({selectedItems.length} 台)</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedItems.map(item => (
                    <span key={item.id} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                      {item.name}{item.unit_number != null ? ` No.${item.unit_number}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              {/* Lending type */}
              <div className="space-y-1">
                <Label>貸出種別</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["standalone", "program"] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        lendingType === type
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      )}
                      onClick={() => {
                        setLendingType(type);
                        if (type === "standalone") setForm(f => ({ ...f, project_id: "" }));
                      }}
                    >
                      {type === "standalone" ? "単独貸出" : "番組貸出"}
                    </button>
                  ))}
                </div>
              </div>

              {/* GLS project (program only) */}
              {lendingType === "program" && (
                <div className="space-y-1">
                  <Label>GLS案件 *</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="GLS番号 or 案件名で検索..."
                      value={projectSearch}
                      onChange={(e) => {
                        setProjectSearch(e.target.value);
                        if (!e.target.value) setForm(f => ({ ...f, project_id: "" }));
                      }}
                    />
                  </div>
                  {projects.length > 0 && !form.project_id && (
                    <div className="border rounded-md max-h-32 overflow-y-auto">
                      {projects.map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                          onClick={() => { setForm(f => ({ ...f, project_id: p.id })); setProjectSearch(`${p.gls_number} ${p.name}`); }}
                        >
                          <span className=" text-xs text-primary">{p.gls_number}</span>
                          <span className="ml-2">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.project_id && (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">選択済</Badge>
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => { setForm(f => ({ ...f, project_id: "" })); setProjectSearch(""); }}>
                        変更
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Borrower */}
              <div className="space-y-1">
                <Label>借用者 *</Label>
                <Input
                  value={form.borrower_name}
                  onChange={e => setForm(f => ({ ...f, borrower_name: e.target.value }))}
                  placeholder="氏名"
                />
              </div>

              {/* Purpose */}
              <div className="space-y-1">
                <Label>目的</Label>
                <Input
                  value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  placeholder="利用目的"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>貸出日</Label>
                  <Input type="date" value={form.lent_at} onChange={e => setForm(f => ({ ...f, lent_at: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>返却予定日</Label>
                  <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>

              {/* Error */}
              {batchLendMutation.isError && (
                <p className="text-sm text-destructive">
                  {(batchLendMutation.error as any)?.response?.data?.error?.message ?? "エラーが発生しました"}
                </p>
              )}

              {/* Buttons */}
              <div className="flex justify-between gap-2 pt-1">
                <Button variant="outline" onClick={() => setStep("select")}>← 戻る</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    !form.borrower_name ||
                    (lendingType === "program" && !form.project_id) ||
                    batchLendMutation.isPending
                  }
                >
                  {batchLendMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {selectedIds.size} 台を貸出登録
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={!!returnDialogId} onOpenChange={() => setReturnDialogId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>返却処理</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>返却時コンディション</Label>
              <Select value={returnCondition} onValueChange={setReturnCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">優良</SelectItem>
                  <SelectItem value="good">良好</SelectItem>
                  <SelectItem value="fair">可</SelectItem>
                  <SelectItem value="poor">不良</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="状態のメモ等" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnDialogId(null)}>キャンセル</Button>
              <Button
                onClick={() => returnMutation.mutate({ id: returnDialogId, condition_in: returnCondition, notes: returnNotes })}
                disabled={returnMutation.isPending}
              >
                {returnMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                返却完了
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
