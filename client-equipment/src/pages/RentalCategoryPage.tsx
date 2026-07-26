import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Pencil, Check, X, ArrowUp, ArrowDown, Tag } from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface RentalCategory {
  id: string;
  name: string;
  sort_order: number;
}

export default function RentalCategoryPage() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data, isLoading } = useQuery<RentalCategory[]>({
    queryKey: ["rental-categories"],
    queryFn: async () => (await api.get("/equipment/rental-categories")).data.data,
  });
  const categories: RentalCategory[] = data ?? [];

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post("/equipment/rental-categories", { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rental-categories"] }); setNewName(""); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/equipment/rental-categories/${id}`, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rental-categories"] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/rental-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-categories"] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (order: { id: string; sort_order: number }[]) =>
      api.put("/equipment/rental-categories/reorder", { order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-categories"] }),
  });

  const move = (idx: number, dir: "up" | "down") => {
    const list = [...categories];
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    reorderMutation.mutate(list.map((c, i) => ({ id: c.id, sort_order: i })));
  };

  const startEdit = (c: RentalCategory) => {
    setEditingId(c.id);
    setEditingName(c.name);
  };

  const confirmEdit = () => {
    if (editingId && editingName.trim()) {
      updateMutation.mutate({ id: editingId, name: editingName.trim() });
    }
  };

  return (
    <div className="space-y-4 p-3 lg:p-6 mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <Tag className="h-5 w-5 text-primary" />
        <PageTitle>貸出カテゴリ管理</PageTitle>
      </div>
      <p className="text-sm text-muted-foreground">
        貸出機材一覧でグループ表示するカテゴリを管理します。並び順は↑↓で変更できます。
      </p>

      {/* Add new */}
      <div className="flex gap-2">
        <Input
          placeholder="新しいカテゴリ名（例: コンバーター）"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim());
          }}
          className="flex-1"
        />
        <Button
          disabled={!newName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate(newName.trim())}
        >
          {createMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Plus className="h-4 w-4" />
          }
          追加
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          カテゴリがありません。追加してください。
        </div>
      ) : (
        <div className="space-y-1 rounded-lg border overflow-hidden">
          {categories.map((cat, idx) => (
            <div
              key={cat.id}
              className="flex items-center gap-2 px-3 py-2.5 bg-card hover:bg-muted/30 transition-colors border-b last:border-b-0"
            >
              {/* Reorder buttons */}
              <div className="flex flex-col shrink-0">
                <button
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                  disabled={idx === 0 || reorderMutation.isPending}
                  onClick={() => move(idx, "up")}
                  title="上へ"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                  disabled={idx === categories.length - 1 || reorderMutation.isPending}
                  onClick={() => move(idx, "down")}
                  title="下へ"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>

              {/* Name / edit */}
              {editingId === cat.id ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditingId(null); }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <button
                    className="p-1 rounded hover:bg-muted text-green-600"
                    onClick={confirmEdit}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{cat.name}</span>
                  <button
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                    onClick={() => startEdit(cat)}
                    title="名前を変更"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-muted text-destructive"
                    onClick={() => {
                      if (confirm(`「${cat.name}」を削除しますか？\n割り当て済みの機材のカテゴリは解除されます。`)) {
                        deleteMutation.mutate(cat.id);
                      }
                    }}
                    title="削除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
