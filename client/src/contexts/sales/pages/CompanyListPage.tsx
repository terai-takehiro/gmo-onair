/**
 * CompanyListPage — 取引先マスターの一覧
 *
 * useCrudPage / FilterBar / Pagination の shared プリミティブを使用。
 * **入力欄は `company/CompanyFormFields`、収支サマリーは
 * `company/CompanySummaryDialog`** に切り出してある（この画面は一覧と
 * 削除確認だけを持つ）。値の形は `company/types.ts` が1つだけ持つ。
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { FilterBar } from "@gmo-onair/shared/src/client/ui/filter-bar";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { CrudFormDialog } from "@gmo-onair/shared/src/client/ui/crud-form-dialog";
import { useCrudPage } from "@/hooks/useCrudPage";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, ExternalLink, Building2, BarChart3 } from "lucide-react";
import { CompanyFormFields } from "./company/CompanyFormFields";
import { CompanySummaryDialog } from "./company/CompanySummaryDialog";
import { EMPTY_COMPANY_FORM, type Company, type CompanyForm } from "./company/types";

type RoleFilter = "all" | "customer" | "vendor" | "sga_payee" | "both" | "other";

const roleTabs: { value: RoleFilter; label: string }[] = [
  { value: "all",       label: "全て" },
  { value: "customer",  label: "顧客" },
  { value: "vendor",    label: "仕入先" },
  { value: "sga_payee", label: "販管費支払先" },
  { value: "both",      label: "顧客兼仕入先" },
  { value: "other",     label: "その他" },
];

/** `roleTabs` の値だけを受け付ける。知らない値は無視して既定（全て）に落ちる */
function isRoleFilter(v: string | null): v is RoleFilter {
  return !!v && roleTabs.some((t) => t.value === v);
}

export default function CompanyListPage() {
  const navigate = useNavigate();
  // **絞り込みを URL に持たせる**（Phase 2）。`/sales/customers` → ここへの転送が
  // `?role=customer` を付けて来るので、開いた瞬間から「顧客」タブが選ばれている
  // 必要がある。ここが無いと「顧客一覧を開いたのに全件が出る」ことになる
  const [params, setParams] = useSearchParams();
  const roleParam = params.get("role");
  const [role, setRole] = useState<RoleFilter>(isRoleFilter(roleParam) ? roleParam : "all");
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<Company | null>(null);

  const changeRole = (v: RoleFilter) => {
    setRole(v);
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("role"); else next.set("role", v);
    setParams(next, { replace: true });
  };

  const crud = useCrudPage<Company>({
    endpoint: "/companies",
    queryKey: ["companies"],
    pageSize: 30,
    extraParams: { role: role === "all" ? undefined : role },
  });

  const form = useForm<CompanyForm>({ defaultValues: EMPTY_COMPANY_FORM });

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
        is_gmo_group: !!c.is_gmo_group,
        vendor_type: c.vendor_type || "",
        invoice_registration_number: c.invoice_registration_number || "",
        notes: c.notes || "",
      });
    } else {
      form.reset(EMPTY_COMPANY_FORM);
    }
    // **`crud.dialogOpen` も見る**（PR #129 のレビュー・P2）。`editingItem` だけだと
    // 続けて2件登録するとき2回とも `null` で走らず、**前の入力が残ります**
  }, [crud.editingItem, crud.dialogOpen, form]);

  const handleSave = form.handleSubmit((values) => crud.save.mutate(values));

  return (
    <PageTransition>
      <div className="space-y-4 p-3 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">取引先マスター</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              顧客・仕入先・販管費支払先を1つの台帳で管理します（同じ会社は1回登録すれば足ります）
            </p>
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
            changeRole(v as RoleFilter);
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
                        {c.is_gmo_group && <Badge variant="outline" className="text-xs border-primary text-primary">グループ</Badge>}
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
                    {c.is_customer && (
                      <button
                        className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        onClick={() => navigate(`/sales/customers/${c.id}`)}
                      >
                        <ExternalLink className="h-3 w-3" />取引実績を見る
                      </button>
                    )}
                    {c.is_vendor && (
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
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate">{c.name}</p>
                          {/* **グループは役割の列に混ぜない** — 顧客・仕入先とは別の軸で、
                              混ぜると「グループという役割がある」と読まれる */}
                          {c.is_gmo_group && (
                            <Badge variant="outline" className="shrink-0 text-xs border-primary text-primary">グループ</Badge>
                          )}
                        </div>
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
                    className: "text-xs  text-muted-foreground",
                    cell: (c) => c.invoice_registration_number || "-",
                  },
                  {
                    key: "linked",
                    header: "連携",
                    defaultWidth: 140,
                    sortable: false,
                    cell: (c) => (
                      <div className="flex gap-2">
                        {c.is_customer && (
                          <button
                            className="text-xs text-primary hover:underline flex items-center gap-0.5 whitespace-nowrap"
                            onClick={(e) => { e.stopPropagation(); navigate(`/sales/customers/${c.id}`); }}
                          >
                            <ExternalLink className="h-3 w-3" />取引実績
                          </button>
                        )}
                        {c.is_vendor && (
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
          <CompanyFormFields form={form} editing={!!crud.editingItem} open={crud.dialogOpen} />
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
