import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, Plus, Pencil, Trash2, ExternalLink, Building2 } from "lucide-react";

type RoleFilter = "all" | "customer" | "vendor" | "both";

interface Company {
  id: string;
  name: string;
  short_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_customer: boolean;
  is_vendor: boolean;
  vendor_type?: string;
  invoice_registration_number?: string;
  notes?: string;
  customer_id?: string;
  vendor_id?: string;
}

interface CompanyForm {
  name: string;
  short_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  is_customer: boolean;
  is_vendor: boolean;
  vendor_type: string;
  invoice_registration_number: string;
  notes: string;
}

const roleTabs: { value: RoleFilter; label: string }[] = [
  { value: "all",      label: "全て" },
  { value: "customer", label: "顧客" },
  { value: "vendor",   label: "仕入先" },
  { value: "both",     label: "顧客兼仕入先" },
];

export default function CompanyListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<RoleFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  const form = useForm<CompanyForm>({
    defaultValues: {
      name: "", short_name: "", contact_name: "", email: "", phone: "",
      address: "", is_customer: false, is_vendor: false,
      vendor_type: "", invoice_registration_number: "", notes: "",
    },
  });
  const watchIsVendor = form.watch("is_vendor");

  const { data, isLoading } = useQuery({
    queryKey: ["companies", page, search, role],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 30 };
      if (search) params.search = search;
      if (role !== "all") params.role = role;
      return (await api.get("/companies", { params })).data;
    },
  });
  const companies: Company[] = data?.data ?? [];
  const pagination = data?.pagination;

  const saveMutation = useMutation({
    mutationFn: async (values: CompanyForm) => {
      if (editingId) return (await api.put(`/companies/${editingId}`, values)).data;
      return (await api.post("/companies", values)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/companies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      setDeleteTarget(null);
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      name: "", short_name: "", contact_name: "", email: "", phone: "",
      address: "", is_customer: false, is_vendor: false,
      vendor_type: "", invoice_registration_number: "", notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (c: Company) => {
    setEditingId(c.id);
    form.reset({
      name: c.name,
      short_name: c.short_name || "",
      contact_name: c.contact_name || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      is_customer: !!c.is_customer,
      is_vendor: !!c.is_vendor,
      vendor_type: c.vendor_type || "",
      invoice_registration_number: c.invoice_registration_number || "",
      notes: c.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  const handleSave = form.handleSubmit((values) => saveMutation.mutate(values));

  return (
    <PageTransition>
    <div className="space-y-4 p-3 lg:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">取引先マスター</h1>
          <p className="text-sm text-muted-foreground mt-0.5">顧客・仕入先を統合管理します</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          新規取引先
        </Button>
      </div>

      {/* Tab filter */}
      <Tabs value={role} onValueChange={(v) => { setRole(v as RoleFilter); setPage(1); }}>
        <TabsList>
          {roleTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="取引先名・担当者名で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 opacity-20" />
          <p>取引先がありません</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {companies.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium">{c.name}</p>
                      {c.short_name && <span className="text-xs text-muted-foreground">({c.short_name})</span>}
                    </div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.is_customer && <Badge variant="secondary" className="text-xs">顧客</Badge>}
                      {c.is_vendor && <Badge variant="outline" className="text-xs">{c.vendor_type || "仕入先"}</Badge>}
                    </div>
                    {c.contact_name && <p className="text-xs text-muted-foreground mt-1">{c.contact_name}</p>}
                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {c.customer_id && (
                    <button
                      className="text-xs text-primary hover:underline flex items-center gap-0.5"
                      onClick={() => navigate("/sales/customers")}
                    >
                      <ExternalLink className="h-3 w-3" />顧客ページ
                    </button>
                  )}
                  {c.vendor_id && (
                    <button
                      className="text-xs text-primary hover:underline flex items-center gap-0.5"
                      onClick={() => navigate("/budget/vendors")}
                    >
                      <ExternalLink className="h-3 w-3" />仕入先ページ
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>取引先名</TableHead>
                  <TableHead>役割</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>インボイス番号</TableHead>
                  <TableHead>連携</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        {c.short_name && <p className="text-xs text-muted-foreground">{c.short_name}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {c.is_customer && <Badge variant="secondary" className="text-xs">顧客</Badge>}
                        {c.is_vendor && (
                          <Badge variant="outline" className="text-xs">{c.vendor_type || "仕入先"}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.contact_name || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                      {c.email || "-"}
                    </TableCell>
                    <TableCell className="text-sm">{c.phone || "-"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {c.invoice_registration_number || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {c.customer_id && (
                          <button
                            className="text-xs text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap"
                            onClick={() => navigate("/sales/customers")}
                          >
                            <ExternalLink className="h-3 w-3" />顧客
                          </button>
                        )}
                        {c.vendor_id && (
                          <button
                            className="text-xs text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap"
                            onClick={() => navigate("/budget/vendors")}
                          >
                            <ExternalLink className="h-3 w-3" />仕入先
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(c)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                全{pagination.total}件中{" "}
                {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)}件
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>前へ</Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "取引先を編集" : "新規取引先登録"}</DialogTitle>
            <DialogDescription>
              役割を選択すると、顧客マスター・仕入先マスターにも自動で追加されます。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            {/* 役割（最初に選択させる） */}
            <div className="space-y-2">
              <Label>役割（複数選択可）</Label>
              <div className="flex gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_customer"
                    checked={form.watch("is_customer")}
                    onCheckedChange={(v) => form.setValue("is_customer", !!v)}
                  />
                  <Label htmlFor="is_customer" className="cursor-pointer font-normal">顧客（売上管理で選択可能）</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_vendor"
                    checked={form.watch("is_vendor")}
                    onCheckedChange={(v) => form.setValue("is_vendor", !!v)}
                  />
                  <Label htmlFor="is_vendor" className="cursor-pointer font-normal">仕入先（仕入管理で選択可能）</Label>
                </div>
              </div>
            </div>

            {/* 基本情報 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="name">取引先名 *</Label>
                <Input id="name" {...form.register("name", { required: true })} placeholder="株式会社〇〇" />
              </div>
              <div>
                <Label htmlFor="short_name">略称</Label>
                <Input id="short_name" {...form.register("short_name")} placeholder="〇〇" />
              </div>
              <div>
                <Label htmlFor="contact_name">担当者名</Label>
                <Input id="contact_name" {...form.register("contact_name")} placeholder="山田 太郎" />
              </div>
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" {...form.register("email")} />
              </div>
              <div>
                <Label htmlFor="phone">電話番号</Label>
                <Input id="phone" {...form.register("phone")} />
              </div>
            </div>

            <div>
              <Label htmlFor="address">住所</Label>
              <Input id="address" {...form.register("address")} />
            </div>

            {/* 仕入先固有（is_vendor の時のみ表示） */}
            {watchIsVendor && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">仕入先設定</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="vendor_type">種別</Label>
                    <Input id="vendor_type" {...form.register("vendor_type")} placeholder="制作会社・フリーランス等" />
                  </div>
                  <div>
                    <Label htmlFor="invoice_registration_number">インボイス登録番号</Label>
                    <Input id="invoice_registration_number" {...form.register("invoice_registration_number")} placeholder="T1234567890123" />
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="notes">備考</Label>
              <Textarea id="notes" {...form.register("notes")} rows={2} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>キャンセル</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editingId ? "更新" : "登録"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>取引先を削除</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}」を削除します。<br />
              顧客マスター・仕入先マスターの対応レコードは削除されません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
