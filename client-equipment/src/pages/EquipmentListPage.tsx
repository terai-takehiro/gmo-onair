import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Search, Package, Pencil, Trash2,
} from "lucide-react";

const statusLabels: Record<string, string> = {
  active: "稼働中",
  in_repair: "修理中",
  retired: "引退",
  disposed: "廃棄",
  lost: "紛失",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  in_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-100 text-gray-600",
  disposed: "bg-red-100 text-red-800",
  lost: "bg-red-200 text-red-900",
};

const conditionLabels: Record<string, string> = {
  excellent: "優良",
  good: "良好",
  fair: "可",
  poor: "不良",
};

const typeLabels: Record<string, string> = {
  facility: "設備",
  rental: "貸出",
};

export default function EquipmentListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "", category_id: "", item_type: "facility" as string, unit_number: "",
    manufacturer: "", model_number: "", serial_number: "", description: "",
    asset_number: "", acquisition_date: "", acquisition_cost: "",
    depreciation_method: "straight_line", useful_life: "", asset_class: "fixed_asset",
    status: "active", condition: "good",
    location_id: "", location_detail: "", notes: "",
    is_lendable: false, lending_rules: "",
  });

  const resetForm = () => setForm({
    name: "", category_id: "", item_type: "facility", unit_number: "",
    manufacturer: "", model_number: "", serial_number: "", description: "",
    asset_number: "", acquisition_date: "", acquisition_cost: "",
    depreciation_method: "straight_line", useful_life: "", asset_class: "fixed_asset",
    status: "active", condition: "good",
    location_id: "", location_detail: "", notes: "",
    is_lendable: false, lending_rules: "",
  });

  // Queries
  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["equipment-items", search, filterType, filterStatus],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterType) params.item_type = filterType;
      if (filterStatus) params.status = filterStatus;
      return (await api.get("/equipment/items", { params })).data;
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["equipment-categories"],
    queryFn: async () => (await api.get("/equipment/categories")).data.data,
  });
  const categories: any[] = categoriesData ?? [];

  const { data: locationsData } = useQuery({
    queryKey: ["equipment-locations"],
    queryFn: async () => (await api.get("/equipment/locations")).data.data,
  });
  const locations: any[] = locationsData ?? [];

  const items: any[] = itemsData?.data ?? [];

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId
        ? api.put(`/equipment/items/${editingId}`, payload)
        : api.post("/equipment/items", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
      setDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
    },
  });

  const openNew = () => {
    resetForm();
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setForm({
      name: item.name || "",
      category_id: item.category_id || "",
      item_type: item.item_type || "facility",
      unit_number: item.unit_number?.toString() || "",
      manufacturer: item.manufacturer || "",
      model_number: item.model_number || "",
      serial_number: item.serial_number || "",
      description: item.description || "",
      asset_number: item.asset_number || "",
      acquisition_date: item.acquisition_date || "",
      acquisition_cost: item.acquisition_cost?.toString() || "",
      depreciation_method: item.depreciation_method || "straight_line",
      useful_life: item.useful_life?.toString() || "",
      asset_class: item.asset_class || "fixed_asset",
      status: item.status || "active",
      condition: item.condition || "good",
      location_id: item.location_id || "",
      location_detail: item.location_detail || "",
      notes: item.notes || "",
      is_lendable: !!item.is_lendable,
      lending_rules: item.lending_rules || "",
    });
    setEditingId(item.id);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) return;
    saveMutation.mutate({
      ...form,
      unit_number: form.unit_number ? Number(form.unit_number) : null,
      acquisition_cost: form.acquisition_cost ? Number(form.acquisition_cost) : null,
      useful_life: form.useful_life ? Number(form.useful_life) : null,
      category_id: form.category_id || null,
      location_id: form.location_id || null,
    });
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="heading-page text-xl lg:text-2xl">機材一覧</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          機材登録
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="名前・EQコード・型番で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="種別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="facility">設備</SelectItem>
            <SelectItem value="rental">貸出</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="状態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="active">稼働中</SelectItem>
            <SelectItem value="in_repair">修理中</SelectItem>
            <SelectItem value="retired">引退</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>機材が登録されていません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/equipment/items/${item.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {typeLabels[item.item_type] || item.item_type}
                      </Badge>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[item.status] || ""}`}>
                        {statusLabels[item.status] || item.status}
                      </span>
                      {item.category_name && (
                        <span className="text-[10px] text-muted-foreground">{item.category_name}</span>
                      )}
                    </div>
                    <h3 className="font-semibold mt-1 truncate">
                      {item.name}
                      {item.unit_number && <span className="text-primary ml-1.5">No.{item.unit_number}</span>}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
                      {item.manufacturer && <span>{item.manufacturer}</span>}
                      {item.model_number && <span>{item.model_number}</span>}
                      {item.location_detail && <span>📍 {item.location_detail}</span>}
                    </div>
                    {item.item_type === "rental" && item.is_lendable && item.current_lending && (
                      <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 inline-block">
                        貸出中: {item.current_lending.borrower_name}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (confirm(`「${item.name}」を削除しますか？`)) deleteMutation.mutate(item.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "機材編集" : "機材登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>機材名 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sony PXW-FX9" />
              </div>
              <div className="space-y-1">
                <Label>個体No.</Label>
                <Input type="number" min="1" value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} placeholder="1, 2, 3..." />
              </div>
              <div className="space-y-1">
                <Label>種別</Label>
                <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facility">設備系</SelectItem>
                    <SelectItem value="rental">貸出系</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>カテゴリ</Label>
                <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>メーカー</Label>
                <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>型番</Label>
                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>シリアルナンバー</Label>
                <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>保管場所</Label>
                <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {locations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>場所補足</Label>
                <Input value={form.location_detail} onChange={(e) => setForm({ ...form, location_detail: e.target.value })} placeholder="ラックB-2 など" />
              </div>
            </div>

            {/* Asset info */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">資産情報</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>資産区分</Label>
                  <Select value={form.asset_class} onValueChange={(v) => setForm({ ...form, asset_class: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_asset">固定資産</SelectItem>
                      <SelectItem value="consumable">消耗品</SelectItem>
                      <SelectItem value="low_value">少額資産</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>管理番号</Label>
                  <Input value={form.asset_number} onChange={(e) => setForm({ ...form, asset_number: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>取得日</Label>
                  <Input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>取得価額</Label>
                  <Input type="number" value={form.acquisition_cost} onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>耐用年数</Label>
                  <Input type="number" value={form.useful_life} onChange={(e) => setForm({ ...form, useful_life: e.target.value })} placeholder="年" />
                </div>
                <div className="space-y-1">
                  <Label>償却方法</Label>
                  <Select value={form.depreciation_method} onValueChange={(v) => setForm({ ...form, depreciation_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="straight_line">定額法</SelectItem>
                      <SelectItem value="declining">定率法</SelectItem>
                      <SelectItem value="none">なし</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">状態</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>ステータス</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>コンディション</Label>
                  <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(conditionLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Lending (貸出系のみ) */}
            {form.item_type === "rental" && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="is_lendable"
                    checked={form.is_lendable}
                    onChange={(e) => setForm({ ...form, is_lendable: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="is_lendable" className="cursor-pointer">貸出可能</Label>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1">
              <Label>メモ</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="備考" />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handleSubmit} disabled={!form.name || saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editingId ? "更新" : "登録"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
