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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, ArrowRightLeft, RotateCcw } from "lucide-react";

export default function LendingListPage() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("lent");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [returnDialogId, setReturnDialogId] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState("good");
  const [returnNotes, setReturnNotes] = useState("");

  // Form
  const [form, setForm] = useState({
    equipment_id: "", borrower_name: "", purpose: "",
    lent_at: new Date().toISOString().split("T")[0],
    due_date: "", condition_out: "good", notes: "", project_id: "",
  });

  const { data: lendingsData, isLoading } = useQuery({
    queryKey: ["equipment-lendings", filterStatus],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      return (await api.get("/equipment/lendings", { params })).data.data;
    },
  });
  const lendings: any[] = lendingsData ?? [];

  const { data: lendableItems } = useQuery({
    queryKey: ["equipment-lendable"],
    queryFn: async () => (await api.get("/equipment/items", { params: { is_lendable: "1", status: "active" } })).data.data,
    enabled: dialogOpen,
  });

  const lendMutation = useMutation({
    mutationFn: (payload: any) => api.post("/equipment/lendings", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-lendings"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
      setDialogOpen(false);
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => api.put(`/equipment/lendings/${id}/return`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-lendings"] });
      qc.invalidateQueries({ queryKey: ["equipment-stats"] });
      setReturnDialogId(null);
    },
  });

  const handleLend = () => {
    if (!form.equipment_id || !form.borrower_name) return;
    lendMutation.mutate({
      ...form,
      project_id: form.project_id || null,
      due_date: form.due_date || null,
    });
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">貸出管理</h1>
        <Button size="sm" onClick={() => {
          setForm({
            equipment_id: "", borrower_name: "", purpose: "",
            lent_at: new Date().toISOString().split("T")[0],
            due_date: "", condition_out: "good", notes: "", project_id: "",
          });
          setDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-1" />
          貸出登録
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="lent">貸出中</SelectItem>
            <SelectItem value="returned">返却済</SelectItem>
            <SelectItem value="overdue">返却遅延</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : lendings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>貸出記録がありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {lendings.map((l: any) => {
            const isOverdue = l.status === "lent" && l.due_date && l.due_date < new Date().toISOString().split("T")[0];
            return (
              <Card key={l.id} className={isOverdue ? "border-amber-300" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {l.eq_code}
                        </span>
                        <span className="font-medium text-sm">{l.equipment_name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={l.status === "lent" ? "default" : "secondary"}
                          className={isOverdue ? "bg-amber-500" : ""}
                        >
                          {l.status === "lent" ? (isOverdue ? "返却遅延" : "貸出中") : "返却済"}
                        </Badge>
                        <span className="text-sm">{l.borrower_name}</span>
                        {l.gls_number && (
                          <span className="text-xs text-muted-foreground">{l.gls_number} {l.project_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        貸出: {l.lent_at?.split("T")[0]}
                        {l.due_date && ` / 期限: ${l.due_date}`}
                        {l.returned_at && ` / 返却: ${l.returned_at.split("T")[0]}`}
                      </div>
                      {l.purpose && <div className="text-xs text-muted-foreground">{l.purpose}</div>}
                    </div>
                    {l.status === "lent" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReturnDialogId(l.id);
                          setReturnCondition("good");
                          setReturnNotes("");
                        }}
                        className="shrink-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        返却
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lend Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>貸出登録</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>機材 *</Label>
              <Select value={form.equipment_id} onValueChange={(v) => setForm({ ...form, equipment_id: v })}>
                <SelectTrigger><SelectValue placeholder="機材を選択..." /></SelectTrigger>
                <SelectContent>
                  {(lendableItems ?? []).map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.eq_code} {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>借用者 *</Label>
              <Input value={form.borrower_name} onChange={(e) => setForm({ ...form, borrower_name: e.target.value })} placeholder="氏名" />
            </div>
            <div className="space-y-1">
              <Label>目的</Label>
              <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="利用目的" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>貸出日</Label>
                <Input type="date" value={form.lent_at} onChange={(e) => setForm({ ...form, lent_at: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>返却予定日</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handleLend} disabled={!form.equipment_id || !form.borrower_name || lendMutation.isPending}>
                {lendMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                貸出
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={!!returnDialogId} onOpenChange={() => setReturnDialogId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>返却処理</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>返却時コンディション</Label>
              <Select value={returnCondition} onValueChange={setReturnCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">優良</SelectItem>
                  <SelectItem value="good">良好</SelectItem>
                  <SelectItem value="fair">可</SelectItem>
                  <SelectItem value="poor">不良</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="状態のメモ等" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnDialogId(null)}>キャンセル</Button>
              <Button onClick={() => returnMutation.mutate({ id: returnDialogId, condition_in: returnCondition, notes: returnNotes })} disabled={returnMutation.isPending}>
                {returnMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                返却完了
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
