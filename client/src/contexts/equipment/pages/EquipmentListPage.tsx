import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search, Loader2, Plus } from "lucide-react";

interface EquipmentItem {
  id: string;
  eq_code: string;
  name: string;
  category_id: string;
  category_name?: string;
  item_type: "facility" | "rental";
  status: string;
  condition?: string;
  location_name?: string;
  manufacturer?: string;
  model_number?: string;
  serial_number?: string;
  is_lendable?: boolean;
  child_count?: number;
}

interface Category {
  id: string;
  name: string;
}

const statusLabels: Record<string, string> = {
  active: "稼働中",
  in_repair: "修理中",
  retired: "退役",
  disposed: "廃棄",
  lost: "紛失",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  in_repair: "bg-yellow-100 text-yellow-700",
  retired: "bg-gray-100 text-gray-600",
  disposed: "bg-red-100 text-red-700",
  lost: "bg-red-100 text-red-700",
};

const itemTypeLabels: Record<string, string> = {
  facility: "設備",
  rental: "レンタル",
};

const LIMIT = 20;

const statusTabs = [
  { value: "", label: "すべて" },
  { value: "active", label: "稼働中" },
  { value: "in_repair", label: "修理中" },
  { value: "retired", label: "退役" },
  { value: "disposed", label: "廃棄" },
];

interface FormState {
  name: string;
  category_id: string;
  item_type: string;
  manufacturer: string;
  model_number: string;
  serial_number: string;
  status: string;
  condition: string;
  is_lendable: boolean;
}

const emptyForm: FormState = {
  name: "",
  category_id: "",
  item_type: "facility",
  manufacturer: "",
  model_number: "",
  serial_number: "",
  status: "active",
  condition: "",
  is_lendable: false,
};

export default function EquipmentListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-items", page, search, statusFilter, categoryFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.category_id = categoryFilter;
      return (await api.get("/equipment/items", { params })).data;
    },
  });

  const items: EquipmentItem[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const { data: categoriesData } = useQuery({
    queryKey: ["equipment-categories"],
    queryFn: async () => (await api.get("/equipment/categories")).data,
  });
  const categories: Category[] = categoriesData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/equipment/items", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      handleCloseDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.put(`/equipment/items/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      handleCloseDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (item: EquipmentItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category_id: item.category_id || "",
      item_type: item.item_type || "facility",
      manufacturer: item.manufacturer || "",
      model_number: item.model_number || "",
      serial_number: item.serial_number || "",
      status: item.status || "active",
      condition: item.condition || "",
      is_lendable: !!item.is_lendable,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.category_id) return;
    const payload = { ...form };
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        {/* Header */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold">機材一覧</h1>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新規登録
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative max-w-sm flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="機材名・コードで検索..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのカテゴリ</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 rounded-lg border p-1 w-fit">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              className={`rounded-md px-3 py-1 text-xs sm:px-4 sm:py-1.5 sm:text-sm font-medium transition-colors ${
                statusFilter === tab.value ? "bg-primary text-white" : "hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">データがありません</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/equipment/items/${item.id}`)}
                  role="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{item.eq_code}</span>
                        <Badge className={`text-xs ${statusColors[item.status] || "bg-gray-100 text-gray-600"}`}>
                          {statusLabels[item.status] || item.status}
                        </Badge>
                        {item.child_count && item.child_count > 0 && (
                          <Badge variant="outline" className="text-xs">{item.child_count}点</Badge>
                        )}
                      </div>
                      <div className="text-sm mt-1 font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {item.category_name || "-"} / {itemTypeLabels[item.item_type] || item.item_type}
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
                    <TableHead>機材コード</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>ロケーション</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/equipment/items/${item.id}`)}
                    >
                      <TableCell className="font-mono text-sm">{item.eq_code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.name}</span>
                          {item.child_count && item.child_count > 0 && (
                            <Badge variant="outline" className="text-xs">{item.child_count}点</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{item.category_name || "-"}</TableCell>
                      <TableCell>{itemTypeLabels[item.item_type] || item.item_type}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[item.status] || "bg-gray-100 text-gray-600"}>
                          {statusLabels[item.status] || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.location_name || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(item); }}
                        >
                          編集
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  全{total}件中 {(page - 1) * LIMIT + 1}-{Math.min(page * LIMIT, total)}件
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    前へ
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    次へ
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "機材編集" : "新規機材登録"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="機材名"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>カテゴリ *</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>種別 *</Label>
                  <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facility">設備</SelectItem>
                      <SelectItem value="rental">レンタル</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>メーカー</Label>
                  <Input
                    value={form.manufacturer}
                    onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    placeholder="メーカー名"
                  />
                </div>
                <div>
                  <Label>型番</Label>
                  <Input
                    value={form.model_number}
                    onChange={(e) => setForm({ ...form, model_number: e.target.value })}
                    placeholder="型番"
                  />
                </div>
              </div>

              <div>
                <Label>シリアル番号</Label>
                <Input
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  placeholder="シリアル番号"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ステータス</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>コンディション</Label>
                  <Input
                    value={form.condition}
                    onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    placeholder="良好 / 要注意 等"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_lendable"
                  checked={form.is_lendable}
                  onCheckedChange={(checked) => setForm({ ...form, is_lendable: !!checked })}
                />
                <Label htmlFor="is_lendable" className="cursor-pointer">貸出可能</Label>
              </div>
            </div>

            <DialogFooter>
              {editingId && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirm("この機材を削除しますか？")) {
                      deleteMutation.mutate(editingId);
                      handleCloseDialog();
                    }
                  }}
                  className="mr-auto"
                >
                  削除
                </Button>
              )}
              <Button variant="outline" onClick={handleCloseDialog}>キャンセル</Button>
              <Button disabled={!form.name || !form.category_id || isPending} onClick={handleSubmit}>
                {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editingId ? "更新" : "登録"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
