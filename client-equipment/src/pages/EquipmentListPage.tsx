import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Search, Package, Pencil, Trash2, Upload, Download,
} from "lucide-react";
import ExcelImportDialog from "@/components/ExcelImportDialog";

const TYPE_CODES = [
  { code: "V", label: "映像" },
  { code: "C", label: "カメラ" },
  { code: "A", label: "音声" },
  { code: "IC", label: "インカム" },
  { code: "NW", label: "ネットワーク" },
  { code: "L", label: "照明" },
  { code: "XR", label: "LED/XR" },
  { code: "E", label: "設備/その他" },
];
const SECTIONS = [
  { value: "system", label: "システム" },
  { value: "general", label: "汎用" },
  { value: "facility", label: "設備" },
];
const LOC_CODES = [
  { value: "Y", label: "用賀" },
  { value: "S", label: "渋谷" },
];

const sectionDisplay = (typeCode: string | null, section: string | null) => {
  const t = TYPE_CODES.find((c) => c.code === typeCode)?.label || "";
  const s = SECTIONS.find((c) => c.value === section)?.label || "";
  return `${t}${s}`.trim() || "-";
};

const defaultForm = {
  name: "", model_number: "", unit_number: "", serial_number: "",
  branch_code: "GMO-IG", fixed_asset_code: "", depreciation_years: "",
  equipment_section: "system", equipment_type_code: "V", location_code: "Y",
  manufacturer_id: "", purchased_at: "", warranty_years: "",
  location_id: "", status: "active", condition: "good", notes: "",
  // 旧フィールド (互換用)
  category_id: "", item_type: "facility", manufacturer: "",
};

