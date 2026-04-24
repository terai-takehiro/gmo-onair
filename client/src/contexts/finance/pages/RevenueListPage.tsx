import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatMonth, formatShortDate, localDateStr } from "@/lib/format";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { PageTransition } from "@/components/ui/motion";
import { getProjectCategory } from "@/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Search, Loader2, Plus, Trash2, Download, ExternalLink, Link2 } from "lucide-react";
import PricingItemPicker, { type PickedPricingItem } from "../components/PricingItemPicker";

type SortKey = "billing_key" | "project_name" | "amount" | "recognition_date";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-0.5 opacity-40" />;
  return sortDir === "asc" ? <ChevronUp className="inline h-3 w-3 ml-0.5" /> : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
}
import ExcelToolbar from "@/components/ExcelToolbar";

interface RevenueRow {
  id: string;
  billing_key: string | null;
  project_id: string;
  project_name: string | null;
  gls_number: string | null;
  customer_name: string | null;
  event_end: string | null;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  is_advance_payment: boolean;
  group_id: string | null;
  status: string;
  items?: RevenueItem[];
}

interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
  customer_id: string;
  customer_name?: string;
  project_type?: string;
  customer_type?: string;
  expected_amount?: number;
  event_end?: string;
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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  // Dialog form state
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectObj, setSelectedProjectObj] = useState<ProjectOption | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [amount, setAmount] = useState<number>(0);
  const [recognitionMonth, setRecognitionMonth] = useState(""); // YYYY-MM
  const [billingDate, setBillingDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RevenueItem[]>([]);
  const [isAdvancePayment, setIsAdvancePayment] = useState(false);
  const [existingRevenueId, setExistingRevenueId] = useState("");
  const [pricingPickerOpen, setPricingPickerOpen] = useState(false);

  const startResize = useCallback((col: string, e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: currentWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.max(60, resizeRef.current.startW + ev.clientX - resizeRef.current.startX);
      setColWidths((prev) => ({ ...prev, [resizeRef.current!.col]: newW }));
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["revenues-all", page, search, filterProjectId],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (filterProjectId) params.project_id = filterProjectId;
      return (await api.get("/revenues", { params })).data;
    },
  });

  const revenuesRaw: RevenueRow[] = data?.data ?? [];
  const pagination = data?.pagination;

  const revenues = useMemo(() => {
    if (!sortKey) return revenuesRaw;
    return [...revenuesRaw].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string | number;
      const bv = (b[sortKey] ?? "") as string | number;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "ja");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [revenuesRaw, sortKey, sortDir]);

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

  // Fetch existing confirmed revenues for selected project (for pre-fill / update mode)
  const { data: existingRevenuesData } = useQuery({
    queryKey: ["revenues-for-project", selectedProjectId],
    queryFn: async () =>
      (await api.get("/revenues", { params: { project_id: selectedProjectId, status: "confirmed" } })).data,
    enabled: dialogOpen && !!selectedProjectId,
  });
  const existingProjectRevenues: RevenueRow[] = existingRevenuesData?.data ?? [];
  const primaryRevenue = existingProjectRevenues.find((r) => !r.group_id);

  // 優先順: 明示的にセットされた selectedProjectObj > 検索結果のマッチ
  const selectedProject =
    selectedProjectObj && selectedProjectObj.id === selectedProjectId
      ? selectedProjectObj
      : projects.find((p) => p.id === selectedProjectId);
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

  // 案件選択時: まず案件のデフォルト値を入力（既存売上ロード前の仮入力）
  // 計上月 = 案件終了日が含まれる月
  // 請求予定日 = 計上月末日
  // 入金予定日 = 請求予定日の翌月末日
  useEffect(() => {
    if (!selectedProject) return;
    setExistingRevenueId("");
    if (selectedProject.expected_amount) setAmount(selectedProject.expected_amount);
    const endDate = (selectedProject.event_end as string | undefined) || undefined;
    if (endDate) {
      const [ey, em] = endDate.split("-").map(Number);
      if (ey && em) {
        setRecognitionMonth(`${ey}-${String(em).padStart(2, "0")}`);
        setBillingDate(localDateStr(new Date(ey, em, 0)));       // 計上月末
        setPaymentDueDate(localDateStr(new Date(ey, em + 1, 0))); // 翌月末
      }
    }
  }, [selectedProjectId, selectedProject?.event_end]); // eslint-disable-line react-hooks/exhaustive-deps

  // 既存売上が見つかった場合: 既存データで上書き（更新モードに切り替え）
  // 既存値が空のフィールドは案件ベースの自動入力を残す
  useEffect(() => {
    if (!primaryRevenue) return;
    setExistingRevenueId(primaryRevenue.id);
    setAmount(primaryRevenue.amount || 0);
    setTaxCategory(primaryRevenue.tax_category || "tax10");
    if (primaryRevenue.recognition_date) setRecognitionMonth(primaryRevenue.recognition_date.slice(0, 7));
    if (primaryRevenue.billing_date) setBillingDate(primaryRevenue.billing_date.slice(0, 10));
    if (primaryRevenue.payment_due_date) setPaymentDueDate(primaryRevenue.payment_due_date.slice(0, 10));
    setNotes(primaryRevenue.notes || "");
    setIsAdvancePayment(!!primaryRevenue.is_advance_payment);
    if (Array.isArray(primaryRevenue.items) && primaryRevenue.items.length > 0) {
      setItems(primaryRevenue.items.map((it: any) => ({
        description: it.description || "",
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        amount: it.amount || 0,
        pricing_item_id: it.pricing_item_id,
      })));
    }
  }, [primaryRevenue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Create / Update mutation
  const createMutation = useMutation({
    mutationFn: ({ payload, revenueId }: { payload: Record<string, unknown>; revenueId: string }) =>
      revenueId
        ? api.put(`/revenues/${revenueId}`, payload)
        : api.post("/revenues", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      qc.invalidateQueries({ queryKey: ["revenues-for-project", selectedProjectId] });
      handleCloseDialog();
    },
  });

  const submitError = createMutation.error as
    | { response?: { data?: { error?: { message?: string } } }; message?: string }
    | null;
  const submitErrorMessage = submitError
    ? submitError.response?.data?.error?.message || submitError.message || "登録に失敗しました"
    : "";

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setProjectSearch("");
    setSelectedProjectId("");
    setSelectedProjectObj(null);
    setSelectedEpisodeId("");
    setTaxCategory("tax10");
    setAmount(0);
    setRecognitionMonth("");
    setBillingDate("");
    setPaymentDueDate("");
    setNotes("");
    setItems([]);
    setIsAdvancePayment(false);
    setExistingRevenueId("");
    createMutation.reset();
  };

  const handleEditRevenue = (r: RevenueRow) => {
    setExistingRevenueId(r.id);
    setSelectedProjectId(r.project_id);
    setSelectedProjectObj(null);
    setProjectSearch(r.project_name || "");
    setAmount(Number(r.amount) || 0);
    setTaxCategory(r.tax_category || "tax10");
    setRecognitionMonth(r.recognition_date ? r.recognition_date.slice(0, 7) : "");
    setBillingDate(r.billing_date ? r.billing_date.slice(0, 10) : "");
    setPaymentDueDate(r.payment_due_date ? r.payment_due_date.slice(0, 10) : "");
    setNotes(r.notes || "");
    setIsAdvancePayment(!!r.is_advance_payment);
    setSelectedEpisodeId("");
    setItems([]);
    setDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!selectedProjectId) return;

    createMutation.mutate({
      revenueId: existingRevenueId,
      payload: {
        project_id: selectedProjectId,
        episode_id: selectedEpisodeId || null,
        customer_id: selectedProject?.customer_id ?? null,
        tax_category: taxCategory,
        amount: items.length > 0 ? itemsTotal : amount,
        recognition_date: recognitionMonth ? `${recognitionMonth}-01` : null,
        billing_date: billingDate || null,
        payment_due_date: paymentDueDate || null,
        notes: notes || null,
        items: items.length > 0 ? items : undefined,
        is_advance_payment: isAdvancePayment,
      },
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

  // Append a row linked to a pricing-master item
  const handlePickPricingItem = useCallback((picked: PickedPricingItem) => {
    const description = picked.sub_label
      ? `${picked.name} (${picked.sub_label})`
      : picked.name;
    setItems((prev) => [
      ...prev,
      {
        description,
        quantity: 1,
        unit_price: picked.unit_price,
        amount: picked.unit_price,
        pricing_item_id: picked.pricing_item_id,
      },
    ]);
  }, []);

  const canSubmit =
    !!selectedProjectId &&
    !!selectedProject?.customer_id &&
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
        <div className="flex flex-wrap gap-2">
          <ExcelToolbar resource="/revenues" name="売上" queryKey={["revenues"]} hasDuplicateKey={false} />
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新規売上
          </Button>
        </div>
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
                {revenues.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleEditRevenue(r)}
                    role="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.billing_key || "-"}
                          </span>
                          <span className="font-mono text-xs font-medium text-primary">
                            {r.gls_number || "-"}
                          </span>
                        </div>
                        <div className="text-sm mt-0.5 font-medium truncate">
                          {r.project_name || "-"}
                          {r.event_end && (
                            <span className="text-xs text-muted-foreground ml-1">({formatShortDate(r.event_end)})</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {r.customer_name || "-"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="font-medium font-number">
                          {formatCurrency(r.amount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatMonth(r.recognition_date)}
                        </div>
                        {r.project_id && (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/sales/projects/${r.project_id}`);
                            }}
                          >
                            <ExternalLink className="h-3 w-3" />
                            案件
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table className={Object.keys(colWidths).length > 0 ? "table-fixed" : ""}>
                  <TableHeader>
                    <TableRow>
                      {([
                        { key: "billing_key", label: "請求KEY", defaultW: 130 },
                        { key: "gls_number", label: "GLS番号", colId: "gls", defaultW: 110, noSort: true },
                        { key: "project_name", label: "案件名", defaultW: 180 },
                        { key: "customer_name", label: "顧客", colId: "customer", defaultW: 120, noSort: true },
                        { key: "tax_category", label: "税区分", colId: "tax", defaultW: 70, noSort: true },
                        { key: "amount", label: "金額", defaultW: 100, align: "right" },
                        { key: "recognition_date", label: "計上月", defaultW: 90 },
                        { key: "action", label: "", colId: "action", defaultW: 60, noSort: true },
                      ] as { key: string; label: string; colId?: string; defaultW: number; align?: string; noSort?: boolean }[]).map(({ key, label, colId, defaultW, align, noSort }) => {
                        const id = colId ?? key;
                        const w = colWidths[id] ?? (Object.keys(colWidths).length > 0 ? defaultW : undefined);
                        return (
                          <TableHead
                            key={id}
                            style={w ? { width: w, minWidth: 40 } : undefined}
                            className={`select-none whitespace-nowrap relative${align === "right" ? " text-right" : ""}${!noSort ? " cursor-pointer hover:bg-muted/50" : ""}`}
                            onClick={noSort ? undefined : () => handleSort(key as SortKey)}
                          >
                            {label}
                            {!noSort && <SortIcon col={key as SortKey} sortKey={sortKey} sortDir={sortDir} />}
                            <span
                              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-primary/40 select-none"
                              onMouseDown={(e) => startResize(id, e, colWidths[id] ?? defaultW)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenues.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleEditRevenue(r)}
                      >
                        <TableCell className="font-mono text-xs">
                          {r.billing_key || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium text-primary">
                          {r.gls_number || "-"}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="block truncate">
                            {r.project_name || "-"}
                            {r.event_end && (
                              <span className="text-xs text-muted-foreground ml-1">({formatShortDate(r.event_end)})</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="truncate max-w-[120px]">
                          {r.customer_name || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.tax_category === "tax10" ? "10%" : r.tax_category === "tax8" ? "8%" : "非課税"}
                        </TableCell>
                        <TableCell className="text-right font-medium font-number">
                          {formatCurrency(r.amount)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatMonth(r.recognition_date)}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {r.project_id && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="案件管理画面を開く"
                              onClick={() => navigate(`/sales/projects/${r.project_id}`)}
                            >
                              <ExternalLink className="h-4 w-4 text-primary" />
                            </Button>
                          )}
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
            <DialogTitle>{existingRevenueId ? "売上を更新" : "新規売上登録"}</DialogTitle>
          </DialogHeader>
          {existingRevenueId && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              この案件にはすでに売上が登録されています。内容を編集すると上書き保存されます。
            </div>
          )}

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
                  setSelectedProjectObj(null);
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
                        setSelectedProjectObj(p);
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

            {/* Episode select (A系のみ・任意) */}
            {selectedProjectId && !isProjectCategoryB && episodes.length > 0 && (
              <div className="space-y-1">
                <Label>話数（任意）</Label>
                <Select
                  value={selectedEpisodeId}
                  onValueChange={(v) => setSelectedEpisodeId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="話数を選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">なし</SelectItem>
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
                <div className="flex flex-wrap gap-2">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPricingPickerOpen(true)}
                    disabled={!selectedProjectId}
                    title={!selectedProjectId ? "案件を選択してください" : undefined}
                  >
                    <Link2 className="mr-1 h-3 w-3" />
                    料金表から追加
                  </Button>
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
                              <div className="relative">
                                <Input
                                  value={item.description}
                                  onChange={(e) =>
                                    updateItem(idx, "description", e.target.value)
                                  }
                                  placeholder="項目名"
                                  className={`h-8 text-sm ${item.pricing_item_id ? "pr-8" : ""}`}
                                />
                                {item.pricing_item_id && (
                                  <span
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary"
                                    title="料金表に紐付け済"
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </div>
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
                <Label>計上月</Label>
                <Input
                  type="month"
                  value={recognitionMonth}
                  onChange={(e) => {
                    setRecognitionMonth(e.target.value);
                    if (e.target.value) {
                      const [y, m] = e.target.value.split("-").map(Number);
                      // 請求予定日 = 計上月末、入金予定日 = 翌月末
                      setBillingDate(localDateStr(new Date(y, m, 0)));
                      setPaymentDueDate(localDateStr(new Date(y, m + 1, 0)));
                    }
                  }}
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

            {/* 前金チェックボックス */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-advance-payment"
                checked={isAdvancePayment}
                onCheckedChange={(v) => setIsAdvancePayment(!!v)}
              />
              <Label htmlFor="is-advance-payment" className="cursor-pointer">前金</Label>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>備考</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="備考"
                rows={3}
              />
            </div>

            {/* Error */}
            {submitErrorMessage && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                {submitErrorMessage}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleCloseDialog}>
                キャンセル
              </Button>
              <Button disabled={!canSubmit} onClick={handleCreateSubmit}>
                {createMutation.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                {existingRevenueId ? "更新" : "登録"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PricingItemPicker
        open={pricingPickerOpen}
        onOpenChange={setPricingPickerOpen}
        customerType={selectedProject?.customer_type === "internal" ? "internal" : "external"}
        onSelect={handlePickPricingItem}
      />
    </div>
    </PageTransition>
  );
}
