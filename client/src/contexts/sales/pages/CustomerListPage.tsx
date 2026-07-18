/**
 * CustomerListPage — Phase 2A 移行 (v2.6.4)
 * useCrudPage / FilterBar / Pagination の shared プリミティブを使用。
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { FilterBar } from "@gmo-onair/shared/src/client/ui/filter-bar";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { CrudFormDialog } from "@gmo-onair/shared/src/client/ui/crud-form-dialog";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Plus, Pencil, Trash2, Loader2, Sparkles } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";
import { useCrudPage } from "@/hooks/useCrudPage";

interface Customer {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_ai_created?: boolean;
  ai_requested_by?: string | null;
}

/** AI (MCP) が登録した顧客のバッジ (ActivityLogPage と同意匠) */
function AiCreatedBadge({ requestedBy }: { requestedBy?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 shrink-0"
      title={requestedBy ? `AI登録（指示者: ${requestedBy}）` : "AI登録"}
    >
      <Sparkles className="h-3 w-3" />
      AI登録
    </span>
  );
}

interface CustomerForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
}

const EMPTY_FORM: CustomerForm = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
};

export default function CustomerListPage() {
  const navigate = useNavigate();
  const crud = useCrudPage<Customer>({
    endpoint: "/customers",
    queryKey: ["customers"],
  });

  const form = useForm<CustomerForm>({ defaultValues: EMPTY_FORM });

  useEffect(() => {
    if (crud.editingItem) {
      form.reset({
        name: crud.editingItem.name || "",
        contact_name: crud.editingItem.contact_name || "",
        email: crud.editingItem.email || "",
        phone: crud.editingItem.phone || "",
        address: crud.editingItem.address || "",
      });
    } else {
      form.reset(EMPTY_FORM);
    }
  }, [crud.editingItem, form]);

  const handleDelete = (c: Customer) => {
    if (!confirm(`「${c.name}」を削除しますか？`)) return;
    crud.remove.mutate(c.id);
  };

  return (
    <PageTransition>
      <div className="space-y-4 p-3 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl lg:text-2xl font-bold">顧客マスター</h1>
          <div className="flex flex-wrap gap-2">
            <ExcelToolbar resource="/customers" name="顧客" queryKey={["customers"]} />
            <Button onClick={crud.openAdd}>
              <Plus className="mr-2 h-4 w-4" />新規追加
            </Button>
          </div>
        </div>

        <FilterBar
          search={crud.search}
          onSearchChange={crud.setSearch}
          searchPlaceholder="顧客名で検索..."
          layout="inline"
        />

        {crud.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : crud.items.length === 0 ? (
          <EmptyState title="該当する顧客がありません" description="検索条件を変えるか、新規追加してください。" />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {crud.items.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => navigate(`/sales/customers/${c.id}`)}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium truncate text-primary">{c.name}</span>
                        {c.is_ai_created && <AiCreatedBadge requestedBy={c.ai_requested_by} />}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {c.contact_name && <span>{c.contact_name}</span>}
                        {c.phone && <span>{c.contact_name ? " / " : ""}{c.phone}</span>}
                        {!c.contact_name && !c.phone && "-"}
                      </div>
                      {c.email && (
                        <div className="text-sm text-muted-foreground truncate">{c.email}</div>
                      )}
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => crud.openEdit(c)} aria-label="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c)} aria-label="削除">
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
                data={crud.items}
                rowKey={(c) => c.id}
                storageKey="customers"
                onRowClick={(c) => navigate(`/sales/customers/${c.id}`)}
                columns={[
                  {
                    key: "name", header: "顧客名", defaultWidth: 240, className: "font-medium",
                    cell: (c) => (
                      <span className="inline-flex items-center gap-1.5 text-primary">
                        {c.name}
                        {c.is_ai_created && <AiCreatedBadge requestedBy={c.ai_requested_by} />}
                      </span>
                    ),
                  },
                  { key: "contact_name", header: "担当者", defaultWidth: 160, cell: (c) => c.contact_name || "-" },
                  { key: "email", header: "メール", defaultWidth: 220, cell: (c) => c.email || "-" },
                  { key: "phone", header: "電話", defaultWidth: 140, cell: (c) => c.phone || "-" },
                  { key: "address", header: "住所", defaultWidth: 240, cell: (c) => c.address || "-" },
                ] as DataTableColumn<Customer>[]}
                actionsWidth={96}
                actions={(c) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); crud.openEdit(c); }} aria-label="編集">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(c); }} aria-label="削除">
                      <Trash2 className="h-4 w-4" />
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

        <CrudFormDialog
          crud={crud}
          title={{ create: "顧客追加", edit: "顧客編集" }}
          description={{ create: "新しい顧客を追加します", edit: "顧客情報を編集します" }}
          submitLabel="保存"
          onSubmit={form.handleSubmit((v) => crud.save.mutate(v))}
        >
          <div><Label>顧客名 *</Label><Input {...form.register("name", { required: true })} /></div>
          <div><Label>担当者名</Label><Input {...form.register("contact_name")} /></div>
          <div><Label>メール</Label><Input type="email" {...form.register("email")} /></div>
          <div><Label>電話</Label><Input {...form.register("phone")} /></div>
          <div><Label>住所</Label><Input {...form.register("address")} /></div>
        </CrudFormDialog>
      </div>
    </PageTransition>
  );
}
