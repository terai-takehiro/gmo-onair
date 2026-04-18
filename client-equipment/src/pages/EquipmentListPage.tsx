import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
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
  Loader2, Plus, Search, Package, Pencil, Trash2, Upload, Download, Edit3, X,
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
const ASSET_CLASS_OPTIONS = [
  { value: "fixed_asset", label: "固定資産" },
  { value: "consumable",  label: "消耗品" },
  { value: "leased",      label: "リース" },
  { value: "transferred", label: "譲渡" },
];
const ASSET_CLASS_LABELS: Record<string, string> = {
  fixed_asset: "固定資産", consumable: "消耗品", leased: "リース", transferred: "譲渡",
};
const SECTIONS = [
  { value: "equipment", label: "設備" },
  { value: "rental", label: "貸出" },
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
  branch_code: "GMO-IG", asset_class: "fixed_asset", fixed_asset_code: "", depreciation_years: "",
  equipment_section: "equipment", equipment_type_code: "V", location_code: "Y",
  manufacturer_id: "", purchased_at: "", warranty_years: "",
  location_id: "", status: "active", condition: "good", notes: "",
  parent_id: "",
};

type BulkField = 'branch_code' | 'asset_class' | 'equipment_section' | 'equipment_type_code' | 'location_id' | 'purchased_at' | 'warranty_years' | 'depreciation_years' | 'status' | 'notes' | 'name' | 'manufacturer_id' | 'model_number';

