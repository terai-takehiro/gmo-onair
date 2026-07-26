import { useMemo, useState } from "react";
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
import { Loader2, Plus, ClipboardCheck, Check, X, HelpCircle, Save, Undo2, MapPin, RefreshCw, Trash2 } from "lucide-react";
import { INVENTORY_STATUS, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

type CheckItem = {
  id: string;
  equipment_id: string;
  eq_code: string;
  equipment_name: string;
  unit_number: number | null;
  expected_location: string | null;
  actual_location: string | null;
  location_name: string | null;
  location_detail: string | null;
  found: number;
  condition: string | null;
  note: string | null;
};

export default function InventoryPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", check_date: new Date().toISOString().split("T")[0], notes: "" });
  const [locationFilter, setLocationFilter] = useState<string>("");

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/inventory-checks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-checks"] });
      setSelectedCheck(null);
    },
  });

  const syncMutation = useMutation({
    mutationFn: (checkId: string) => api.post(`/equipment/inventory-checks/${checkId}/sync`, {}),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["inventory-check", selectedCheck] });
      const added = res?.data?.data?.added ?? 0;
      if (added > 0) alert(`${added}件の機材を追加しました`);
    },
  });

  const items: CheckItem[] = checkDetail?.items || [];

  // 保管場所でグルーピング (表示用の location key)
  const locKey = (i: CheckItem) => i.location_name || i.location_detail || "(場所未設定)";
  const groupedItems = useMemo(() => {
    const filtered = locationFilter ? items.filter((i) => locKey(i) === locationFilter) : items;
    const map = new Map<string, CheckItem[]>();
    for (const i of filtered) {
      const k = locKey(i);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    return Array.from(map.entries());
  }, [items, locationFilter]);

  const locations = useMemo(() => Array.from(new Set(items.map(locKey))), [items]);

  if (selectedCheck && checkDetail) {
    const detail = checkDetail;
    const isCompleted = detail.status === "completed";
    const isDraft = detail.status === "draft";
    const checked = items.filter((i) => i.found > 0).length;
    const total = items.length;

    const mark = (item: CheckItem, found: number) => {
      if (isCompleted) return; // 完了後は編集不可
      updateItemMutation.mutate({
        checkId: detail.id, itemId: item.id, found,
        actual_location: item.actual_location, condition: item.condition, note: item.note,
      });
    };

    return (
      <div className="space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedCheck(null)} className="mb-1">
              ← 一覧に戻る
            </Button>
            <h1 className="text-xl font-bold">{detail.title}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.check_date} / {statusOf(INVENTORY_STATUS, detail.status).label} / {checked}/{total} 確認済
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* 一時保存: 自動保存されているので実質「戻る」 */}
            {!isCompleted && (
              <Button size="sm" variant="outline" onClick={() => setSelectedCheck(null)}>
                <Save className="h-4 w-4 mr-1" />一時保存
              </Button>
            )}
            {!isCompleted && (
              <Button
                size="sm" variant="outline"
                onClick={() => syncMutation.mutate(detail.id)}
                disabled={syncMutation.isPending}
                title="棚卸し作成後に追加された機材をチェックリストに同期"
              >
                {syncMutation.isPending
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <RefreshCw className="h-4 w-4 mr-1" />}
                機材同期
              </Button>
            )}
            {isDraft && (
              <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "in_progress" })}>
                開始
              </Button>
            )}
            {detail.status === "in_progress" && (
              <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "completed" })}>
                完了
              </Button>
            )}
            {isCompleted && (
              <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "in_progress" })}>
                <Undo2 className="h-4 w-4 mr-1" />差し戻し
              </Button>
            )}
            <Button
              size="sm" variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={deleteMutation.isPending}
              onClick={() => { if (confirm(`「${detail.title}」を削除しますか？\n※この操作は取り消せません`)) deleteMutation.mutate(detail.id); }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              削除
            </Button>
          </div>
        </div>

        {/* 保管場所フィルター */}
        {locations.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setLocationFilter("")}
              className={`px-3 py-1 rounded-full text-xs font-medium ${locationFilter === "" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              全て ({items.length})
            </button>
            {locations.map((loc) => {
              const count = items.filter((i) => locKey(i) === loc).length;
              return (
                <button
                  key={loc}
                  onClick={() => setLocationFilter(loc)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${locationFilter === loc ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {loc} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* 保管場所ごとにグルーピング */}
        <div className="space-y-4">
          {groupedItems.map(([loc, group]) => {
            const locChecked = group.filter((i) => i.found > 0).length;
            return (
              <div key={loc} className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground border-b pb-1">
                  <MapPin className="h-4 w-4" />
                  <span>{loc}</span>
                  <span className="text-xs font-normal">{locChecked}/{group.length}</span>
                </div>
                {group.map((item) => (
                  <div key={item.id} className={`flex items-center gap-3 rounded-lg border p-3 ${isCompleted ? "opacity-70" : ""}`}>
                    <div className="flex gap-1">
                      <button
                        disabled={isCompleted}
                        className={`h-8 w-8 rounded flex items-center justify-center text-sm transition-colors ${
                          item.found === 1 ? "bg-green-500 text-white" : "bg-muted hover:bg-green-100 disabled:hover:bg-muted"
                        } disabled:cursor-not-allowed`}
                        onClick={() => mark(item, 1)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        disabled={isCompleted}
                        className={`h-8 w-8 rounded flex items-center justify-center text-sm transition-colors ${
                          item.found === 2 ? "bg-red-500 text-white" : "bg-muted hover:bg-red-100 disabled:hover:bg-muted"
                        } disabled:cursor-not-allowed`}
                        onClick={() => mark(item, 2)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className=" text-xs text-primary">{item.eq_code}</span>
                        <span className="text-sm font-medium truncate">
                          {item.equipment_name}{item.unit_number ? ` No.${item.unit_number}` : ""}
                        </span>
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
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>棚卸し</PageTitle>
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
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.check_date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={c.status === "completed" ? "secondary" : "default"}>
                      {statusOf(INVENTORY_STATUS, c.status).label}
                    </Badge>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={(e) => { e.stopPropagation(); if (confirm(`「${c.title}」を削除しますか？`)) deleteMutation.mutate(c.id); }}
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
