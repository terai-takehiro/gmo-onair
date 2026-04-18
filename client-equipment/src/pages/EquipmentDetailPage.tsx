import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Copy, Loader2, Wrench, ArrowRightLeft, Package, QrCode, Printer, Link2, X, ChevronDown, Search, Pencil, Plus,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusLabels: Record<string, string> = {
  active: "稼働中", in_repair: "修理中", retired: "引退", disposed: "廃棄", lost: "紛失",
};
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800", in_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-100 text-gray-600", disposed: "bg-red-100 text-red-800",
  lost: "bg-red-200 text-red-900",
};
const conditionLabels: Record<string, string> = {
  excellent: "優良", good: "良好", fair: "可", poor: "不良",
};
const maintenanceTypeLabels: Record<string, string> = {
  breakdown: "故障", repair: "修理", maintenance: "メンテナンス", inspection: "点検",
};
const maintenanceStatusLabels: Record<string, string> = {
  reported: "報告済", in_progress: "対応中", completed: "完了", cancelled: "キャンセル",
};

const TYPE_CODES = [
  { code: "V", label: "映像" }, { code: "C", label: "カメラ" }, { code: "A", label: "音声" },
  { code: "IC", label: "インカム" }, { code: "NW", label: "ネットワーク" }, { code: "L", label: "照明" },
  { code: "XR", label: "LED/XR" }, { code: "E", label: "設備/その他" },
];
const ASSET_CLASS_OPTIONS = [
  { value: "fixed_asset", label: "固定資産" }, { value: "consumable", label: "消耗品" },
  { value: "leased", label: "リース" }, { value: "transferred", label: "譲渡" },
];
const SECTIONS = [{ value: "equipment", label: "設備" }, { value: "rental", label: "貸出" }];
const LOC_CODES = [{ value: "Y", label: "用賀" }, { value: "S", label: "渋谷" }];
const STATUS_OPTIONS = [
  { value: "active", label: "稼働中" }, { value: "in_repair", label: "修理中" },
  { value: "retired", label: "引退" }, { value: "disposed", label: "廃棄" }, { value: "lost", label: "紛失" },
];
const CONDITION_OPTIONS = [
  { value: "excellent", label: "優良" }, { value: "good", label: "良好" },
  { value: "fair", label: "可" }, { value: "poor", label: "不良" },
];

const TYPE_LABELS: Record<string, string> = { V: '映像', C: 'カメラ', A: '音声', IC: 'インカム', NW: 'ネットワーク', L: '照明', XR: 'LED/XR', E: '設備' };
const ASSET_CLASS_LABELS: Record<string, string> = {
  fixed_asset: '固定資産', consumable: '消耗品', leased: 'リース', transferred: '譲渡',
};
const SECTION_LABELS: Record<string, string> = { equipment: '設備', rental: '貸出' };
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
  const allItems: any[] = allItemsData ?? [];
  const locations: any[] = locationsData ?? [];
  const manufacturers: any[] = manufacturersData ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: any) => api.patch(`/equipment/items/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      setEditOpen(false);
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
    });
    setEditOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editForm.name) return;
    const payload: Record<string, unknown> = {
      ...editForm,
      unit_number: editForm.unit_number ? Number(editForm.unit_number) : null,
      depreciation_years: editForm.depreciation_years ? Number(editForm.depreciation_years) : null,
      warranty_years: editForm.warranty_years ? Number(editForm.warranty_years) : null,
      manufacturer_id: editForm.manufacturer_id || null,
      location_id: editForm.location_id || null,
      purchased_at: editForm.purchased_at || null,
      fixed_asset_code: editForm.fixed_asset_code || null,
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
  const createChildMutation = useMutation({
    mutationFn: (payload: any) => api.post('/equipment/items', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      qc.invalidateQueries({ queryKey: ["equipment-items-all"] });
      setNewChildOpen(false);
    },
  });
  const openNewChild = () => {
    if (!data) return;
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
    setNewChildOpen(true);
  };
  const handleCreateChild = () => {
    if (!newChildForm.name) return;
    createChildMutation.mutate({
      ...newChildForm,
      parent_id: id,
      unit_number: newChildForm.unit_number ? Number(newChildForm.unit_number) : null,
      depreciation_years: newChildForm.depreciation_years ? Number(newChildForm.depreciation_years) : 0,
      warranty_years: newChildForm.warranty_years ? Number(newChildForm.warranty_years) : 0,
      manufacturer_id: newChildForm.manufacturer_id || null,
      location_id: newChildForm.location_id || null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">機材が見つかりません</div>
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
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[item.status] || ""}`}>
              {statusLabels[item.status]}
            </span>
            <Badge variant="outline">{item.equipment_section === "rental" ? "貸出" : "設備"}</Badge>
          </div>
          <h1 className="heading-page text-xl mt-1">
            {item.name}
            {item.model_number && <span className="text-muted-foreground font-normal ml-2">({item.model_number})</span>}
            {item.unit_number && <span className="text-primary ml-2">No.{item.unit_number}</span>}
          </h1>
          <button
            onClick={copyEqCode}
            className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
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
            <p className="font-mono text-sm">{item.eq_code}</p>
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
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <Label className="text-amber-800 font-semibold">機材ID (管理者のみ変更可)</Label>
                <Input
                  value={editForm.eq_code || ""}
                  onChange={(e) => setEditForm({ ...editForm, eq_code: e.target.value })}
                  className="font-mono"
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
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
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
                  <Input value={editForm.branch_code} onChange={(e) => setEditForm({ ...editForm, branch_code: e.target.value })} placeholder="GMO-IG" />
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
            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>キャンセル</Button>
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
                <Input value={newChildForm.branch_code} onChange={(e) => setNewChildForm({ ...newChildForm, branch_code: e.target.value })} />
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
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setNewChildOpen(false)}>キャンセル</Button>
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
            <InfoRow label="コンディション" value={conditionLabels[item.condition]} />
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
                      <span className={`text-xs rounded-full px-2 py-0.5 ${l.status === "lent" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
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
                          {maintenanceTypeLabels[m.record_type]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {maintenanceStatusLabels[m.status]}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {m.reported_at?.split("T")[0]}
                      {m.repair_cost ? ` / 費用: ¥${m.repair_cost.toLocaleString()}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                        <span className="font-mono text-xs text-muted-foreground">{c.eq_code}</span>
                        <span>{c.name}{c.model_number ? ` (${c.model_number})` : ""}{c.unit_number ? ` No.${c.unit_number}` : ""}</span>
                        {c.notes && <span className="text-xs text-muted-foreground truncate max-w-[160px]">{c.notes}</span>}
                      </button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="取り外す"
                        onClick={() => detachMutation.mutate(c.id)}
                        disabled={detachMutation.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
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
                  <span className="font-mono text-xs text-muted-foreground">{item.parent.eq_code}</span>
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
        className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background hover:bg-muted/50 transition-colors"
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
              <div className="px-3 py-2 text-sm text-muted-foreground">見つかりません</div>
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