export default function EquipmentListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterSection, setFilterSection] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });

  const downloadExcel = async () => {
    const res = await api.get('/equipment/items/export-xlsx', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `機材リスト_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Queries
  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["equipment-items", search, filterSection],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterSection) params.equipment_section = filterSection;
      return (await api.get("/equipment/items", { params })).data;
    },
  });
  const { data: locationsData } = useQuery({
    queryKey: ["equipment-locations"],
    queryFn: async () => (await api.get("/equipment/locations")).data.data,
  });
  const { data: manufacturersData } = useQuery({
    queryKey: ["equipment-manufacturers"],
    queryFn: async () => (await api.get("/equipment/manufacturers")).data.data,
  });

  const items: any[] = itemsData?.data ?? [];
  const locations: any[] = locationsData ?? [];
  const manufacturers: any[] = manufacturersData ?? [];

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId ? api.put(`/equipment/items/${editingId}`, payload) : api.post("/equipment/items", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      setDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-items"] }),
  });

  const openNew = () => { setForm({ ...defaultForm }); setEditingId(null); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setForm({
      name: item.name || "", model_number: item.model_number || "",
      unit_number: item.unit_number?.toString() || "", serial_number: item.serial_number || "",
      branch_code: item.branch_code || "GMO-IG", fixed_asset_code: item.fixed_asset_code || "",
      depreciation_years: item.depreciation_years?.toString() || "0",
      equipment_section: item.equipment_section || "system",
      equipment_type_code: item.equipment_type_code || "V",
      location_code: item.location_code || "Y",
      manufacturer_id: item.manufacturer_id || "",
      purchased_at: item.purchased_at?.slice(0, 10) || "",
      warranty_years: item.warranty_years?.toString() || "0",
      location_id: item.location_id || "", status: item.status || "active",
      condition: item.condition || "good", notes: item.notes || "",
      category_id: item.category_id || "", item_type: item.item_type || "facility",
      manufacturer: item.manufacturer || "",
    });
    setEditingId(item.id);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) return;
    saveMutation.mutate({
      ...form,
      unit_number: form.unit_number ? Number(form.unit_number) : null,
      depreciation_years: form.depreciation_years ? Number(form.depreciation_years) : 0,
      warranty_years: form.warranty_years ? Number(form.warranty_years) : 0,
      manufacturer_id: form.manufacturer_id || null,
      location_id: form.location_id || null,
      category_id: form.category_id || null,
    });
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="heading-page text-xl lg:text-2xl">機材一覧</h1>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />Excelインポート
          </Button>
          <Button size="sm" variant="outline" onClick={downloadExcel}>
            <Download className="h-4 w-4 mr-1" />Excel出力
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />機材登録
          </Button>
        </div>
      </div>

      <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="名前・ID・型番で検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterSection || "all"} onValueChange={(v) => setFilterSection(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="セクション" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Items — テーブル表示 (ユーザーExcel列順準拠) */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>機材が登録されていません</p>
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">販社</th>
                <th className="px-3 py-2 text-left font-medium">固定資産コード</th>
                <th className="px-3 py-2 text-left font-medium">償却</th>
                <th className="px-3 py-2 text-left font-medium">セクション</th>
                <th className="px-3 py-2 text-left font-medium">機材種類</th>
                <th className="px-3 py-2 text-left font-medium">メーカー</th>
                <th className="px-3 py-2 text-left font-medium">機材名</th>
                <th className="px-3 py-2 text-left font-medium">no</th>
                <th className="px-3 py-2 text-left font-medium">serial</th>
                <th className="px-3 py-2 text-left font-medium">設置場所</th>
                <th className="px-3 py-2 text-left font-medium">購入年月</th>
                <th className="px-3 py-2 text-left font-medium">保証</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-t hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/equipment/items/${item.id}`)}>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{item.eq_code}</td>
                  <td className="px-3 py-2 text-xs">{item.branch_code || '-'}</td>
                  <td className="px-3 py-2 text-xs font-mono">{item.fixed_asset_code || '-'}</td>
                  <td className="px-3 py-2 text-xs">{item.depreciation_years ?? '-'}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{sectionDisplay(item.equipment_type_code, item.equipment_section)}</td>
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2 text-xs">{item.manufacturer_name || item.manufacturer || '-'}</td>
                  <td className="px-3 py-2 text-xs">{item.model_number || '-'}</td>
                  <td className="px-3 py-2 text-xs">{item.unit_number || '-'}</td>
                  <td className="px-3 py-2 text-xs font-mono">{item.serial_number || '-'}</td>
                  <td className="px-3 py-2 text-xs">{item.location_name || '-'}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{item.purchased_at?.slice(0, 10) || '-'}</td>
                  <td className="px-3 py-2 text-xs">{item.warranty_years ? `${item.warranty_years}年` : '-'}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(`「${item.name}」を削除？`)) deleteMutation.mutate(item.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog — ユーザーExcel列順 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "機材編集" : "機材登録"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* 基本 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>拠点 *</Label>
                <Select value={form.location_code} onValueChange={(v) => setForm({ ...form, location_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOC_CODES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>種別コード *</Label>
                <Select value={form.equipment_type_code} onValueChange={(v) => setForm({ ...form, equipment_type_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} - {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>セクション *</Label>
                <Select value={form.equipment_section} onValueChange={(v) => setForm({ ...form, equipment_section: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>機材種類 (名前) *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ユニバーサルフレーム" />
              </div>
              <div className="space-y-1">
                <Label>メーカー</Label>
                <Select value={form.manufacturer_id || "none"} onValueChange={(v) => setForm({ ...form, manufacturer_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>機材名 (型番)</Label>
                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} placeholder="Vbus-70V2" />
              </div>
              <div className="space-y-1">
                <Label>no (個体番号)</Label>
                <Input type="number" min="1" value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>serial</Label>
                <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
              </div>
            </div>

            {/* 資産・保証 */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">資産・保証</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>販社</Label>
                  <Input value={form.branch_code} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} placeholder="GMO-IG" />
                </div>
                <div className="space-y-1">
                  <Label>固定資産コード</Label>
                  <Input value={form.fixed_asset_code} onChange={(e) => setForm({ ...form, fixed_asset_code: e.target.value })} placeholder="消耗品は空欄" />
                </div>
                <div className="space-y-1">
                  <Label>償却年数</Label>
                  <Input type="number" min="0" value={form.depreciation_years} onChange={(e) => setForm({ ...form, depreciation_years: e.target.value })} placeholder="消耗品は0" />
                </div>
                <div className="space-y-1">
                  <Label>購入年月</Label>
                  <Input type="date" value={form.purchased_at} onChange={(e) => setForm({ ...form, purchased_at: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>保証期間 (年)</Label>
                  <Input type="number" min="0" value={form.warranty_years} onChange={(e) => setForm({ ...form, warranty_years: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>設置場所</Label>
                  <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">なし</SelectItem>
                      {locations.map((loc: any) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 備考 */}
            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handleSubmit} disabled={saveMutation.isPending || !form.name}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? "更新" : "登録"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
