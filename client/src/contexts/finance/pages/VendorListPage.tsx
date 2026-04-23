import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

interface Vendor {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  invoice_registration_number?: string;
}

interface VendorForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  invoice_registration_number: string;
}

export default function VendorListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<VendorForm>({
    defaultValues: { name: "", contact_name: "", email: "", phone: "", invoice_registration_number: "" },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["vendors", page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      return (await api.get("/vendors", { params })).data;
    },
  });

  const vendors: Vendor[] = data?.data ?? [];
  const pagination = data?.pagination;

  const saveMutation = useMutation({
    mutationFn: async (values: VendorForm) => {
      if (editingId) return (await api.put(`/vendors/${editingId}`, values)).data;
      return (await api.post("/vendors", values)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/vendors/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); },
  });

  const openAdd = () => {
    setEditingId(null);
    form.reset({ name: "", contact_name: "", email: "", phone: "", invoice_registration_number: "" });
    setDialogOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    form.reset({
      name: v.name || "",
      contact_name: v.contact_name || "",
      email: v.email || "",
      phone: v.phone || "",
      invoice_registration_number: v.invoice_registration_number || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">仕入先マスター</h1>
        <div className="flex flex-wrap gap-2">
          <ExcelToolbar resource="/vendors" name="仕入先" queryKey={["vendors"]} />
          <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />新規追加</Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="仕入先名で検索..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {vendors.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {vendors.map((v) => (
                  <div key={v.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{v.name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {v.contact_name && <span>{v.contact_name}</span>}
                          {v.phone && <span>{v.contact_name ? " / " : ""}{v.phone}</span>}
                          {!v.contact_name && !v.phone && "-"}
                        </div>
                        {v.email && (
                          <div className="text-sm text-muted-foreground truncate">{v.email}</div>
                        )}
                        {v.invoice_registration_number && (
                          <div className="text-xs font-mono text-muted-foreground mt-0.5">{v.invoice_registration_number}</div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(v.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block">
                <DataTable<Vendor>
                  data={vendors}
                  rowKey={(v) => v.id}
                  storageKey="vendors"
                  columns={[
                    { key: "name", header: "仕入先名", defaultWidth: 240, className: "font-medium", cell: (v) => v.name },
                    { key: "contact_name", header: "担当者", defaultWidth: 160, cell: (v) => v.contact_name || "-" },
                    { key: "email", header: "メール", defaultWidth: 220, cell: (v) => v.email || "-" },
                    { key: "phone", header: "電話", defaultWidth: 140, cell: (v) => v.phone || "-" },
                    {
                      key: "invoice_registration_number",
                      header: "適格請求書番号",
                      defaultWidth: 180,
                      className: "font-mono text-xs",
                      cell: (v) => v.invoice_registration_number || "-",
                    },
                  ] as DataTableColumn<Vendor>[]}
                  actionsWidth={96}
                  actions={(v) => (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(v.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                />
              </div>
            </>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">全{pagination.total}件</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>前へ</Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "仕入先編集" : "仕入先追加"}</DialogTitle>
            <DialogDescription>{editingId ? "仕入先情報を編集します" : "新しい仕入先を追加します"}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <div><Label>仕入先名 *</Label><Input {...form.register("name", { required: true })} /></div>
            <div><Label>担当者名</Label><Input {...form.register("contact_name")} /></div>
            <div><Label>メール</Label><Input type="email" {...form.register("email")} /></div>
            <div><Label>電話</Label><Input {...form.register("phone")} /></div>
            <div><Label>適格請求書番号</Label><Input {...form.register("invoice_registration_number")} placeholder="T1234567890123" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>キャンセル</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
