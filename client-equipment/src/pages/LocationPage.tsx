import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, MapPin, Pencil, Trash2, Server } from "lucide-react";

const EMPTY_FORM = {
  name: "", building: "", floor: "", area: "", description: "", sort_order: "0",
  is_rack: false, rack_units: "", rack_sort_order: "0",
};

export default function LocationPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-locations"],
    queryFn: async () => (await api.get("/equipment/locations")).data.data,
  });
  const locations: any[] = data ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId
        ? api.put(`/equipment/locations/${editingId}`, payload)
        : api.post("/equipment/locations", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-locations"] });
      setDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-locations"] }),
  });

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (loc: any) => {
    setForm({
      name: loc.name || "",
      building: loc.building || "",
      floor: loc.floor || "",
      area: loc.area || "",
      description: loc.description || "",
      sort_order: loc.sort_order?.toString() || "0",
      is_rack: loc.is_rack ?? false,
      rack_units: loc.rack_units?.toString() || "",
      rack_sort_order: loc.rack_sort_order?.toString() || "0",
    });
    setEditingId(loc.id);
    setDialogOpen(true);
  };

  const handleSave = () => {
    saveMutation.mutate({
      name: form.name,
      building: form.building || null,
      floor: form.floor || null,
      area: form.area || null,
      description: form.description || null,
      sort_order: Number(form.sort_order) || 0,
      is_rack: form.is_rack,
      rack_units: form.is_rack ? (Number(form.rack_units) || null) : null,
      rack_sort_order: Number(form.rack_sort_order) || 0,
    });
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="heading-page text-xl lg:text-2xl">保管場所管理</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          場所追加
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>保管場所が登録されていません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {locations.map((loc: any) => (
            <Card key={loc.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {loc.is_rack
                        ? <Server className="h-4 w-4 text-amber-500 shrink-0" />
                        : <MapPin className="h-4 w-4 text-primary shrink-0" />}
                      <h3 className="font-medium">{loc.name}</h3>
                      {loc.is_rack && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-mono">
                          🗄 ラック {loc.rack_units}U
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(loc)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (confirm(`「${loc.name}」を削除しますか？`)) deleteMutation.mutate(loc.id);
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "場所編集" : "場所追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>場所名 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="カメラ庫" />
            </div>
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

            {/* ラック設定 */}
            <div className="border rounded-lg p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_rack}
                  onChange={(e) => setForm({ ...form, is_rack: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Server className="h-4 w-4 text-amber-500" />
                  ラックとして扱う
                </span>
              </label>
              {form.is_rack && (
                <div className="grid grid-cols-2 gap-3 pt-1">
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
                    <Label>ラック表示順</Label>
                    <Input
                      type="number"
                      value={form.rack_sort_order}
                      onChange={(e) => setForm({ ...form, rack_sort_order: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button
                onClick={handleSave}
                disabled={!form.name || (form.is_rack && !form.rack_units) || saveMutation.isPending}
              >
                {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editingId ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