export default function EquipmentListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const canBulkEdit = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'system_admin') return true;
    const lvl = currentUser.permissions?.equipment;
    return lvl === 'manager' || lvl === 'owner';
  }, [currentUser]);
  const [search, setSearch] = useState("");
  const [filterBlock, setFilterBlock] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState<BulkField>('branch_code');
  const [bulkValue, setBulkValue] = useState<string>('');

  const downloadExcel = async () => {
    const res = await api.get('/equipment/items/export-xlsx', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `機材リスト_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["equipment-items", search, filterBlock],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterBlock) params.equipment_type_code = filterBlock;
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

  const rawItems: any[] = itemsData?.data ?? [];
  const locations: any[] = locationsData ?? [];
  const manufacturers: any[] = manufacturersData ?? [];

  // カラムソート (リロードでリセット、null ならサーバー既定順)
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const onSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); return; }
    if (sortDir === 'asc') { setSortDir('desc'); return; }
    setSortKey(null); // 3クリック目で既定に戻す
  };
  const items = useMemo(() => {
    if (!sortKey) return rawItems;
    const copy = [...rawItems];
    copy.sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      const aNull = av == null || av === '';
      const bNull = bv == null || bv === '';
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av); const bs = String(bv);
      const cmp = as.localeCompare(bs, 'ja');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rawItems, sortKey, sortDir]);

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

  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: { ids: string[]; fields: Record<string, unknown> }) =>
      api.put('/equipment/items/bulk-update', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-items'] });
      setBulkOpen(false);
      setSelectedIds(new Set());
      setBulkValue('');
    },
  });

  const handleCheckboxClick = (id: string, index: number, shiftKey: boolean) => {
    if (shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeIds = items.slice(start, end + 1).map((it: any) => it.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((rid: string) => next.add(rid));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastSelectedIndex(index);
    }
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((it: any) => it.id)));
  };
  const clearSelection = () => { setSelectedIds(new Set()); setLastSelectedIndex(null); };

  const submitBulk = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !bulkField) return;
    let v: unknown = bulkValue;
    if (bulkField === 'warranty_years' || bulkField === 'depreciation_years') {
      v = bulkValue === '' ? null : Number(bulkValue);
    }
    if ((bulkField === 'location_id' || bulkField === 'manufacturer_id') && bulkValue === 'none') v = null;
    bulkUpdateMutation.mutate({ ids, fields: { [bulkField]: v } });
  };

  const openNew = () => { setForm({ ...defaultForm }); setEditingId(null); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setForm({
      name: item.name || "", model_number: item.model_number || "",
      unit_number: item.unit_number?.toString() || "", serial_number: item.serial_number || "",
      branch_code: item.branch_code || "GMO-IG", asset_class: item.asset_class || "fixed_asset",
      fixed_asset_code: item.fixed_asset_code || "",
      depreciation_years: item.depreciation_years?.toString() || "0",
      equipment_section: item.equipment_section || "equipment",
      equipment_type_code: item.equipment_type_code || "V",
      location_code: item.location_code || "Y",
      manufacturer_id: item.manufacturer_id || "",
      purchased_at: item.purchased_at?.slice(0, 10) || "",
      warranty_years: item.warranty_years?.toString() || "0",
      location_id: item.location_id || "", status: item.status || "active",
      condition: item.condition || "good", notes: item.notes || "",
      parent_id: item.parent_id || "",
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
      parent_id: form.parent_id || null,
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

      {/* 機材ブロックタブ（最優先フィルター） */}
      <div className="flex flex-wrap gap-1.5">
        {[{ code: "", label: "全て" }, ...TYPE_CODES].map((t) => (
          <button
            key={t.code}
            onClick={() => setFilterBlock(t.code)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterBlock === t.code
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 検索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="名前・ID・型番で検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* 一括編集バー (管理者のみ表示、選択中にのみ浮上) */}
      {canBulkEdit && selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 bg-primary text-primary-foreground rounded-lg px-4 py-2 flex items-center justify-between shadow-md">
          <span className="text-sm font-medium">{selectedIds.size} 件選択中</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
              <Edit3 className="h-4 w-4 mr-1" />一括編集
            </Button>
            <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" />選択解除
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>機材が登録されていません</p>
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="text-sm" style={{ tableLayout: 'auto' }}>
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
              <tr>
                {canBulkEdit && (
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={items.length > 0 && selectedIds.size === items.length}
                      ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <SortableTh label="ID" sortKey="eq_code" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="所管" sortKey="branch_code" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="資産管理" sortKey="asset_class" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="資産コード" sortKey="fixed_asset_code" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="償却" sortKey="depreciation_years" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="設備/貸出" sortKey="equipment_type_code" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="商品名" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="メーカー" sortKey="manufacturer_name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="型名" sortKey="model_number" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="No" sortKey="unit_number" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="シリアル" sortKey="serial_number" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="設置場所" sortKey="location_name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="購入年月" sortKey="purchased_at" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableTh label="保証" sortKey="warranty_years" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                <th className="px-2 py-2 text-right font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => (
                <tr key={item.id} className={`border-t hover:bg-muted/50 cursor-pointer ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`} onClick={() => navigate(`/equipment/items/${item.id}`)}>
                  {canBulkEdit && (
                    <td className="px-2 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={selectedIds.has(item.id)}
                        onChange={() => {}}
                        onClick={(e) => handleCheckboxClick(item.id, idx, e.shiftKey)}
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{item.eq_code}</td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{item.branch_code || '-'}</td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{ASSET_CLASS_LABELS[item.asset_class] || item.asset_class || '-'}</td>
                  <td className="px-2 py-1.5 text-xs font-mono whitespace-nowrap">{item.fixed_asset_code || '-'}</td>
                  <td className="px-2 py-1.5 text-xs text-right tabular-nums whitespace-nowrap">{item.depreciation_years ?? '-'}</td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{sectionDisplay(item.equipment_type_code, item.equipment_section)}</td>
                  <td className="px-2 py-1.5 font-medium">{item.name}</td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{item.manufacturer_name || '-'}</td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{item.model_number || '-'}</td>
                  <td className="px-2 py-1.5 text-xs text-right tabular-nums whitespace-nowrap">{item.unit_number || '-'}</td>
                  <td className="px-2 py-1.5 text-xs font-mono whitespace-nowrap">{item.serial_number || '-'}</td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{item.location_name || '-'}</td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{item.purchased_at?.slice(0, 10) || '-'}</td>
                  <td className="px-2 py-1.5 text-xs text-right tabular-nums whitespace-nowrap">{item.warranty_years ? `${item.warranty_years}年` : '-'}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-0.5 justify-end">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "機材編集" : "機材登録"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
                <Label>設備/貸出 *</Label>
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
                <Label>商品名 *</Label>
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
                <Label>型名</Label>
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

            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">資産・保証</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>所管</Label>
                  <Input value={form.branch_code} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} placeholder="GMO-IG" />
                </div>
                <div className="space-y-1">
                  <Label>資産管理</Label>
                  <Select value={form.asset_class} onValueChange={(v) => setForm({ ...form, asset_class: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSET_CLASS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>資産コード</Label>
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

            <div className="border-t pt-4">
              <div className="space-y-1">
                <Label>親機材（付属先）</Label>
                <Select
                  value={form.parent_id || "none"}
                  onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="選択なし（単体）" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">選択なし（単体）</SelectItem>
                    {items
                      .filter((it: any) => it.id !== editingId)
                      .map((it: any) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.eq_code} — {it.name}{it.model_number ? ` (${it.model_number})` : ""}{it.unit_number ? ` No.${it.unit_number}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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

      {/* 一括編集ダイアログ */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>一括編集 ({selectedIds.size} 件)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>編集するフィールド</Label>
              <Select value={bulkField} onValueChange={(v) => { setBulkField(v as BulkField); setBulkValue(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">商品名</SelectItem>
                  <SelectItem value="manufacturer_id">メーカー</SelectItem>
                  <SelectItem value="model_number">型名</SelectItem>
                  <SelectItem value="branch_code">所管</SelectItem>
                  <SelectItem value="asset_class">資産管理</SelectItem>
                  <SelectItem value="equipment_section">設備/貸出</SelectItem>
                  <SelectItem value="equipment_type_code">種別コード</SelectItem>
                  <SelectItem value="location_id">設置場所</SelectItem>
                  <SelectItem value="purchased_at">購入年月</SelectItem>
                  <SelectItem value="warranty_years">保証期間 (年)</SelectItem>
                  <SelectItem value="depreciation_years">償却年数</SelectItem>
                  <SelectItem value="status">ステータス</SelectItem>
                  <SelectItem value="notes">備考</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>新しい値</Label>
              {bulkField === 'name' || bulkField === 'model_number' ? (
                <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkField === 'name' ? '商品名' : '型名'} />
              ) : bulkField === 'manufacturer_id' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(なし)</SelectItem>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : bulkField === 'asset_class' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{ASSET_CLASS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : bulkField === 'equipment_section' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : bulkField === 'equipment_type_code' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} - {t.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : bulkField === 'location_id' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(なし)</SelectItem>
                    {locations.map((loc: any) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : bulkField === 'status' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">稼働中</SelectItem>
                    <SelectItem value="in_repair">修理中</SelectItem>
                    <SelectItem value="retired">引退</SelectItem>
                    <SelectItem value="disposed">廃棄</SelectItem>
                    <SelectItem value="lost">紛失</SelectItem>
                  </SelectContent>
                </Select>
              ) : bulkField === 'purchased_at' ? (
                <Input type="date" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
              ) : bulkField === 'warranty_years' || bulkField === 'depreciation_years' ? (
                <Input type="number" min="0" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="0" />
              ) : (
                <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkField === 'branch_code' ? 'GMO-IG' : ''} />
              )}
            </div>

            {bulkUpdateMutation.error ? (
              <p className="text-sm text-destructive">
                {(bulkUpdateMutation.error as any)?.response?.data?.error?.message || (bulkUpdateMutation.error as Error).message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkOpen(false)}>キャンセル</Button>
              <Button onClick={submitBulk} disabled={bulkUpdateMutation.isPending || bulkValue === ''}>
                {bulkUpdateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {selectedIds.size} 件に適用
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableTh({ label, sortKey, currentKey, currentDir, onSort }: {
  label: string; sortKey: string; currentKey: string | null; currentDir: 'asc' | 'desc'; onSort: (k: string) => void;
}) {
  const active = currentKey === sortKey;
  const arrow = active ? (currentDir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th className="px-2 py-2 text-left font-medium select-none whitespace-nowrap">
      <button
        className={`inline-flex items-center gap-0.5 hover:text-foreground transition-colors ${active ? 'text-foreground' : ''}`}
        onClick={() => onSort(sortKey)}
      >
        {label}{arrow}
      </button>
    </th>
  );
}
