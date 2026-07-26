/**
 * ColorPage — Phase 2B 移行 (v2.6.5)
 * useCrudPage / EmptyState の shared プリミティブを使用。
 * pagination/search なし (マスター全件表示) のため Pagination/FilterBar は省略。
 */
import { useEffect, useState } from "react";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { useCrudPage } from "@/hooks/useCrudPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Palette, Pencil, Trash2 } from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface Color {
  id: string;
  name: string;
  color_hex: string;
  description?: string;
  sort_order?: number;
}

interface ColorForm {
  name: string;
  color_hex: string;
  description: string;
  sort_order: string;
}

const EMPTY_FORM: ColorForm = { name: "", color_hex: "#4A90E2", description: "", sort_order: "0" };

export default function ColorPage() {
  const crud = useCrudPage<Color>({
    endpoint: "/equipment/colors",
    queryKey: ["equipment-colors"],
  });

  const [form, setForm] = useState<ColorForm>(EMPTY_FORM);

  useEffect(() => {
    if (crud.editingItem) {
      const c = crud.editingItem;
      setForm({
        name: c.name || "",
        color_hex: c.color_hex || "#4A90E2",
        description: c.description || "",
        sort_order: c.sort_order?.toString() || "0",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [crud.editingItem]);

  const handleSave = () => {
    crud.save.mutate({
      name: form.name,
      color_hex: form.color_hex,
      description: form.description || null,
      sort_order: Number(form.sort_order) || 0,
    });
  };

  const handleDelete = async (c: Color) => {
    if (!(await confirmAction({ title: `「${c.name}」を削除しますか？`, confirmLabel: '削除する', tone: 'danger' }))) return;
    crud.remove.mutate(c.id);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>機材色マスタ</PageTitle>
        <Button size="sm" onClick={crud.openAdd}>
          <Plus className="h-4 w-4 mr-1" />
          色追加
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        機材に色を設定することで、ラック実装ビューで視覚的に種別を区別できます。
      </p>

      {crud.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : crud.items.length === 0 ? (
        <EmptyState
          icon={<Palette className="h-12 w-12 opacity-30" />}
          title="色マスタが登録されていません"
          description="ラック実装ビューで機材を視覚的に区別するための色を追加してください。"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crud.items.map((color) => (
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
                      <p className="text-xs text-muted-foreground">{color.color_hex}</p>
                      {color.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{color.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => crud.openEdit(color)} aria-label="編集">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(color)}
                      aria-label="削除"
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

      <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{crud.isEditing ? "色編集" : "色追加"}</DialogTitle>
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
                  className=""
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
              <Button variant="outline" onClick={crud.closeDialog}>キャンセル</Button>
              <Button
                onClick={handleSave}
                disabled={!form.name || !form.color_hex || crud.save.isPending}
              >
                {crud.save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {crud.isEditing ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
