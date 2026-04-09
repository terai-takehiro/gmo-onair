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
import { Loader2, Plus, MapPin, Pencil, Trash2 } from "lucide-react";

export default function LocationPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", building: "", floor: "", area: "", description: "", sort_order: "0",
  });

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
    setForm({ name: "", building: "", floor: "", area: "", description: "", sort_order: "0" });
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
    });
    setEditingId(loc.id);
    setDialogOpen(true);
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
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-medium">{loc.name}</h3>
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
        <DialogContent className="sm:max-w-md">
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
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button
                onClick={() => saveMutation.mutate({ ...form, sort_order: Number(form.sort_order) || 0 })}
                disabled={!form.name || saveMutation.isPending}
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
