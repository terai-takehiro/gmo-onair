import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@gmo-onair/shared/src/client/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Wrench } from "lucide-react";
import { MAINTENANCE_TYPE, MAINTENANCE_STATUS, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    equipment_id: "", record_type: "breakdown", title: "", description: "",
    assigned_to: "", vendor_name: "", repair_cost: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-records", filterStatus],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      return (await api.get("/equipment/maintenance", { params })).data.data;
    },
  });
  const records: any[] = data ?? [];

  const { data: allItems } = useQuery({
    queryKey: ["equipment-items-all"],
    queryFn: async () => (await api.get("/equipment/items")).data.data,
    enabled: dialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post("/equipment/maintenance", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-records"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => api.put(`/equipment/maintenance/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-records"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
    },
  });

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>メンテナンス</PageTitle>
        <Button size="sm" onClick={() => {
          setForm({ equipment_id: "", record_type: "breakdown", title: "", description: "", assigned_to: "", vendor_name: "", repair_cost: "" });
          setDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-1" />
          記録追加
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[128px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="reported">報告済</SelectItem>
            <SelectItem value="in_progress">対応中</SelectItem>
            <SelectItem value="completed">完了</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Wrench className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>メンテナンス記録がありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {records.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={statusOf(MAINTENANCE_TYPE, r.record_type).variant} className="text-xs">
                        {statusOf(MAINTENANCE_TYPE, r.record_type).label}
                      </Badge>
                      <span className=" text-xs text-primary">{r.eq_code}</span>
                      <span className="text-sm text-muted-foreground">{r.equipment_name}</span>
                    </div>
                    <h3 className="font-medium mt-1">{r.title}</h3>
                    {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
                    <div className="text-xs text-muted-foreground mt-1">
                      報告: {r.reported_at?.split("T")[0]}
                      {r.vendor_name && ` / 業者: ${r.vendor_name}`}
                      {r.repair_cost && ` / 費用: ${formatCurrency(r.repair_cost)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusOf(MAINTENANCE_STATUS, r.status).variant} className="text-xs">
                      {statusOf(MAINTENANCE_STATUS, r.status).label}
                    </Badge>
                    {r.status !== "completed" && r.status !== "cancelled" && (
                      <Select
                        value={r.status}
                        onValueChange={(v) => updateMutation.mutate({
                          id: r.id, title: r.title, description: r.description,
                          assigned_to: r.assigned_to, vendor_name: r.vendor_name,
                          repair_cost: r.repair_cost, status: v, result: r.result,
                          started_at: r.started_at, completed_at: v === "completed" ? new Date().toISOString() : r.completed_at,
                        })}
                      >
                        <SelectTrigger className="h-7 w-[96px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reported">報告済</SelectItem>
                          <SelectItem value="in_progress">対応中</SelectItem>
                          <SelectItem value="completed">完了</SelectItem>
                          <SelectItem value="cancelled">キャンセル</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New record dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>メンテナンス記録</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>機材 *</Label>
              <Select value={form.equipment_id} onValueChange={(v) => setForm({ ...form, equipment_id: v })}>
                <SelectTrigger><SelectValue placeholder="機材を選択..." /></SelectTrigger>
                <SelectContent>
                  {(allItems ?? []).map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.eq_code} {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>種別</Label>
              <Select value={form.record_type} onValueChange={(v) => setForm({ ...form, record_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MAINTENANCE_TYPE).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>タイトル *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="問題の概要" />
            </div>
            <div className="space-y-1">
              <Label>詳細</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="詳しい状況" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>修理業者</Label>
                <Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>修理費用</Label>
                <Input type="number" value={form.repair_cost} onChange={(e) => setForm({ ...form, repair_cost: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={() => createMutation.mutate({
                ...form,
                repair_cost: form.repair_cost ? Number(form.repair_cost) : null,
              })} disabled={!form.equipment_id || !form.title || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                登録
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
