import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthContext";
import {
  SgaExpense,
  Vendor,
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Search, Loader2, Plus, Pencil, Trash2 } from "lucide-react";

function formatSettlementNo(method: string, number: string): string {
  if (!number || number === "pending") return "未定";
  if (method === "xpoint") return `X-${number}`;
  if (method === "rakuraku") return `楽-${number}`;
  return number;
}

interface SgaFormData {
  vendor_name: string;
  vendor_id: string;
  tax_category: string;
  recognition_date: string;
  settlement_method: string;
  settlement_number: string;
  settlement_number_pending: boolean;
  amount: number;
  description: string;
  notes: string;
  invoice_qualified: boolean;
  payment_due_date: string;
  assigned_to: string;
  expense_type: 'fixed' | 'spot';
  amortize_enabled: boolean;
  amortize_start: string;
  amortize_end: string;
  source: 'staff' | 'accounting';
}

const initialFormData: SgaFormData = {
  vendor_name: "",
  vendor_id: "",
  tax_category: "tax10",
  recognition_date: "",
  settlement_method: "xpoint",
  settlement_number: "",
  settlement_number_pending: false,
  amount: 0,
  description: "",
  notes: "",
  invoice_qualified: true,
  payment_due_date: "",
  assigned_to: "",
  expense_type: "spot",
  amortize_enabled: false,
  amortize_start: "",
  amortize_end: "",
  source: "staff",
};

