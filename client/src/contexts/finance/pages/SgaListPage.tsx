import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { useAuth } from "@/contexts/platform/AuthContext";
import { PageTransition } from "@/components/ui/motion";
import {
  SgaExpense,
  Vendor,
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
} from "@/types";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

import SgaDialog, {
  type SgaFormData,
  initialFormData,
  formatSettlementNo,
  SettlementBadge,
} from "../components/SgaDialog";

export default function SgaListPage() {
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const startResize = useCallback((col: string, e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: currentWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.max(50, resizeRef.current.startW + ev.clientX - resizeRef.current.startX);
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SgaFormData>(initialFormData);

  // Fetch SGA expenses
  const { data, isLoading } = useQuery({
    queryKey: ["sga-list", page, search, sourceFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (sourceFilter) params.source = sourceFilter;
      return (await api.get("/sga", { params })).data;
    },
  });
  const sgaList: SgaExpense[] = data?.data ?? [];
  const pagination = data?.pagination;

  // Fetch vendors for dropdown (販管費支払先フラグが立っている取引先のみ)
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list-sga"],
    queryFn: async () => (await api.get("/vendors?limit=200&sga_payee_only=true")).data,
    enabled: dialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  // Fetch users for assigned_to
  const { data: usersData } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await api.get("/users?limit=200")).data,
    enabled: dialogOpen,
  });
  const users = usersData?.data ?? [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/sga", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sga-list"] });
      handleCloseDialog();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.put(`/sga/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sga-list"] });
      handleCloseDialog();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sga/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sga-list"] });
    },
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({
      ...initialFormData,
      assigned_to: currentUser?.id ?? "",
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (item: SgaExpense) => {
    setEditingId(item.id);
    setForm({
      vendor_name: item.vendor_name ?? "",
      vendor_id: item.vendor_id ?? "",
      tax_category: item.tax_category ?? "tax10",
      recognition_date: item.recognition_date?.slice(0, 10) ?? "",
      settlement_method: item.settlement_method ?? "xpoint",
      settlement_number:
        item.settlement_number === "pending" ? "" : (item.settlement_number ?? ""),
      settlement_number_pending: item.settlement_number === "pending",
      amount: item.amount ?? 0,
      description: item.description ?? "",
      notes: item.notes ?? "",
      invoice_qualified: item.invoice_qualified ?? true,
      payment_due_date: item.payment_due_date?.slice(0, 10) ?? "",
      assigned_to: item.assigned_to ?? currentUser?.id ?? "",
      expense_type: item.expense_type ?? "spot",
      amortize_enabled: !!(item.amortize_start),
      amortize_start: item.amortize_start ?? "",
      amortize_end: item.amortize_end ?? "",
      source: item.source || "staff",
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(initialFormData);
  };

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      vendor_name: form.vendor_name,
      vendor_id: form.vendor_id || null,
      tax_category: form.tax_category,
      recognition_date: form.recognition_date || null,
      settlement_method: form.settlement_method,
      settlement_number: form.settlement_number || null,
      amount: form.amount,
      description: form.description || null,
      notes: form.notes || null,
      invoice_qualified: form.invoice_qualified,
      payment_due_date: form.payment_due_date || null,
      assigned_to: form.assigned_to || null,
      expense_type: form.expense_type,
      amortize_start: (form.expense_type === 'spot' && form.amortize_enabled && form.amortize_start) ? form.amortize_start : null,
      amortize_end: (form.expense_type === 'spot' && form.amortize_enabled && form.amortize_end) ? form.amortize_end : null,
      source: form.source,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">販管費一覧</h1>
        <div className="flex flex-wrap gap-2">
          <ExcelToolbar resource="/sga-expenses" name="販管費" queryKey={["sga-expenses"]} hasDuplicateKey={false} />
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新規登録
          </Button>
        </div>
      </div>

      {/* Source Filter Tabs */}
      <div className="flex gap-2">
        {[
          { value: "", label: "全て" },
          { value: "staff", label: "スタッフ入力" },
          { value: "accounting", label: "経理入力" },
        ].map((tab) => (
          <Button
            key={tab.value}
            variant={sourceFilter === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => { setSourceFilter(tab.value); setPage(1); }}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="支払先・詳細で検索..."
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
          {sgaList.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {sgaList.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{item.vendor_name || "-"}</span>
                          <SettlementBadge number={item.settlement_number} />
                          {item.amortize_start ? (
                            <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">按分中</span>
                          ) : item.expense_type === 'fixed' ? (
                            <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">固定</span>
                          ) : (
                            <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">スポット</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 truncate">
                          {item.description || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(item.recognition_date)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="font-medium font-number">{formatCurrency(item.amount)}</div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenEdit(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm("この販管費を削除しますか？")) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
                      { key: "bkey", label: "請求KEY", defaultW: 120 },
                      { key: "vendor", label: "支払先", defaultW: 130 },
                      { key: "desc", label: "詳細", defaultW: 180 },
                      { key: "rec", label: "発生年月", defaultW: 90 },
                      { key: "due", label: "支払期日", defaultW: 90 },
                      { key: "tax", label: "税区分", defaultW: 70 },
                      { key: "amount", label: "金額", defaultW: 100, align: "right" },
                      { key: "method", label: "精算方法", defaultW: 90 },
                      { key: "status", label: "精算状況", defaultW: 90 },
                      { key: "type", label: "種別", defaultW: 70 },
                      { key: "source", label: "処理元", defaultW: 70 },
                      { key: "ops", label: "操作", defaultW: 70 },
                    ] as { key: string; label: string; defaultW: number; align?: string }[]).map(({ key, label, defaultW, align }) => {
                      const w = colWidths[key] ?? (Object.keys(colWidths).length > 0 ? defaultW : undefined);
                      return (
                        <TableHead
                          key={key}
                          style={w ? { width: w, minWidth: 40 } : undefined}
                          className={`select-none whitespace-nowrap relative${align === "right" ? " text-right" : ""}`}
                        >
                          {label}
                          <span
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-primary/40 select-none"
                            onMouseDown={(e) => startResize(key, e, colWidths[key] ?? defaultW)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sgaList.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpenEdit(item)}
                    >
                      <TableCell className="font-mono text-xs">
                        {item.billing_key || "-"}
                      </TableCell>
                      <TableCell>{item.vendor_name || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {item.description || "-"}
                      </TableCell>
                      <TableCell>
                        {formatMonth(item.recognition_date)}
                      </TableCell>
                      <TableCell>
                        {formatDate(item.payment_due_date)}
                      </TableCell>
                      <TableCell>
                        {TaxCategoryLabels[item.tax_category as TaxCategory] ??
                          item.tax_category}
                      </TableCell>
                      <TableCell className="text-right font-medium font-number">
                        {formatCurrency(item.amount)}
                      </TableCell>
                      <TableCell>
                        {SettlementMethodLabels[
                          item.settlement_method as SettlementMethod
                        ] ?? item.settlement_method ?? "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <SettlementBadge number={item.settlement_number} />
                          {item.settlement_number && item.settlement_number !== "pending" && (
                            <span className="font-mono text-xs">
                              {formatSettlementNo(item.settlement_method ?? "", item.settlement_number)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.amortize_start ? (
                          <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                            按分中
                          </span>
                        ) : item.expense_type === 'fixed' ? (
                          <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            固定
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            スポット
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.source === 'accounting' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                        }`}>
                          {item.source === 'accounting' ? '経理' : 'スタッフ'}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenEdit(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm("この販管費を削除しますか？")) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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

      <SgaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        form={form}
        setForm={setForm}
        vendors={vendors}
        users={users}
        isSaving={isSaving}
        onSubmit={handleSubmit}
        onClose={handleCloseDialog}
      />
    </div>
    </PageTransition>
  );
}
