/**
 * ManufacturerPage — Phase 2B 移行 (v2.6.5)
 * useCrudPage / EmptyState の shared プリミティブを使用。
 */
import { useEffect, useState } from "react";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { useCrudPage } from "@/hooks/useCrudPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Building2, Phone, Mail, MapPin, User } from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface Manufacturer {
  id: string;
  name: string;
  contact_person?: string;
  address?: string;
  phone?: string;
  email?: string;
  sort_order?: number;
  notes?: string;
}

interface ManufacturerForm {
  name: string;
  contact_person: string;
  address: string;
  phone: string;
  email: string;
  sort_order: string;
  notes: string;
}

const EMPTY_FORM: ManufacturerForm = {
  name: "", contact_person: "", address: "", phone: "", email: "", sort_order: "0", notes: "",
};

export default function ManufacturerPage() {
  const [form, setForm] = useState<ManufacturerForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  const crud = useCrudPage<Manufacturer>({
    endpoint: "/equipment/manufacturers",
    queryKey: ["equipment-manufacturers"],
    onError: (action, err) => {
      if (action === "save") {
        const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
        setSaveError(e?.response?.data?.error?.message || e?.message || "保存に失敗しました");
      }
    },
  });

  useEffect(() => {
    if (crud.editingItem) {
      const m = crud.editingItem;
      setForm({
        name: m.name || "",
        contact_person: m.contact_person || "",
        address: m.address || "",
        phone: m.phone || "",
        email: m.email || "",
        sort_order: m.sort_order?.toString() || "0",
        notes: m.notes || "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setSaveError(null);
  }, [crud.editingItem]);

  const handleSave = () => {
    if (!form.name.trim()) return;
    setSaveError(null);
    crud.save.mutate({ ...form, sort_order: Number(form.sort_order) || 0 });
  };

  const handleDelete = (m: Manufacturer) => {
    if (!confirm(`「${m.name}」を削除しますか？`)) return;
    crud.remove.mutate(m.id);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <PageTitle>メーカー管理</PageTitle>
        <Button size="sm" onClick={crud.openAdd}><Plus className="h-4 w-4 mr-1" />メーカー追加</Button>
      </div>

      {crud.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" /></div>
      ) : crud.items.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10 opacity-30" />}
          title="メーカーがまだ登録されていません"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crud.items.map((m) => (
            <div key={m.id} className="rounded-xl border bg-card p-4 space-y-2 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold truncate">{m.name}</span>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => crud.openEdit(m)} aria-label="編集">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(m)}
                    aria-label="削除"
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

      <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{crud.isEditing ? "メーカー編集" : "メーカー追加"}</DialogTitle>
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
              <Button variant="outline" onClick={crud.closeDialog}>キャンセル</Button>
              <Button onClick={handleSave} disabled={crud.save.isPending || !form.name.trim()}>
                {crud.save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {crud.isEditing ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