function countAmortizeMonths(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

function generateBillingKeyPreview(recognitionDate: string): string {
  if (!recognitionDate) return "";
  const d = new Date(recognitionDate);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(new Date(y, d.getMonth() + 1, 0).getDate()).padStart(2, "0");
  return `${y}${m}${day}-1`;
}

export default function SgaListPage() {
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [page, setPage] = useState(1);
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

  // Fetch vendors for dropdown
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
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

  const billingKeyPreview = useMemo(
    () => generateBillingKeyPreview(form.recognition_date),
    [form.recognition_date]
  );

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

  const amortizeMonths = useMemo(
    () => countAmortizeMonths(form.amortize_start, form.amortize_end),
    [form.amortize_start, form.amortize_end]
  );

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      vendor_name: form.vendor_name,
      vendor_id: form.vendor_id || null,
      tax_category: form.tax_category,
      recognition_date: form.recognition_date || null,
      settlement_method: form.settlement_method,
      settlement_number: form.settlement_number_pending
        ? "pending"
        : form.settlement_number || null,
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
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">販管費一覧</h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-1 h-4 w-4" />
          新規登録
        </Button>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>請求KEY</TableHead>
                <TableHead>支払先</TableHead>
                <TableHead>詳細</TableHead>
                <TableHead>発生年月</TableHead>
                <TableHead>支払期日</TableHead>
                <TableHead>税区分</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>精算方法</TableHead>
                <TableHead>精算No.</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>処理元</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sgaList.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center text-muted-foreground"
                  >
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                sgaList.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {item.billing_key || "-"}
                    </TableCell>
                    <TableCell>{item.vendor_name || "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {item.description || "-"}
                    </TableCell>
                    <TableCell>
                      {formatDate(item.recognition_date)}
                    </TableCell>
                    <TableCell>
                      {formatDate(item.payment_due_date)}
                    </TableCell>
                    <TableCell>
                      {TaxCategoryLabels[item.tax_category as TaxCategory] ??
                        item.tax_category}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.amount)}
                    </TableCell>
                    <TableCell>
                      {SettlementMethodLabels[
                        item.settlement_method as SettlementMethod
                      ] ?? item.settlement_method ?? "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatSettlementNo(
                        item.settlement_method ?? "",
                        item.settlement_number ?? ""
                      )}
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
                    <TableCell>
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
                ))
              )}
            </TableBody>
          </Table>

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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "販管費編集" : "販管費 新規登録"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Row 1: vendor + tax */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>支払先</Label>
                <Input
                  value={form.vendor_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vendor_name: e.target.value }))
                  }
                  placeholder="支払先名"
                />
                {vendors.length > 0 && (
                  <SearchableSelect
                    className="mt-1"
                    options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
                    value={form.vendor_id}
                    onChange={(val) => {
                      const v = vendors.find((vn) => vn.id === val);
                      setForm((f) => ({
                        ...f,
                        vendor_id: val,
                        vendor_name: v?.name ?? f.vendor_name,
                      }));
                    }}
                    placeholder="仕入先マスタから検索（任意）"
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label>税区分</Label>
                <Select
                  value={form.tax_category}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, tax_category: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tax10">10%課税</SelectItem>
                    <SelectItem value="tax8">8%課税(軽減)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: recognition_date + billing_key preview */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>発生年月</Label>
                <Input
                  type="date"
                  value={form.recognition_date}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      recognition_date: e.target.value,
                    }))
                  }
                />
                {billingKeyPreview && (
                  <p className="text-xs text-muted-foreground">
                    KEY: {billingKeyPreview}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>支払期日</Label>
                <Input
                  type="date"
                  value={form.payment_due_date}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      payment_due_date: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Row 3: settlement */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>精算方法</Label>
                <Select
                  value={form.settlement_method}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, settlement_method: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xpoint">X-Point</SelectItem>
                    <SelectItem value="rakuraku">楽楽精算</SelectItem>
                    <SelectItem value="other">その他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>精算番号</Label>
                <div className="flex items-center gap-2 mb-1">
                  <Checkbox
                    checked={form.settlement_number_pending}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({
                        ...f,
                        settlement_number_pending: !!checked,
                        settlement_number: checked ? "" : f.settlement_number,
                      }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">未定</span>
                </div>
                <Input
                  type="number"
                  disabled={form.settlement_number_pending}
                  value={form.settlement_number}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      settlement_number: e.target.value,
                    }))
                  }
                  placeholder="精算番号"
                />
                {(form.settlement_number || form.settlement_number_pending) && (
                  <p className="text-xs text-muted-foreground">
                    表示:{" "}
                    {formatSettlementNo(
                      form.settlement_method,
                      form.settlement_number_pending
                        ? "pending"
                        : form.settlement_number
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Row 4: amount */}
            <div className="space-y-1">
              <Label>金額</Label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ¥
                </span>
                <Input
                  type="number"
                  min={0}
                  className="pl-7"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            {/* Row 4.5: expense_type + amortization */}
            <div className="space-y-2">
              <Label>販管費種別</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="expense_type"
                    checked={form.expense_type === "spot"}
                    onChange={() =>
                      setForm((f) => ({ ...f, expense_type: "spot" }))
                    }
                    className="accent-primary"
                  />
                  <span className="text-sm">スポット</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="expense_type"
                    checked={form.expense_type === "fixed"}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        expense_type: "fixed",
                        amortize_enabled: false,
                        amortize_start: "",
                        amortize_end: "",
                      }))
                    }
                    className="accent-primary"
                  />
                  <span className="text-sm">固定(毎月)</span>
                </label>
              </div>

              {form.expense_type === "spot" && (
                <div className="ml-2 space-y-2 border-l-2 border-muted pl-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={form.amortize_enabled}
                      onCheckedChange={(checked) =>
                        setForm((f) => ({
                          ...f,
                          amortize_enabled: !!checked,
                          amortize_start: checked ? f.amortize_start : "",
                          amortize_end: checked ? f.amortize_end : "",
                        }))
                      }
                    />
                    <span className="text-sm">月按分する</span>
                  </div>
                  {form.amortize_enabled && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs">按分開始月</Label>
                          <Input
                            type="month"
                            value={form.amortize_start}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                amortize_start: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">按分終了月</Label>
                          <Input
                            type="month"
                            value={form.amortize_end}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                amortize_end: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      {form.amount > 0 && amortizeMonths > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(form.amount)} ÷ {amortizeMonths}ヶ月 ={" "}
                          {formatCurrency(Math.floor(form.amount / amortizeMonths))}/月
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Row 5: description + notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>詳細</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="詳細"
                />
              </div>
              <div className="space-y-1">
                <Label>備考</Label>
                <Input
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="備考"
                />
              </div>
            </div>

            {/* Row 5.5: source (処理元) */}
            <div className="space-y-1">
              <Label>処理元</Label>
              <Select value={form.source} onValueChange={(val) => setForm(f => ({ ...f, source: val as 'staff' | 'accounting' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">スタッフ入力</SelectItem>
                  <SelectItem value="accounting">経理入力</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Row 6: invoice + assigned_to */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>インボイス</Label>
                <Select
                  value={form.invoice_qualified ? "qualified" : "unqualified"}
                  onValueChange={(val) =>
                    setForm((f) => ({
                      ...f,
                      invoice_qualified: val === "qualified",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified">適格事業者</SelectItem>
                    <SelectItem value="unqualified">非適格事業者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>担当者</Label>
                <SearchableSelect
                  options={users.map((u: { id: string; name: string }) => ({ value: u.id, label: u.name }))}
                  value={form.assigned_to}
                  onChange={(val) =>
                    setForm((f) => ({ ...f, assigned_to: val }))
                  }
                  placeholder="担当者を検索..."
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleCloseDialog}>
                キャンセル
              </Button>
              <Button
                disabled={!form.vendor_name || isSaving}
                onClick={handleSubmit}
              >
                {isSaving && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                {editingId ? "更新" : "登録"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
