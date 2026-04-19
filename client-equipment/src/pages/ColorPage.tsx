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
import { Loader2, Plus, Palette, Pencil, Trash2 } from "lucide-react";

const EMPTY_FORM = { name: "", color_hex: "#4A90E2", description: "", sort_order: "0" };

export default function ColorPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-colors"],
    queryFn: async () => (await api.get("/equipment/colors")).data.data,
  });
  const colors: any[] = data ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId
        ? api.put(`/equipment/colors/${editingId}`, payload)
        : api.post("/equipment/colors", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-colors"] });
      setDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/colors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-colors"] }),
  });

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (color: any) => {
    setForm({
      name: color.name || "",
      color_hex: color.color_hex || "#4A90E2",
      description: color.description || "",
      sort_order: color.sort_order?.toString() || "0",
    });
    setEditingId(color.id);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="heading-page text-xl lg:text-2xl">機材色マスタ</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          色追加
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        機材に色を設定することで、ラック実装ビューで視覚的に種別を区別できます。
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : colors.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Palette className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>色マスタが登録されていません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colors.map((color: any) => (
            <Card key={color.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-10 w-10 shrink-0 rounded-lg border border-border/40 shadow-sm"
                      style={{ background: color.color_hex }}
                    />
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{color.name}</h3>
                      <p className="text-xs font-mono text-muted-foreground">{color.color_hex}</p>
                      {color.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{color.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(color)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (confirm(`「${color.name}」を削除しますか？`)) deleteMutation.mutate(color.id);
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "色編集" : "色追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>色名 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="オンライン系"
              />
            </div>
            <div className="space-y-1">
              <Label>カラー *</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  className="h-10 w-16 rounded cursor-pointer border border-input"
                />
                <Input
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  placeholder="#E6F2FF"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>説明（凡例用）</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="オンライン配信系機材"
              />
            </div>
            <div className="space-y-1">
              <Label>表示順</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button
                onClick={() => saveMutation.mutate({
                  name: form.name,
                  color_hex: form.color_hex,
                  description: form.description || null,
                  sort_order: Number(form.sort_order) || 0,
                })}
                disabled={!form.name || !form.color_hex || saveMutation.isPending}
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
