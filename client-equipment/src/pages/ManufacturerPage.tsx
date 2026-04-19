import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Building2, Phone, Mail, MapPin, User } from "lucide-react";

const defaultForm = {
  name: "", contact_person: "", address: "", phone: "", email: "", sort_order: "0", notes: "",
};

export default function ManufacturerPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-manufacturers"],
    queryFn: async () => (await api.get("/equipment/manufacturers")).data.data,
  });
  const manufacturers: any[] = data ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId
        ? api.put(`/equipment/manufacturers/${editingId}`, payload)
        : api.post("/equipment/manufacturers", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-manufacturers"] });
      setDialogOpen(false);
      setSaveError(null);
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.error?.message || err?.message || '保存に失敗しました');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/manufacturers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-manufacturers"] }),
  });

  const openNew = () => {
    setForm({ ...defaultForm });
    setEditingId(null);
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (m: any) => {
    setForm({
      name: m.name || "",
      contact_person: m.contact_person || "",
      address: m.address || "",
      phone: m.phone || "",
      email: m.email || "",
      sort_order: m.sort_order?.toString() || "0",
      notes: m.notes || "",
    });
    setEditingId(m.id);
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveMutation.mutate({ ...form, sort_order: Number(form.sort_order) || 0 });
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-page text-xl lg:text-2xl">メーカー管理</h1>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />メーカー追加</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : manufacturers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Building2 className="h-10 w-10 opacity-30" />
          <p>メーカーがまだ登録されていません</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {manufacturers.map((m: any) => (
            <div key={m.id} className="rounded-xl border bg-card p-4 space-y-2 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold truncate">{m.name}</span>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => { if (confirm(`「${m.name}」を削除しますか？`)) deleteMutation.mutate(m.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {(m.contact_person || m.phone || m.email || m.address) && (
                <div className="text-sm text-muted-foreground space-y-1 pt-1 border-t">
                  {m.contact_person && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>{m.contact_person}</span>
                    </div>
                  )}
                  {m.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <a href={`tel:${m.phone}`} className="hover:text-primary">{m.phone}</a>
                    </div>
                  )}
                  {m.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <a href={`mailto:${m.email}`} className="hover:text-primary truncate">{m.email}</a>
                    </div>
                  )}
                  {m.address && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-line">{m.address}</span>
                    </div>
                  )}
                </div>
              )}
              {m.notes && <p className="text-xs text-muted-foreground border-t pt-2">{m.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "メーカー編集" : "メーカー追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>メーカー名 *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="SONY" autoFocus />
            </div>
            <div className="border-t pt-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">連絡先</p>
              <div className="space-y-1">
                <Label>担当者</Label>
                <Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="山田 太郎" />
              </div>
              <div className="space-y-1">
                <Label>電話番号</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="03-0000-0000" type="tel" />
              </div>
              <div className="space-y-1">
                <Label>メールアドレス</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="support@example.com" type="email" />
              </div>
              <div className="space-y-1">
                <Label>住所</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="東京都渋谷区..." />
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>表示順</Label>
                <Input type="number" min="0" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>備考</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            {saveError && (
              <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">{saveError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending || !form.name.trim()}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
