import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { getProjectCategory } from "@/types";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search, Loader2, Plus, Trash2, Download } from "lucide-react";

interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
  customer_id: string;
  customer_name?: string;
  project_type?: string;
}

interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
}

interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  pricing_item_id?: string;
}

export default function RevenueListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get("project_id") || "";
  const filterProjectName = searchParams.get("project_name") || "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [amount, setAmount] = useState<number>(0);
  const [recognitionDate, setRecognitionDate] = useState("");
  const [billingDate, setBillingDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RevenueItem[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["revenues-all", page, search, filterProjectId],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (filterProjectId) params.project_id = filterProjectId;
      return (await api.get("/revenues", { params })).data;
    },
  });

  const revenues = data?.data ?? [];
  const pagination = data?.pagination;

  // Search projects for dialog
  const { data: projectsData } = useQuery({
    queryKey: ["projects-search", projectSearch],
    queryFn: async () =>
      (
        await api.get("/projects", {
          params: { search: projectSearch, limit: 20 },
        })
      ).data,
    enabled: dialogOpen && projectSearch.length > 0,
  });
  const projects: ProjectOption[] = projectsData?.data ?? [];

  // Fetch episodes for selected project
  const { data: episodesData } = useQuery({
    queryKey: ["project-episodes", selectedProjectId],
    queryFn: async () =>
      (await api.get(`/projects/${selectedProjectId}/episodes?limit=100`)).data,
    enabled: dialogOpen && !!selectedProjectId,
  });
  const episodes: EpisodeOption[] = episodesData?.data ?? [];

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const isProjectCategoryB = selectedProject?.project_type
    ? getProjectCategory(selectedProject.project_type) === "B"
    : false;

  // Fetch simulation data for A-type project import
  const { data: simData } = useQuery({
    queryKey: ["simulation-for-revenue", selectedProjectId],
    queryFn: async () =>
      (await api.get(`/projects/${selectedProjectId}/simulation`)).data,
    enabled: dialogOpen && !!selectedProjectId && !isProjectCategoryB,
  });
  const simulationItems = simData?.data ?? [];

  // Billing key preview
  const billingKeyPreview = useMemo(() => {
    if (selectedEpisodeId) {
      const ep = episodes.find((e) => e.id === selectedEpisodeId);
      if (!ep) return "";
      const taxSuffix = taxCategory === "tax8" ? "-2" : "-1";
      return `${ep.episode_code}${taxSuffix}`;
    }
    if (selectedProject?.gls_number) {
      const suffix = taxCategory === "tax8" ? "-2" : "-1";
      return `${selectedProject.gls_number}${suffix}`;
    }
    return "";
  }, [selectedEpisodeId, taxCategory, episodes, selectedProject]);

  // Items total
  const itemsTotal = useMemo(
    () => items.reduce((sum, it) => sum + (it.amount || 0), 0),
    [items]
  );

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/revenues", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      handleCloseDialog();
    },
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setProjectSearch("");
    setSelectedProjectId("");
    setSelectedEpisodeId("");
    setTaxCategory("tax10");
    setAmount(0);
    setRecognitionDate("");
    setBillingDate("");
    setPaymentDueDate("");
    setNotes("");
    setItems([]);
  };

  const handleCreateSubmit = () => {
    if (!selectedProjectId) return;
    // A系はepisode必須、B系は不要
    if (!isProjectCategoryB && !selectedEpisodeId) return;

    createMutation.mutate({
      project_id: selectedProjectId,
      episode_id: selectedEpisodeId || null,
      customer_id: selectedProject?.customer_id ?? null,
      tax_category: taxCategory,
      amount: items.length > 0 ? itemsTotal : amount,
      recognition_date: recognitionDate || null,
      billing_date: billingDate || null,
      payment_due_date: paymentDueDate || null,
      notes: notes || null,
      items: items.length > 0 ? items : undefined,
    });
  };

  // Revenue item helpers
  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unit_price: 0, amount: 0 },
    ]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback(
    (index: number, field: keyof RevenueItem, value: string | number) => {
      setItems((prev) => {
        const next = [...prev];
        const item = { ...next[index], [field]: value };
        // 自動計算: quantity * unit_price = amount
        if (field === "quantity" || field === "unit_price") {
          item.amount = (item.quantity || 0) * (item.unit_price || 0);
        }
        next[index] = item;
        return next;
      });
    },
    []
  );

  // Import from simulation
  const handleImportSimulation = useCallback(() => {
    if (!simulationItems || simulationItems.length === 0) return;
    const imported: RevenueItem[] = simulationItems.map((si: any) => ({
      description: si.pricing_item_name + (si.sub_label ? ` (${si.sub_label})` : ""),
      quantity: si.quantity || 1,
      unit_price: si.unit_price || 0,
      amount: si.subtotal || 0,
      pricing_item_id: si.pricing_item_id,
    }));
    setItems(imported);
  }, [simulationItems]);

  const canSubmit =
    selectedProjectId &&
    (isProjectCategoryB || selectedEpisodeId) &&
    !createMutation.isPending;

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">売上一覧</h1>
          {filterProjectId && filterProjectName && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                絞り込み: <span className="font-medium text-foreground">{filterProjectName}</span>
              </span>
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={() => navigate("/revenues")}>
                解除
              </Button>
            </div>
          )}
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新規売上
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="請求KEY・案件名で検索..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {revenues.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              データがありません
            </p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {revenues.map((r: Record<string, unknown>) => (
                  <div
                    key={r.id as string}
                    className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    onClick={() =>
                      r.project_id &&
                      navigate(`/projects/${r.project_id}/episodes`)
                    }
                    role={r.project_id ? "button" : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {(r.billing_key as string) || "-"}
                          </span>
                          <span className="font-mono text-sm font-medium text-primary">
                            {(r.gls_number as string) || "-"}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 truncate">
                          {(r.customer_name as string) || "-"}
                          {(r.project_name as string) && (
                            <span> / {r.project_name as string}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium font-number">
                          {formatCurrency(r.amount as number)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(r.recognition_date as string)}
                        </div>
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
                      <TableHead>請求KEY</TableHead>
                      <TableHead>GLS番号</TableHead>
                      <TableHead>案件名</TableHead>
                      <TableHead>顧客</TableHead>
                      <TableHead>税区分</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                      <TableHead>計上日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenues.map((r: Record<string, unknown>) => (
                      <TableRow key={r.id as string}>
                        <TableCell className="font-mono text-xs">
                          {(r.billing_key as string) || "-"}
                        </TableCell>
                        <TableCell>
                          {r.project_id ? (
                            <button
                              className="font-mono text-sm font-medium text-primary hover:underline"
                              onClick={() =>
                                navigate(
                                  `/projects/${r.project_id}/episodes`
                                )
                              }
                            >
                              {(r.gls_number as string) || "-"}
                            </button>
                          ) : (
                            <span className="text-primary">
                              {(r.gls_number as string) || "-"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(r.project_name as string) || "-"}
                        </TableCell>
                        <TableCell>
                          {(r.customer_name as string) || "-"}
                        </TableCell>
                        <TableCell>
                          {r.tax_category === "tax10"
                            ? "10%"
                            : r.tax_category === "tax8"
                            ? "8%"
                            : "非課税"}
                        </TableCell>
                        <TableCell className="text-right font-medium font-number">
                          {formatCurrency(r.amount as number)}
                        </TableCell>
                        <TableCell>
                          {formatDate(r.recognition_date as string)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                全{pagination.total}件中{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}
                件
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  前へ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Revenue Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新規売上登録</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Project search */}
            <div className="space-y-1">
              <Label>案件</Label>
              <Input
                placeholder="案件名・GLS番号で検索..."
                value={projectSearch}
                onChange={(e) => {
                  setProjectSearch(e.target.value);
                  setSelectedProjectId("");
                  setSelectedEpisodeId("");
                  setItems([]);
                }}
              />
              {projectSearch && projects.length > 0 && !selectedProjectId && (
                <div className="max-h-40 overflow-y-auto rounded border bg-popover">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setProjectSearch(p.name);
                      }}
                    >
                      <span className="font-mono text-xs text-primary">
                        {p.gls_number || p.id.slice(0, 8)}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedProject && (
                <p className="text-xs text-muted-foreground">
                  {selectedProject.gls_number || "GLS未発番"} / 顧客:{" "}
                  {selectedProject.customer_name ?? "-"}
                  {isProjectCategoryB && (
                    <span className="ml-2 text-blue-600 font-medium">
                      B系（エピソードなし）
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Episode select (A系のみ) */}
            {selectedProjectId && !isProjectCategoryB && (
              <div className="space-y-1">
                <Label>話数</Label>
                <Select
                  value={selectedEpisodeId}
                  onValueChange={setSelectedEpisodeId}
                  disabled={!selectedProjectId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="話数を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {episodes.map((ep) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        {ep.episode_code} (第{ep.episode_number}話)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tax category */}
            <div className="space-y-1">
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
              {billingKeyPreview && (
                <p className="text-xs text-muted-foreground">
                  請求KEY: {billingKeyPreview}
                </p>
              )}
            </div>

            {/* Revenue Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>明細行</Label>
                <div className="flex gap-2">
                  {/* Import from simulation (A系のみ) */}
                  {selectedProjectId &&
                    !isProjectCategoryB &&
                    simulationItems.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleImportSimulation}
                      >
                        <Download className="mr-1 h-3 w-3" />
                        シミュレーション引用
                      </Button>
                    )}
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-1 h-3 w-3" />
                    行追加
                  </Button>
                </div>
              </div>

              {items.length > 0 && (
                <div className="rounded border overflow-hidden">
                  {/* Desktop table */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40%]">内容</TableHead>
                          <TableHead className="w-[12%] text-right">数量</TableHead>
                          <TableHead className="w-[20%] text-right">単価</TableHead>
                          <TableHead className="w-[20%] text-right">金額</TableHead>
                          <TableHead className="w-[8%]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="p-1">
                              <Input
                                value={item.description}
                                onChange={(e) =>
                                  updateItem(idx, "description", e.target.value)
                                }
                                placeholder="項目名"
                                className="h-8 text-sm"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) =>
                                  updateItem(
                                    idx,
                                    "quantity",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="h-8 text-sm text-right"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <CurrencyInput
                                value={item.unit_price}
                                onChange={(v) =>
                                  updateItem(idx, "unit_price", v)
                                }
                                className="h-8 text-sm"
                              />
                            </TableCell>
                            <TableCell className="p-1 text-right font-number text-sm font-medium">
                              {formatCurrency(item.amount)}
                            </TableCell>
                            <TableCell className="p-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile cards */}
                  <div className="sm:hidden divide-y">
                    {items.map((item, idx) => (
                      <div key={idx} className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              updateItem(idx, "description", e.target.value)
                            }
                            placeholder="項目名"
                            className="flex-1 text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">数量</Label>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  "quantity",
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">単価</Label>
                            <CurrencyInput
                              value={item.unit_price}
                              onChange={(v) =>
                                updateItem(idx, "unit_price", v)
                              }
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">金額</Label>
                            <div className="flex items-center h-9 text-sm font-medium font-number">
                              {formatCurrency(item.amount)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-t">
                    <span className="text-sm font-medium">合計</span>
                    <span className="text-base font-bold font-number">
                      {formatCurrency(itemsTotal)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Amount (明細行がない場合のみ) */}
            {items.length === 0 && (
              <div className="space-y-1">
                <Label>金額</Label>
                <CurrencyInput
                  value={amount}
                  onChange={(v) => setAmount(v)}
                />
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>計上年月</Label>
                <Input
                  type="date"
                  value={recognitionDate}
                  onChange={(e) => setRecognitionDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>請求予定日</Label>
                <Input
                  type="date"
                  value={billingDate}
                  onChange={(e) => setBillingDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>入金予定日</Label>
                <Input
                  type="date"
                  value={paymentDueDate}
                  onChange={(e) => setPaymentDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>備考</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="備考"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleCloseDialog}>
                キャンセル
              </Button>
              <Button disabled={!canSubmit} onClick={handleCreateSubmit}>
                {createMutation.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                登録
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
