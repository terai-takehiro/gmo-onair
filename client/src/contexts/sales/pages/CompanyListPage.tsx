/**
 * CompanyListPage — Phase 2A 移行 (v2.6.4)
 * useCrudPage / FilterBar / Pagination の shared プリミティブを使用。
 * 削除確認 / 収支サマリーは独立ダイアログのため別 useState で管理。
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { FilterBar } from "@gmo-onair/shared/src/client/ui/filter-bar";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { CrudFormDialog } from "@gmo-onair/shared/src/client/ui/crud-form-dialog";
import api from "@/lib/api";
import { useCrudPage } from "@/hooks/useCrudPage";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, ExternalLink, Building2, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

type RoleFilter = "all" | "customer" | "vendor" | "sga_payee" | "both" | "other";

interface CompanySummary {
  company_id: string;
  revenue: { total: number; count: number };
  purchase: { total: number; count: number };
  sga: { total: number; count: number };
}

function CompanySummaryDialog({ open, onOpenChange, company }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: { id: string; name: string } | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["company-summary", company?.id],
    queryFn: async () => (await api.get(`/companies/${company!.id}/summary`)).data,
    enabled: open && !!company?.id,
  });
  const summary: CompanySummary | null = data?.data ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {company?.name} の収支サマリー
          </DialogTitle>
          <DialogDescription>この取引先を相手方とする売上・仕入・販管費の累計</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : summary ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                <p className="text-xs text-blue-700 dark:text-blue-300">売上</p>
                <p className="text-sm font-bold font-number mt-1">{formatCurrency(summary.revenue.total)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{summary.revenue.count}件</p>
              </div>
              <div className="rounded-lg border bg-orange-50 dark:bg-orange-950/30 p-3 text-center">
                <p className="text-xs text-orange-700 dark:text-orange-300">仕入</p>
                <p className="text-sm font-bold font-number mt-1">{formatCurrency(summary.purchase.total)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{summary.purchase.count}件</p>
              </div>
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                <p className="text-xs text-amber-700 dark:text-amber-300">販管費</p>
                <p className="text-sm font-bold font-number mt-1">{formatCurrency(summary.sga.total)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{summary.sga.count}件</p>
              </div>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">収支バランス（売上 - 仕入 - 販管費）</p>
              <p className={`text-lg font-bold font-number mt-1 ${
                summary.revenue.total - summary.purchase.total - summary.sga.total >= 0
                  ? "text-green-700" : "text-red-700"
              }`}>
                {formatCurrency(summary.revenue.total - summary.purchase.total - summary.sga.total)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">データがありません</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
  is_sga_payee?: boolean;
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
  is_sga_payee?: boolean;
  vendor_type: string;
  invoice_registration_number: string;
  notes: string;
}

const EMPTY_FORM: CompanyForm = {
  name: "", short_name: "", contact_name: "", email: "", phone: "",
  address: "", is_customer: false, is_vendor: false, is_sga_payee: false,
  vendor_type: "", invoice_registration_number: "", notes: "",
};

const roleTabs: { value: RoleFilter; label: string }[] = [
  { value: "all",       label: "全て" },
  { value: "customer",  label: "顧客" },
  { value: "vendor",    label: "仕入先" },
  { value: "sga_payee", label: "販管費支払先" },
  { value: "both",      label: "顧客兼仕入先" },
  { value: "other",     label: "その他" },
];

export default function CompanyListPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<RoleFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<Company | null>(null);

  const crud = useCrudPage<Company>({
    endpoint: "/companies",
    queryKey: ["companies"],
    pageSize: 30,
    extraParams: { role: role === "all" ? undefined : role },
  });

  const form = useForm<CompanyForm>({ defaultValues: EMPTY_FORM });
  const watchIsVendor = form.watch("is_vendor");

  useEffect(() => {
    if (crud.editingItem) {
      const c = crud.editingItem;
      form.reset({
        name: c.name,
        short_name: c.short_name || "",
        contact_name: c.contact_name || "",
        email: c.email || "",
        phone: c.phone || "",
        address: c.address || "",
        is_customer: !!c.is_customer,
        is_vendor: !!c.is_vendor,
        is_sga_payee: !!c.is_sga_payee,
        vendor_type: c.vendor_type || "",
        invoice_registration_number: c.invoice_registration_number || "",
        notes: c.notes || "",
      });
    } else {
      form.reset(EMPTY_FORM);
    }
  }, [crud.editingItem, form]);

  const handleSave = form.handleSubmit((values) => crud.save.mutate(values));

  return (
    <PageTransition>
      <div className="space-y-4 p-3 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">取引先マスター</h1>
            <p className="text-sm text-muted-foreground mt-0.5">顧客・仕入先を統合管理します</p>
          </div>
          <Button onClick={crud.openAdd}>
            <Plus className="mr-1 h-4 w-4" />
            新規取引先
          </Button>
        </div>

        <FilterBar
          search={crud.search}
          onSearchChange={crud.setSearch}
          searchPlaceholder="取引先名・担当者名で検索..."
          tabs={roleTabs.map((t) => ({ value: t.value, label: t.label }))}
          activeTab={role}
          onTabChange={(v) => {
            setRole(v as RoleFilter);
            crud.setPage(1);
          }}
          layout="stacked"
        />

        {crud.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : crud.items.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-12 w-12 opacity-20" />}
            title="取引先がありません"
            description="検索条件を変えるか、新規取引先を登録してください。"
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {crud.items.map((c) => (
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
                        {c.is_sga_payee && <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">販管費支払先</Badge>}
                      </div>
                      {c.contact_name && <p className="text-xs text-muted-foreground mt-1">{c.contact_name}</p>}
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => crud.openEdit(c)} aria-label="編集">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(c)} aria-label="削除">
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
            <div className="hidden lg:block">
              <DataTable<Company>
                data={crud.items}
                rowKey={(c) => c.id}
                storageKey="companies"
                columns={[
                  {
                    key: "name",
                    header: "取引先名",
                    defaultWidth: 220,
                    cell: (c) => (
                      <div>
                        <p className="font-medium truncate">{c.name}</p>
                        {c.short_name && <p className="text-xs text-muted-foreground truncate">{c.short_name}</p>}
                      </div>
                    ),
                  },
                  {
                    key: "role",
                    header: "役割",
                    defaultWidth: 160,
                    sortValue: (c) => `${c.is_customer ? "顧客" : ""}${c.is_vendor ? (c.vendor_type || "仕入先") : ""}${c.is_sga_payee ? "販管費" : ""}`,
                    cell: (c) => (
                      <div className="flex gap-1 flex-wrap">
                        {c.is_customer && <Badge variant="secondary" className="text-xs">顧客</Badge>}
                        {c.is_vendor && (
                          <Badge variant="outline" className="text-xs">{c.vendor_type || "仕入先"}</Badge>
                        )}
                        {c.is_sga_payee && <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">販管費支払先</Badge>}
                        {!c.is_customer && !c.is_vendor && !c.is_sga_payee && <Badge variant="outline" className="text-xs text-muted-foreground">その他</Badge>}
                      </div>
                    ),
                  },
                  { key: "contact_name", header: "担当者", defaultWidth: 140, className: "text-sm", cell: (c) => c.contact_name || "-" },
                  { key: "email", header: "メール", defaultWidth: 200, className: "text-sm text-muted-foreground", cell: (c) => c.email || "-" },
                  { key: "phone", header: "電話", defaultWidth: 130, className: "text-sm", cell: (c) => c.phone || "-" },
                  {
                    key: "invoice_registration_number",
                    header: "インボイス番号",
                    defaultWidth: 160,
                    className: "text-xs font-mono text-muted-foreground",
                    cell: (c) => c.invoice_registration_number || "-",
                  },
                  {
                    key: "linked",
                    header: "連携",
                    defaultWidth: 140,
                    sortable: false,
                    cell: (c) => (
                      <div className="flex gap-2">
                        {c.customer_id && (
                          <button
                            className="text-xs text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap"
                            onClick={(e) => { e.stopPropagation(); navigate("/sales/customers"); }}
                          >
                            <ExternalLink className="h-3 w-3" />顧客
                          </button>
                        )}
                        {c.vendor_id && (
                          <button
                            className="text-xs text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap"
                            onClick={(e) => { e.stopPropagation(); navigate("/budget/vendors"); }}
                          >
                            <ExternalLink className="h-3 w-3" />仕入先
                          </button>
                        )}
                      </div>
                    ),
                  },
                ] as DataTableColumn<Company>[]}
                actionsWidth={110}
                actions={(c) => (
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="収支サマリー" onClick={() => setSummaryTarget(c)}>
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => crud.openEdit(c)} aria-label="編集">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(c)} aria-label="削除">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              />
            </div>
          </>
        )}

        <Pagination
          page={crud.page}
          totalPages={crud.pagination?.totalPages ?? 1}
          total={crud.pagination?.total ?? 0}
          onChange={crud.setPage}
          disabled={crud.isLoading}
        />

        {/* Create / Edit Dialog */}
        <CrudFormDialog
          crud={crud}
          size="lg"
          title={{ create: "新規取引先登録", edit: "取引先を編集" }}
          description="役割を選択すると、顧客マスター・仕入先マスターにも自動で追加されます。"
          submitLabel={{ create: "登録", edit: "更新" }}
          onSubmit={handleSave}
        >
              <div className="space-y-2">
                <Label>役割（複数選択可 / すべて未選択の場合は「その他」扱い）</Label>
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
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is_sga_payee"
                      checked={!!form.watch("is_sga_payee")}
                      onCheckedChange={(v) => form.setValue("is_sga_payee", !!v)}
                    />
                    <Label htmlFor="is_sga_payee" className="cursor-pointer font-normal">販管費支払先（販管費管理で選択可能）</Label>
                  </div>
                </div>
              </div>

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

        </CrudFormDialog>

        <CompanySummaryDialog
          open={!!summaryTarget}
          onOpenChange={(open) => { if (!open) setSummaryTarget(null); }}
          company={summaryTarget}
        />

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
                disabled={crud.remove.isPending}
                onClick={() => {
                  if (!deleteTarget) return;
                  crud.remove.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }}
              >
                {crud.remove.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                削除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
