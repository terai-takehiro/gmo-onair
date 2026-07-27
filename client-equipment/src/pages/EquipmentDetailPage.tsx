import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@gmo-onair/shared/src/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedCheckbox } from "@gmo-onair/shared/src/client/ui/enhanced-checkbox";
import {
  ArrowLeft, Copy, Loader2, Wrench, ArrowRightLeft, Package, QrCode, Printer, Link2, X, ChevronDown, Search, Pencil, Plus, LayoutList,
} from "lucide-react";
import BranchCodeInput from "@/components/ui/BranchCodeInput";
import {
  EQUIPMENT_STATUS,
  EQUIPMENT_CONDITION,
  MAINTENANCE_STATUS,
  MAINTENANCE_TYPE,
  statusOf,
} from "@gmo-onair/shared/src/constants/statuses";
import { useState, useRef, useEffect } from "react";
import { type CustomColumn } from "@/components/CustomColumnDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  TYPE_CODES, ASSET_CLASS_OPTIONS, ASSET_CLASS_LABELS, SECTIONS, LOC_CODES,
  RACK_SLOT_OPTIONS, STATUS_OPTIONS, CONDITION_OPTIONS, TYPE_LABELS, SECTION_LABELS,
} from "@/lib/constants";
import { Delayed, EmptyState, SkeletonCard } from '@gmo-onair/shared/src/client/states';

// ステータス定義は shared/src/constants/statuses.ts に一元化済み (v2.4.0)
// EQUIPMENT_STATUS / EQUIPMENT_CONDITION / MAINTENANCE_STATUS / MAINTENANCE_TYPE を使用。
// 旧 statusColors (bg-*-100 text-*-800) は Badge variant へ自動変換されるため別定義不要。

function sectionLabel(typeCode: string | null, section: string | null) {
  return `${TYPE_LABELS[typeCode || ''] || ''}${SECTION_LABELS[section || ''] || ''}` || '-';
}

