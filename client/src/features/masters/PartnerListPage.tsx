import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";

interface Partner {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  specialties?: string;
}

interface PartnerForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  specialties: string;
}

export default function PartnerListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<PartnerForm>({
    defaultValues: { name: "", contact_name: "", email: "", phone: "", specialties: "" },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["partners", page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      return (await api.get("/partners", { params })).data;
    },
  });

  const partners: Partner[] = data?.data ?? [];
  const pagination = data?.pagination;

  const saveMutation = useMutation({
    mutationFn: async (values: PartnerForm) => {
      if (editingId) return (await api.put(`/partners/${editingId}`, values)).data;
      return (await api.post("/partners", values)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partners"] }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/partners/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partners"] }); },
  });

  const openAdd = () => {
    setEditingId(null);
    form.reset({ name: "", contact_name: "", email: "", phone: "", specialties: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditingId(p.id);
    form.reset({
      name: p.name || "",
      contact_name: p.contact_name || "",
      email: p.email || "",
      phone: p.phone || "",
      specialties: p.specialties || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">パートナーマスター</h1>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />新規追加</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="パートナー名で検索..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>パートナー名</TableHead>
                <TableHead>担当者</TableHead>
                <TableHead>メール</TableHead>
                <TableHead>電話</TableHead>
                <TableHead>専門分野</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">データがありません</TableCell></TableRow>
              ) : (
                partners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.contact_name || "-"}</TableCell>
                    <TableCell>{p.email || "-"}</TableCell>
                    <TableCell>{p.phone || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.specialties
                          ? p.specialties.split(",").map((s, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {s.trim()}
                              </Badge>
                            ))
                          : "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
            <DialogTitle>{editingId ? "パートナー編集" : "パートナー追加"}</DialogTitle>
            <DialogDescription>{editingId ? "パートナー情報を編集します" : "新しいパートナーを追加します"}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <div><Label>パートナー名 *</Label><Input {...form.register("name", { required: true })} /></div>
            <div><Label>担当者名</Label><Input {...form.register("contact_name")} /></div>
            <div><Label>メール</Label><Input type="email" {...form.register("email")} /></div>
            <div><Label>電話</Label><Input {...form.register("phone")} /></div>
            <div><Label>専門分野 (カンマ区切り)</Label><Input {...form.register("specialties")} placeholder="映像,音響,照明" /></div>
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
  );
}
