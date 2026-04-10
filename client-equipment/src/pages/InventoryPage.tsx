import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, ClipboardCheck, Check, X, HelpCircle } from "lucide-react";

const statusLabels: Record<string, string> = {
  draft: "下書き", in_progress: "実施中", completed: "完了",
};

export default function InventoryPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", check_date: new Date().toISOString().split("T")[0], notes: "" });

  const { data: checksData, isLoading } = useQuery({
    queryKey: ["inventory-checks"],
    queryFn: async () => (await api.get("/equipment/inventory-checks")).data.data,
  });
  const checks: any[] = checksData ?? [];

  const { data: checkDetail } = useQuery({
    queryKey: ["inventory-check", selectedCheck],
    queryFn: async () => (await api.get(`/equipment/inventory-checks/${selectedCheck}`)).data.data,
    enabled: !!selectedCheck,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post("/equipment/inventory-checks", payload),
    onSuccess: (res: { data: { data: { id: string } } }) => {
      qc.invalidateQueries({ queryKey: ["inventory-checks"] });
      setDialogOpen(false);
      setSelectedCheck(res.data.data.id);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ checkId, itemId, ...body }: any) =>
      api.put(`/equipment/inventory-checks/${checkId}/items/${itemId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-check", selectedCheck] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: any) => api.put(`/equipment/inventory-checks/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-checks"] });
      qc.invalidateQueries({ queryKey: ["inventory-check", selectedCheck] });
    },
  });

  if (selectedCheck && checkDetail) {
    const detail = checkDetail;
    const items: any[] = detail.items || [];
    const checked = items.filter((i: any) => i.found > 0).length;
    const total = items.length;

    return (
      <div className="space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedCheck(null)} className="mb-1">
              ← 一覧に戻る
            </Button>
            <h1 className="text-xl font-bold">{detail.title}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.check_date} / {statusLabels[detail.status]} / {checked}/{total} 確認済
            </p>
          </div>
          {detail.status !== "completed" && (
            <div className="flex gap-2">
              {detail.status === "draft" && (
                <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "in_progress" })}>
                  開始
                </Button>
              )}
              {detail.status === "in_progress" && (
                <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "completed" })}>
                  完了
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          {items.map((item: any) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex gap-1">
                <button
                  className={`h-8 w-8 rounded flex items-center justify-center text-sm transition-colors ${item.found === 1 ? "bg-green-500 text-white" : "bg-muted hover:bg-green-100"}`}
                  onClick={() => updateItemMutation.mutate({ checkId: detail.id, itemId: item.id, found: 1, actual_location: item.actual_location, condition: item.condition, note: item.note })}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  className={`h-8 w-8 rounded flex items-center justify-center text-sm transition-colors ${item.found === 2 ? "bg-red-500 text-white" : "bg-muted hover:bg-red-100"}`}
                  onClick={() => updateItemMutation.mutate({ checkId: detail.id, itemId: item.id, found: 2, actual_location: item.actual_location, condition: item.condition, note: item.note })}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-primary">{item.eq_code}</span>
                  <span className="text-sm font-medium truncate">{item.equipment_name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  想定: {item.expected_location || "未設定"}
                </div>
              </div>
              {item.found === 0 && (
                <HelpCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="heading-page text-xl lg:text-2xl">棚卸し</h1>
        <Button size="sm" onClick={() => {
          setForm({ title: "", check_date: new Date().toISOString().split("T")[0], notes: "" });
          setDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-1" />
          新規棚卸し
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : checks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>棚卸し記録がありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {checks.map((c: any) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedCheck(c.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.check_date}</p>
                  </div>
                  <Badge variant={c.status === "completed" ? "secondary" : "default"}>
                    {statusLabels[c.status]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New inventory dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新規棚卸し</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>タイトル *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="2026年3月度 棚卸し" />
            </div>
            <div className="space-y-1">
              <Label>実施日</Label>
              <Input type="date" value={form.check_date} onChange={(e) => setForm({ ...form, check_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>メモ</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.title || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                作成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
