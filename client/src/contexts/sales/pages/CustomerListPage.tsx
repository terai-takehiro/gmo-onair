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

interface Customer {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface CustomerForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
}

export default function CustomerListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<CustomerForm>({
    defaultValues: { name: "", contact_name: "", email: "", phone: "", address: "" },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["customers", page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      return (await api.get("/customers", { params })).data;
    },
  });

  const customers: Customer[] = data?.data ?? [];
  const pagination = data?.pagination;

  const saveMutation = useMutation({
    mutationFn: async (values: CustomerForm) => {
      if (editingId) {
        return (await api.put(`/customers/${editingId}`, values)).data;
      }
      return (await api.post("/customers", values)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/customers/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    form.reset({ name: "", contact_name: "", email: "", phone: "", address: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    form.reset({
      name: c.name || "",
      contact_name: c.contact_name || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  return (
    <PageTransition>
    <div className="space-y-4 p-3 lg:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">顧客マスター</h1>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          新規追加
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="顧客名で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {customers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {customers.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {c.contact_name && <span>{c.contact_name}</span>}
                          {c.phone && <span>{c.contact_name ? " / " : ""}{c.phone}</span>}
                          {!c.contact_name && !c.phone && "-"}
                        </div>
                        {c.email && (
                          <div className="text-sm text-muted-foreground truncate">{c.email}</div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block">
                <DataTable<Customer>
                  data={customers}
                  rowKey={(c) => c.id}
                  storageKey="customers"
                  columns={[
                    { key: "name", header: "顧客名", defaultWidth: 240, className: "font-medium", cell: (c) => c.name },
                    { key: "contact_name", header: "担当者", defaultWidth: 160, cell: (c) => c.contact_name || "-" },
                    { key: "email", header: "メール", defaultWidth: 220, cell: (c) => c.email || "-" },
                    { key: "phone", header: "電話", defaultWidth: 140, cell: (c) => c.phone || "-" },
                    { key: "address", header: "住所", defaultWidth: 240, cell: (c) => c.address || "-" },
                  ] as DataTableColumn<Customer>[]}
                  actionsWidth={96}
                  actions={(c) => (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            <DialogTitle>{editingId ? "顧客編集" : "顧客追加"}</DialogTitle>
            <DialogDescription>{editingId ? "顧客情報を編集します" : "新しい顧客を追加します"}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <div><Label>顧客名 *</Label><Input {...form.register("name", { required: true })} /></div>
            <div><Label>担当者名</Label><Input {...form.register("contact_name")} /></div>
            <div><Label>メール</Label><Input type="email" {...form.register("email")} /></div>
            <div><Label>電話</Label><Input {...form.register("phone")} /></div>
            <div><Label>住所</Label><Input {...form.register("address")} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>キャンセル</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
