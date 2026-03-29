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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Settings } from "lucide-react";

export default function CategoryPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", item_type: "both", sort_order: "0" });

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-categories"],
    queryFn: async () => (await api.get("/equipment/categories")).data.data,
  });
  const categories: any[] = data ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId
        ? api.put(`/equipment/categories/${editingId}`, payload)
        : api.post("/equipment/categories", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-categories"] });
      setDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-categories"] }),
  });

  const openNew = () => {
    setForm({ name: "", item_type: "both", sort_order: "0" });
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (c: any) => {
    setForm({ name: c.name, item_type: c.item_type, sort_order: String(c.sort_order) });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const typeLabels: Record<string, string> = { facility: "設備", rental: "貸出", both: "共通" };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">カテゴリ管理</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          追加
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Settings className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>カテゴリが登録されていません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">({typeLabels[c.item_type] || c.item_type})</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                    onClick={() => { if (confirm(`「${c.name}」を削除しますか？`)) deleteMutation.mutate(c.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "カテゴリ編集" : "カテゴリ追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>名前 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="カメラ" />
            </div>
            <div className="space-y-1">
              <Label>種別</Label>
              <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">共通</SelectItem>
                  <SelectItem value="facility">設備</SelectItem>
                  <SelectItem value="rental">貸出</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>並び順</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={() => saveMutation.mutate({ ...form, sort_order: Number(form.sort_order) })} disabled={!form.name || saveMutation.isPending}>
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