export default function EquipmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'system_admin';
  const [qrOpen, setQrOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [suggestItems, setSuggestItems] = useState<any[]>([]);
  const [suggestTimer, setSuggestTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleNameChange = (val: string) => {
    setEditForm(f => ({ ...f, name: val }));
    if (suggestTimer) clearTimeout(suggestTimer);
    if (!val.trim()) { setSuggestItems([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/equipment/items', { params: { search: val, include_children: '1' } });
        const found: any[] = res.data.data ?? [];
        const exact = found.filter((i: any) => i.name.toLowerCase() === val.toLowerCase());
        if (exact.length > 0) {
          const models = [...new Set(exact.map((i: any) => i.model_number ?? ''))];
          if (models.length === 1) {
            setEditForm(f => ({
              ...f,
              name: val,
              model_number: f.model_number || exact[0].model_number || '',
              manufacturer_id: f.manufacturer_id || exact[0].manufacturer_id || '',
            }));
            setSuggestItems([]);
          } else {
            setSuggestItems(exact);
          }
        } else {
          setSuggestItems([]);
        }
      } catch { setSuggestItems([]); }
    }, 400);
    setSuggestTimer(t);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-item", id],
    queryFn: async () => (await api.get(`/equipment/items/${id}`)).data.data,
    enabled: !!id,
  });

  const { data: allItemsData } = useQuery({
    queryKey: ["equipment-items-all"],
    queryFn: async () => (await api.get("/equipment/items")).data.data,
  });
  const { data: locationsData } = useQuery({
    queryKey: ["equipment-locations"],
    queryFn: async () => (await api.get("/equipment/locations")).data.data,
  });
  const { data: manufacturersData } = useQuery({
    queryKey: ["equipment-manufacturers"],
    queryFn: async () => (await api.get("/equipment/manufacturers")).data.data,
  });
  const { data: colorsData } = useQuery({
    queryKey: ["equipment-colors"],
    queryFn: async () => (await api.get("/equipment/colors")).data.data,
  });
  const { data: rentalCategoriesData } = useQuery({
    queryKey: ["rental-categories"],
    queryFn: async () => (await api.get("/equipment/rental-categories")).data.data,
    enabled: editOpen,
  });
  const allItems: any[] = allItemsData ?? [];
  const locations: any[] = locationsData ?? [];
  const manufacturers: any[] = manufacturersData ?? [];
  const colors: any[] = colorsData ?? [];
  const rentalCategories: any[] = rentalCategoriesData ?? [];

  // 共有カスタム列
  const { data: customColumnsData } = useQuery<CustomColumn[]>({
    queryKey: ["equipment-custom-columns"],
    queryFn: async () => (await api.get("/equipment/custom-columns")).data.data,
  });
  const sharedColumns: CustomColumn[] = (customColumnsData ?? []).filter(c => c.scope === 'shared');

  const { data: customValuesData } = useQuery({
    queryKey: ["equipment-custom-values", id],
    queryFn: async () => (await api.get('/equipment/custom-values', { params: { equipment_ids: id } })).data.data,
    enabled: !!id && sharedColumns.length > 0,
  });
  const customValueMap: Record<string, string> = {};
  for (const row of (customValuesData ?? [])) {
    customValueMap[row.column_id] = row.value ?? '';
  }

  const [editingCustomCell, setEditingCustomCell] = useState<string | null>(null); // columnId
  const customValueMutation = useMutation({
    mutationFn: ({ columnId, value }: { columnId: string; value: string }) =>
      api.put(`/equipment/custom-values/${columnId}/${id}`, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment-custom-values', id] }),
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: any) => api.patch(`/equipment/items/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      setSaveError(null);
      setEditOpen(false);
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.error?.message || err?.message || '更新に失敗しました');
    },
  });

  const openEdit = () => {
    if (!data) return;
    setEditForm({
      eq_code: data.eq_code || "",
      name: data.name || "", model_number: data.model_number || "",
      unit_number: data.unit_number?.toString() || "", serial_number: data.serial_number || "",
      branch_code: data.branch_code || "GMO-IG", asset_class: data.asset_class || "fixed_asset",
      fixed_asset_code: data.fixed_asset_code || "",
      depreciation_years: data.depreciation_years?.toString() || "0",
      equipment_section: data.equipment_section || "equipment",
      equipment_type_code: data.equipment_type_code || "V",
      location_code: data.location_code || "Y",
      manufacturer_id: data.manufacturer_id || "",
      purchased_at: data.purchased_at?.slice(0, 10) || "",
      warranty_years: data.warranty_years?.toString() || "0",
      location_id: data.location_id || "",
      status: data.status || "active", condition: data.condition || "good", notes: data.notes || "",
      color_id: data.color_id || "",
      rack_position: data.rack_position?.toString() || "",
      rack_height: data.rack_height?.toString() || "1",
      rack_slot: data.rack_slot || "full",
      rack_side: data.rack_side || "front",
      rental_category_id: data.rental_category_id || "",
      rental_display_name: data.rental_display_name || "",
    });
    setEditOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editForm.name) return;
    const selLoc = locations.find((l: any) => l.id === editForm.location_id);
    const payload: Record<string, unknown> = {
      ...editForm,
      unit_number: editForm.unit_number ? Number(editForm.unit_number) : null,
      depreciation_years: editForm.depreciation_years ? Number(editForm.depreciation_years) : null,
      warranty_years: editForm.warranty_years ? Number(editForm.warranty_years) : null,
      manufacturer_id: editForm.manufacturer_id || null,
      location_id: editForm.location_id || null,
      purchased_at: editForm.purchased_at || null,
      fixed_asset_code: editForm.fixed_asset_code || null,
      color_id: editForm.color_id || null,
      rack_position: selLoc?.is_rack && editForm.rack_position ? Number(editForm.rack_position) : null,
      rack_height: selLoc?.is_rack ? (Number(editForm.rack_height) || 1) : 1,
      rack_slot: selLoc?.is_rack ? (editForm.rack_slot || 'full') : 'full',
      rack_side: selLoc?.is_rack ? (editForm.rack_side || 'front') : 'front',
    };
    if (!isAdmin) delete payload.eq_code;
    saveMutation.mutate(payload);
  };

  const attachMutation = useMutation({
    mutationFn: (childId: string) => api.patch(`/equipment/items/${childId}`, { parent_id: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      qc.invalidateQueries({ queryKey: ["equipment-items-all"] });
      setSelectedChildId("");
    },
  });

  const detachMutation = useMutation({
    mutationFn: (childId: string) => api.patch(`/equipment/items/${childId}`, { parent_id: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      qc.invalidateQueries({ queryKey: ["equipment-items-all"] });
    },
  });

  const [newChildOpen, setNewChildOpen] = useState(false);
  const [newChildForm, setNewChildForm] = useState<Record<string, string>>({});
  const [createChildError, setCreateChildError] = useState<string | null>(null);
  const createChildMutation = useMutation({
    mutationFn: (payload: any) => api.post('/equipment/items', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      qc.invalidateQueries({ queryKey: ["equipment-items-all"] });
      setCreateChildError(null);
      setNewChildOpen(false);
    },
    onError: (err: any) => {
      setCreateChildError(err?.response?.data?.error?.message || err?.message || '登録に失敗しました');
    },
  });
  const openNewChild = (copyFrom?: any) => {
    if (!data) return;
    if (copyFrom) {
      // 同名・同型のうち最大 unit_number を探して +1
      const siblings: any[] = data.children ?? [];
      const sameModel = siblings.filter(
        (s: any) => s.name === copyFrom.name && (s.model_number ?? "") === (copyFrom.model_number ?? "")
      );
      const maxNo = sameModel.reduce((m: number, s: any) => Math.max(m, Number(s.unit_number) || 0), Number(copyFrom.unit_number) || 0);
      setNewChildForm({
        name: copyFrom.name || "",
        model_number: copyFrom.model_number || "",
        unit_number: String(maxNo + 1),
        serial_number: "",  // S/N は個体固有なのでクリア
        branch_code: copyFrom.branch_code || data.branch_code || "GMO-IG",
        asset_class: copyFrom.asset_class || data.asset_class || "fixed_asset",
        fixed_asset_code: "",  // 資産コードも個体固有
        depreciation_years: copyFrom.depreciation_years?.toString() || "0",
        equipment_section: copyFrom.equipment_section || data.equipment_section || "equipment",
        equipment_type_code: copyFrom.equipment_type_code || data.equipment_type_code || "V",
        location_code: copyFrom.location_code || data.location_code || "Y",
        manufacturer_id: copyFrom.manufacturer_id || data.manufacturer_id || "",
        purchased_at: copyFrom.purchased_at?.slice(0, 10) || "",
        warranty_years: copyFrom.warranty_years?.toString() || "0",
        location_id: copyFrom.location_id || data.location_id || "",
        status: copyFrom.status || "active",
        condition: copyFrom.condition || "good",
        notes: copyFrom.notes || "",
      });
    } else {
      setNewChildForm({
        name: "", model_number: "", unit_number: "", serial_number: "",
        branch_code: data.branch_code || "GMO-IG",
        asset_class: data.asset_class || "fixed_asset",
        fixed_asset_code: "",
        depreciation_years: "0",
        equipment_section: data.equipment_section || "equipment",
        equipment_type_code: data.equipment_type_code || "V",
        location_code: data.location_code || "Y",
        manufacturer_id: data.manufacturer_id || "",
        purchased_at: "", warranty_years: "0",
        location_id: data.location_id || "",
        status: "active", condition: "good", notes: "",
      });
    }
    setNewChildOpen(true);
  };
  const handleCreateChild = () => {
    if (!newChildForm.name) return;
    createChildMutation.mutate({
      ...newChildForm,
      parent_id: id,
      unit_number: newChildForm.unit_number ? Number(newChildForm.unit_number) : null,
      depreciation_years: newChildForm.depreciation_years ? Number(newChildForm.depreciation_years) : null,
      warranty_years: newChildForm.warranty_years ? Number(newChildForm.warranty_years) : null,
      manufacturer_id: newChildForm.manufacturer_id || null,
      location_id: newChildForm.location_id || null,
      purchased_at: newChildForm.purchased_at || null,
      fixed_asset_code: newChildForm.fixed_asset_code || null,
    });
  };

  if (isLoading) {
    return (
      <Delayed><SkeletonCard lines={6} /></Delayed>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="この機材は見つかりませんでした"
        description="削除された可能性があります。機材一覧から選び直してください。"
      />
    );
  }

  const item = data;

  const copyEqCode = () => {
    navigator.clipboard.writeText(item.eq_code);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/equipment/items")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusOf(EQUIPMENT_STATUS, item.status).variant}>
              {statusOf(EQUIPMENT_STATUS, item.status).label}
            </Badge>
            <Badge variant="outline">{item.equipment_section === "rental" ? "貸出" : "設備"}</Badge>
            {item.rental_category_name && (
              <Badge variant="secondary" className="text-xs">{item.rental_category_name}</Badge>
            )}
          </div>
          <h1 className="heading-page text-xl mt-1">
            {item.rental_display_name || item.name}
            {item.rental_display_name && item.rental_display_name !== item.name && (
              <span className="text-sm text-muted-foreground font-normal ml-1">({item.name})</span>
            )}
            {item.model_number && <span className="text-muted-foreground font-normal ml-2">({item.model_number})</span>}
            {item.unit_number && <span className="text-primary ml-2">No.{item.unit_number}</span>}
          </h1>
          <button
            onClick={copyEqCode}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
            title="IDをコピー"
          >
            <QrCode className="h-3 w-3" />
            {item.eq_code}
            <Copy className="h-2.5 w-2.5 opacity-40" />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="h-4 w-4 mr-1" />
          編集
        </Button>
        <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
          <Printer className="h-4 w-4 mr-1" />
          QRコード
        </Button>
      </div>

      {/* QRコード表示・印刷ダイアログ */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QRコード — {item.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <img
              src={`/api/v1/internal/equipment/items/${id}/qr`}
              alt="QRコード"
              className="w-56 h-56 border rounded bg-white p-2"
            />
            <p className=" text-sm">{item.eq_code}</p>
            <p className="text-xs text-muted-foreground text-center">{item.name}</p>
            <Button onClick={() => window.print()} className="w-full">
              <Printer className="h-4 w-4 mr-1" />
              印刷
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>機材編集</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {isAdmin && (
              <div className="space-y-1 rounded-lg border border-warning bg-warning-surface p-3">
                <Label className="text-warning-strong font-semibold">機材ID (管理者のみ変更可)</Label>
                <Input
                  value={editForm.eq_code || ""}
                  onChange={(e) => setEditForm({ ...editForm, eq_code: e.target.value })}
                  className=""
                  placeholder="Y-V-000001"
                />
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>拠点 *</Label>
                <Select value={editForm.location_code} onValueChange={(v) => setEditForm({ ...editForm, location_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LOC_CODES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>種別コード *</Label>
                <Select value={editForm.equipment_type_code} onValueChange={(v) => setEditForm({ ...editForm, equipment_type_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} - {t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>設備/貸出 *</Label>
                <Select value={editForm.equipment_section} onValueChange={(v) => setEditForm({ ...editForm, equipment_section: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>商品名 *</Label>
                <div className="relative">
                  <Input
                    value={editForm.name || ""}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onBlur={() => setTimeout(() => setSuggestItems([]), 200)}
                    autoComplete="off"
                  />
                  {suggestItems.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 bg-card border rounded-md shadow-lg mt-0.5">
                      <p className="px-3 py-1.5 text-xs text-muted-foreground border-b">同名の型名が複数あります。選択してください</p>
                      {Array.from(
                        new Map(suggestItems.map((i: any) => [i.model_number ?? '', i])).values()
                      ).map((item: any) => (
                        <button
                          key={item.model_number ?? 'none'}
                          type="button"
                          className="h-ctl-3 w-full text-left px-3 text-sm hover:bg-muted flex items-center gap-2"
                          onMouseDown={() => {
                            setEditForm(f => ({
                              ...f,
                              model_number: item.model_number || f.model_number,
                              manufacturer_id: item.manufacturer_id || f.manufacturer_id,
                            }));
                            setSuggestItems([]);
                          }}
                        >
                          <span className="font-medium">{item.model_number || '（型名なし）'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label>メーカー</Label>
                <Select value={editForm.manufacturer_id || "none"} onValueChange={(v) => setEditForm({ ...editForm, manufacturer_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>型名</Label>
                <Input value={editForm.model_number} onChange={(e) => setEditForm({ ...editForm, model_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>No (個体番号)</Label>
                <Input type="number" min="1" value={editForm.unit_number} onChange={(e) => setEditForm({ ...editForm, unit_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>シリアル</Label>
                <Input value={editForm.serial_number} onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })} />
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">資産・保証</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>所管</Label>
                  <BranchCodeInput value={editForm.branch_code} onChange={(v) => setEditForm({ ...editForm, branch_code: v })} />
                </div>
                <div className="space-y-1">
                  <Label>資産管理</Label>
                  <Select value={editForm.asset_class} onValueChange={(v) => setEditForm({ ...editForm, asset_class: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ASSET_CLASS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>資産コード</Label>
                  <Input value={editForm.fixed_asset_code} onChange={(e) => setEditForm({ ...editForm, fixed_asset_code: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>償却年数</Label>
                  <Input type="number" min="0" value={editForm.depreciation_years} onChange={(e) => setEditForm({ ...editForm, depreciation_years: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>購入年月</Label>
                  <Input type="date" value={editForm.purchased_at} onChange={(e) => setEditForm({ ...editForm, purchased_at: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>保証期間 (年)</Label>
                  <Input type="number" min="0" value={editForm.warranty_years} onChange={(e) => setEditForm({ ...editForm, warranty_years: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>設置場所</Label>
                  <Select value={editForm.location_id || "none"} onValueChange={(v) => setEditForm({ ...editForm, location_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">なし</SelectItem>
                      {locations.map((loc: any) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>ステータス</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>コンディション</Label>
                  <Select value={editForm.condition} onValueChange={(v) => setEditForm({ ...editForm, condition: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {/* 色選択 */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">機材色</p>
              <Select value={editForm.color_id || "none"} onValueChange={(v) => setEditForm({ ...editForm, color_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="なし（種別色）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし（種別色）</SelectItem>
                  {colors.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full border border-border/40" style={{ background: c.color_hex }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ラック実装フィールド */}
            {(() => {
              const selLoc = locations.find((l: any) => l.id === editForm.location_id);
              if (!selLoc?.is_rack) return null;
              return (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-3">ラック実装</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>U位置 (下端)</Label>
                      <Input
                        type="number" min={1} max={selLoc.rack_units || 99}
                        value={editForm.rack_position || ""}
                        onChange={(e) => setEditForm({ ...editForm, rack_position: e.target.value })}
                        placeholder="1〜"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>高さ (U)</Label>
                      <Input
                        type="number" min={1}
                        value={editForm.rack_height || "1"}
                        onChange={(e) => setEditForm({ ...editForm, rack_height: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>横位置</Label>
                      <Select value={editForm.rack_slot || "full"} onValueChange={(v) => setEditForm({ ...editForm, rack_slot: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RACK_SLOT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>面</Label>
                      <Select value={editForm.rack_side || "front"} onValueChange={(v) => setEditForm({ ...editForm, rack_side: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="front">前面</SelectItem>
                          <SelectItem value="back">背面</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>

            {/* 貸出設定 */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">貸出一覧設定</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>貸出カテゴリ</Label>
                  <Select
                    value={editForm.rental_category_id || "none"}
                    onValueChange={(v) => setEditForm({ ...editForm, rental_category_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="なし" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">なし</SelectItem>
                      {rentalCategories.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>貸出表示名</Label>
                  <Input
                    value={editForm.rental_display_name}
                    onChange={(e) => setEditForm({ ...editForm, rental_display_name: e.target.value })}
                    placeholder={editForm.name || "商品名と同じ場合は空欄"}
                  />
                </div>
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">{saveError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setEditOpen(false); setSaveError(null); }}>キャンセル</Button>
              <Button onClick={handleEditSubmit} disabled={saveMutation.isPending || !editForm.name}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                更新
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新規子機材登録ダイアログ */}
      <Dialog open={newChildOpen} onOpenChange={setNewChildOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>子機材を新規登録</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>拠点 *</Label>
                <Select value={newChildForm.location_code} onValueChange={(v) => setNewChildForm({ ...newChildForm, location_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LOC_CODES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>種別コード *</Label>
                <Select value={newChildForm.equipment_type_code} onValueChange={(v) => setNewChildForm({ ...newChildForm, equipment_type_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} - {t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>設備/貸出 *</Label>
                <Select value={newChildForm.equipment_section} onValueChange={(v) => setNewChildForm({ ...newChildForm, equipment_section: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>商品名 *</Label>
                <Input value={newChildForm.name} onChange={(e) => setNewChildForm({ ...newChildForm, name: e.target.value })} placeholder="ケーブル等" />
              </div>
              <div className="space-y-1">
                <Label>メーカー</Label>
                <Select value={newChildForm.manufacturer_id || "none"} onValueChange={(v) => setNewChildForm({ ...newChildForm, manufacturer_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>型名</Label>
                <Input value={newChildForm.model_number} onChange={(e) => setNewChildForm({ ...newChildForm, model_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>No (個体番号)</Label>
                <Input type="number" min="1" value={newChildForm.unit_number} onChange={(e) => setNewChildForm({ ...newChildForm, unit_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>シリアル</Label>
                <Input value={newChildForm.serial_number} onChange={(e) => setNewChildForm({ ...newChildForm, serial_number: e.target.value })} />
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>所管</Label>
                <BranchCodeInput value={newChildForm.branch_code} onChange={(v) => setNewChildForm({ ...newChildForm, branch_code: v })} />
              </div>
              <div className="space-y-1">
                <Label>資産管理</Label>
                <Select value={newChildForm.asset_class} onValueChange={(v) => setNewChildForm({ ...newChildForm, asset_class: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_CLASS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>購入年月</Label>
                <Input type="date" value={newChildForm.purchased_at} onChange={(e) => setNewChildForm({ ...newChildForm, purchased_at: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={newChildForm.notes} onChange={(e) => setNewChildForm({ ...newChildForm, notes: e.target.value })} />
            </div>
            {createChildError && (
              <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">{createChildError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setNewChildOpen(false); setCreateChildError(null); }}>キャンセル</Button>
              <Button onClick={handleCreateChild} disabled={createChildMutation.isPending || !newChildForm.name}>
                {createChildMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                登録
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 基本情報 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              基本情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {item.branch_code && <InfoRow label="所管" value={item.branch_code} />}
            <InfoRow label="資産管理" value={ASSET_CLASS_LABELS[item.asset_class] || item.asset_class} />
            <InfoRow label="設備/貸出" value={sectionLabel(item.equipment_type_code, item.equipment_section)} />
            <InfoRow label="メーカー" value={item.manufacturer_name} />
            <InfoRow label="機材名 (型番)" value={item.model_number} />
            <InfoRow label="シリアルNo" value={item.serial_number} />
            <InfoRow label="設置場所" value={item.location_name || item.location_detail} />
            <InfoRow label="コンディション" value={statusOf(EQUIPMENT_CONDITION, item.condition).label} />
            {item.notes && <InfoRow label="備考" value={item.notes} />}
          </CardContent>
        </Card>

        {/* Asset info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">資産情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="資産コード" value={item.fixed_asset_code || '(消耗品)'} />
            <InfoRow label="償却年数" value={item.depreciation_years != null ? `${item.depreciation_years}年` : null} />
            <InfoRow label="購入年月" value={item.purchased_at?.slice(0, 10)} />
            <InfoRow label="保証期間" value={item.warranty_years ? `${item.warranty_years}年` : null} />
            <InfoRow label="保証終了" value={item.warranty_end?.slice(0, 10)} />
          </CardContent>
        </Card>

        {/* Lending history (rental only) */}
        {item.equipment_section === "rental" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              貸出履歴
              <Badge variant="outline" className="text-xs">貸出可</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(item.lendings || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">履歴なし</p>
            ) : (
              <div className="space-y-2">
                {item.lendings.map((l: any) => (
                  <div key={l.id} className="text-sm border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{l.borrower_name}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${l.status === "lent" ? "bg-warning-surface text-warning-strong" : "bg-success-surface text-success"}`}>
                        {l.status === "lent" ? "貸出中" : "返却済"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {l.lent_at?.split("T")[0]} → {l.returned_at?.split("T")[0] || l.due_date || "未定"}
                    </div>
                    {l.purpose && <div className="text-xs text-muted-foreground">{l.purpose}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Maintenance records */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              メンテナンス記録
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(item.maintenance || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">記録なし</p>
            ) : (
              <div className="space-y-2">
                {item.maintenance.map((m: any) => (
                  <div key={m.id} className="text-sm border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.title}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {statusOf(MAINTENANCE_TYPE, m.record_type).label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {statusOf(MAINTENANCE_STATUS, m.status).label}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {m.reported_at?.split("T")[0]}
                      {m.repair_cost ? ` / 費用: ${formatCurrency(m.repair_cost)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 共有カスタム列（値が入力済みのもののみ表示） */}
        {sharedColumns.some(c => customValueMap[c.id] !== undefined && customValueMap[c.id] !== '') && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LayoutList className="h-4 w-4" />
                カスタム情報
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {sharedColumns.filter(col => customValueMap[col.id] !== undefined && customValueMap[col.id] !== '').map(col => {
                const val = customValueMap[col.id] ?? '';
                const isEditing = editingCustomCell === col.id;
                if (col.col_type === 'checkbox') {
                  const checked = val === 'true' || val === '1';
                  return (
                    <div key={col.id} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{col.name}</span>
                      <EnhancedCheckbox
                        checked={checked}
                        onCheckedChange={(v) => customValueMutation.mutate({ columnId: col.id, value: v ? 'true' : 'false' })}
                      />
                    </div>
                  );
                }
                return (
                  <div key={col.id} className="flex justify-between items-center gap-4">
                    <span className="text-muted-foreground shrink-0">{col.name}</span>
                    {isEditing ? (
                      <input
                        type={col.col_type === 'number' ? 'number' : 'text'}
                        className="flex-1 text-right bg-transparent border-b border-primary/60 focus:border-primary focus:outline-none text-sm font-medium"
                        defaultValue={val}
                        autoFocus
                        onBlur={e => { setEditingCustomCell(null); customValueMutation.mutate({ columnId: col.id, value: e.target.value }); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingCustomCell(null); }}
                      />
                    ) : (
                      <span
                        className="font-medium text-right cursor-text hover:text-primary transition-colors"
                        onClick={() => setEditingCustomCell(col.id)}
                        title="クリックして編集"
                      >
                        {val || <span className="text-muted-foreground font-normal">—</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* 関連機材 / オプション品 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              関連機材 / オプション品
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 付属品リスト（children） */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">付属品 / オプション品（この機材に紐付いているもの）</p>
              {(item.children ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">なし</p>
              ) : (
                <div className="space-y-1">
                  {item.children.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <button
                        className="flex items-center gap-2 hover:underline text-left"
                        onClick={() => navigate(`/equipment/items/${c.id}`)}
                      >
                        <span className=" text-xs text-muted-foreground">{c.eq_code}</span>
                        <span>{c.name}{c.model_number ? ` (${c.model_number})` : ""}{c.unit_number ? ` No.${c.unit_number}` : ""}</span>
                        {c.notes && <span className="text-xs text-muted-foreground truncate max-w-[160px]">{c.notes}</span>}
                      </button>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          title="コピーして新規登録（No.自動採番）"
                          onClick={() => openNewChild(c)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="取り外す"
                          onClick={() => detachMutation.mutate(c.id)}
                          disabled={detachMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 機材追加 */}
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">既存の機材を紐付ける</p>
                <div className="flex gap-2">
                  <SearchableSelect
                    value={selectedChildId}
                    onChange={setSelectedChildId}
                    placeholder="機材を検索して選択..."
                    items={allItems
                      .filter((it: any) => it.id !== id && it.parent_id == null && it.id !== item.parent_id)
                      .map((it: any) => ({
                        id: it.id,
                        label: `${it.eq_code} — ${it.name}${it.model_number ? ` (${it.model_number})` : ""}${it.unit_number ? ` No.${it.unit_number}` : ""}${it.notes ? ` — ${it.notes}` : ""}`,
                      }))}
                  />
                  <Button
                    size="sm"
                    disabled={!selectedChildId || attachMutation.isPending}
                    onClick={() => attachMutation.mutate(selectedChildId)}
                  >
                    紐付け
                  </Button>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={openNewChild}>
                  <Plus className="h-3.5 w-3.5 mr-1" />新規子機材を登録
                </Button>
              </div>
            </div>

            {/* 親機材表示 */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">親機材（この機材が付属している先）</p>
              {item.parent ? (
                <button
                  className="flex items-center gap-2 text-sm hover:underline"
                  onClick={() => navigate(`/equipment/items/${item.parent.id}`)}
                >
                  <span className=" text-xs text-muted-foreground">{item.parent.eq_code}</span>
                  <span>{item.parent.name}</span>
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">なし</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function SearchableSelect({ value, onChange, items, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = items.find((it) => it.id === value);
  const filtered = search
    ? items.filter((it) => it.label.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        className="h-ctl-3 w-full flex items-center justify-between px-3 text-sm border rounded-md bg-background hover:bg-muted/50 transition-colors"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <span className={selected ? "truncate" : "text-muted-foreground truncate"}>
          {selected ? selected.label : (placeholder || "選択...")}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-md shadow-lg">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder="名前・型番・IDで検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">当てはまるものがありません。言葉を短くしてお試しください。</div>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors truncate block ${value === it.id ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => { onChange(it.id); setOpen(false); setSearch(""); }}
                >
                  {it.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
