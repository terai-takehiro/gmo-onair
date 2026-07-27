/**
 * LocationPage — Phase 2B 移行 (v2.6.5)
 * 主要 CRUD は useCrudPage で共通化。MasterDialog (拠点/種別マスタ管理) は
 * 独自フローのためそのまま維持。
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useCrudPage } from "@/hooks/useCrudPage";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, MapPin, Pencil, Trash2, Server, Settings } from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { EmptyState } from '@gmo-onair/shared/src/client/states';

interface Location {
  id: string;
  name: string;
  building?: string;
  floor?: string;
  area?: string;
  description?: string;
  sort_order?: number;
  rack_units?: number;
  rack_sort_order?: number;
  branch_id?: string;
  rack_type_id?: string;
}

interface LocationForm {
  name: string;
  building: string;
  floor: string;
  area: string;
  description: string;
  sort_order: string;
  rack_units: string;
  rack_sort_order: string;
  branch_id: string;
  rack_type_id: string;
}

const EMPTY_FORM: LocationForm = {
  name: "", building: "", floor: "", area: "", description: "",
  sort_order: "0", rack_units: "", rack_sort_order: "0",
  branch_id: "", rack_type_id: "",
};

export default function LocationPage() {
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [masterOpen, setMasterOpen] = useState(false);

  const crud = useCrudPage<Location>({
    endpoint: "/equipment/locations",
    queryKey: ["equipment-locations"],
  });

  const { data: branchData } = useQuery({
    queryKey: ["equipment-branches"],
    queryFn: async () => (await api.get("/equipment/branches")).data.data,
  });
  const { data: rackTypeData } = useQuery({
    queryKey: ["equipment-rack-types"],
    queryFn: async () => (await api.get("/equipment/rack-types")).data.data,
  });
  const branches: { id: string; name: string }[] = branchData ?? [];
  const rackTypes: { id: string; name: string }[] = rackTypeData ?? [];

  useEffect(() => {
    if (crud.editingItem) {
      const loc = crud.editingItem;
      setForm({
        name: loc.name || "",
        building: loc.building || "",
        floor: loc.floor || "",
        area: loc.area || "",
        description: loc.description || "",
        sort_order: loc.sort_order?.toString() || "0",
        rack_units: loc.rack_units?.toString() || "",
        rack_sort_order: loc.rack_sort_order?.toString() || "0",
        branch_id: loc.branch_id || "",
        rack_type_id: loc.rack_type_id || "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [crud.editingItem]);

  const handleSave = () => {
    const isRack = !!form.rack_type_id;
    crud.save.mutate({
      name: form.name,
      building: form.building || null,
      floor: form.floor || null,
      area: form.area || null,
      description: form.description || null,
      sort_order: Number(form.sort_order) || 0,
      rack_units: isRack ? (Number(form.rack_units) || null) : null,
      rack_sort_order: Number(form.rack_sort_order) || 0,
      branch_id: form.branch_id || null,
      rack_type_id: form.rack_type_id || null,
    });
  };

  const handleDelete = async (loc: Location) => {
    if (!(await confirmAction({ title: `「${loc.name}」を削除しますか？`, confirmLabel: '削除する', tone: 'danger' }))) return;
    crud.remove.mutate(loc.id);
  };

  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
  const rackTypeMap = Object.fromEntries(rackTypes.map((t) => [t.id, t.name]));
  const isRackForm = !!form.rack_type_id;
  const canSave = !!form.name && (!isRackForm || !!form.rack_units);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>保管場所管理</PageTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setMasterOpen(true)}>
            <Settings className="h-4 w-4 mr-1" />
            マスタ設定
          </Button>
          <Button size="sm" onClick={crud.openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            場所追加
          </Button>
        </div>
      </div>

      {crud.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : crud.items.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-12 w-12 opacity-30" />}
          title="保管場所が登録されていません"
        />
      ) : (
        <div className="space-y-2">
          {crud.items.map((loc) => {
            const isRack = !!loc.rack_type_id;
            const rtName = loc.rack_type_id ? (rackTypeMap[loc.rack_type_id] ?? loc.rack_type_id) : "";
            const brName = loc.branch_id ? (branchMap[loc.branch_id] ?? loc.branch_id) : "";
            return (
              <Card key={loc.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isRack
                          ? <Server className="h-4 w-4 text-warning-strong shrink-0" />
                          : <MapPin className="h-4 w-4 text-primary shrink-0" />}
                        <h3 className="font-medium">{loc.name}</h3>
                        {brName && (
                          <span className="text-xs bg-accent text-primary px-1.5 py-0.5 rounded">
                            {brName}
                          </span>
                        )}
                        {isRack && (
                          <span className="text-xs bg-warning-surface text-warning-strong px-1.5 py-0.5 rounded ">
                            {rtName} {loc.rack_units}U
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1 ml-6">
                        {loc.building && <span>{loc.building}</span>}
                        {loc.floor && <span>{loc.floor}</span>}
                        {loc.area && <span>{loc.area}</span>}
                      </div>
                      {loc.description && (
                        <p className="text-xs text-muted-foreground mt-1 ml-6">{loc.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => crud.openEdit(loc)} aria-label="編集">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(loc)}
                        aria-label="削除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 場所追加/編集ダイアログ */}
      <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{crud.isEditing ? "場所編集" : "場所追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>場所名 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="カメラ庫" />
            </div>

            <div className="space-y-1">
              <Label>拠点</Label>
              <Select value={form.branch_id || "none"} onValueChange={(v) => setForm({ ...form, branch_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="拠点を選択..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {branches.length === 0 && (
                <p className="text-xs text-muted-foreground">「マスタ設定」で拠点を追加してください</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>種別</Label>
              <Select value={form.rack_type_id || "none"} onValueChange={(v) => setForm({ ...form, rack_type_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="種別を選択..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし（通常の保管場所）</SelectItem>
                  {rackTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {rackTypes.length === 0 && (
                <p className="text-xs text-muted-foreground">「マスタ設定」で種別を追加してください</p>
              )}
            </div>

            {isRackForm && (
              <div className="grid grid-cols-2 gap-3 pl-1">
                <div className="space-y-1">
                  <Label>Uサイズ *</Label>
                  <Input
                    type="number" min={1} max={60}
                    value={form.rack_units}
                    onChange={(e) => setForm({ ...form, rack_units: e.target.value })}
                    placeholder="45"
                  />
                </div>
                <div className="space-y-1">
                  <Label>表示順</Label>
                  <Input
                    type="number"
                    value={form.rack_sort_order}
                    onChange={(e) => setForm({ ...form, rack_sort_order: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>建物</Label>
                <Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="A棟" />
              </div>
              <div className="space-y-1">
                <Label>フロア</Label>
                <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="3F" />
              </div>
              <div className="space-y-1">
                <Label>エリア</Label>
                <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="機材エリア" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>説明</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="補足情報" />
            </div>
            <div className="space-y-1">
              <Label>表示順</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={crud.closeDialog}>キャンセル</Button>
              <Button onClick={handleSave} disabled={!canSave || crud.save.isPending}>
                {crud.save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {crud.isEditing ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* マスタ設定ダイアログ */}
      <MasterDialog open={masterOpen} onClose={() => setMasterOpen(false)} />
    </div>
  );
}

// ── MasterDialog: 拠点 + 種別マスタ管理 ───────────────────────────────────────
function MasterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>マスタ設定</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <MasterSection
            title="拠点"
            apiPath="/equipment/branches"
            queryKey="equipment-branches"
            placeholder="例: 用賀、渋谷、青山"
          />
          <MasterSection
            title="種別"
            apiPath="/equipment/rack-types"
            queryKey="equipment-rack-types"
            placeholder="例: ラック、オペ卓、AV盤"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MasterSection({ title, apiPath, queryKey, placeholder }: {
  title: string;
  apiPath: string;
  queryKey: string;
  placeholder: string;
}) {
  const qc = useQueryClient();
  const [addName, setAddName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => (await api.get(apiPath)).data.data,
  });
  const items: { id: string; name: string }[] = data ?? [];

  const addMutation = useMutation({
    mutationFn: (name: string) => api.post(apiPath, { name, sort_order: items.length }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); setAddName(""); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.put(`${apiPath}/${id}`, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${apiPath}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  });

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}マスタ</p>
      <div className="rounded-lg border divide-y">
        {items.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">未登録</div>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2">
            {editingId === item.id ? (
              <>
                <Input
                  className="h-7 text-sm flex-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim()) updateMutation.mutate({ id: item.id, name: editName.trim() });
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
                <Button
                size="sm" className="h-ctl-1 px-2 text-xs"
                  disabled={!editName.trim() || updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: item.id, name: editName.trim() })}
                >
                  保存
                </Button>
                <Button size="sm" variant="ghost" className="h-ctl-1 px-2 text-xs" onClick={() => setEditingId(null)}>
                  キャンセル
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{item.name}</span>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={async () => { if ((await confirmAction({ title: `「${item.name}」を削除しますか？`, confirmLabel: '削除する', tone: 'danger' }))) deleteMutation.mutate(item.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-2">
          <Input
            className="h-7 text-sm flex-1"
            placeholder={placeholder}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && addName.trim()) addMutation.mutate(addName.trim());
            }}
          />
          <Button
          size="sm" className="h-ctl-1 px-2 text-xs"
            disabled={!addName.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate(addName.trim())}
          >
            {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
