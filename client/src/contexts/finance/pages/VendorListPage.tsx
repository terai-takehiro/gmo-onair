/**
 * VendorListPage — Phase 2A パイロット
 *
 * v2.6.0 で useCrudPage / FilterBar / Pagination の shared プリミティブに移行。
 * 旧実装の検索・ページネーション・Dialog state・useQuery/useMutation のテンプレが
 * 全て shared フックに集約された。
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { FilterBar } from "@gmo-onair/shared/src/client/ui/filter-bar";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { CrudFormDialog } from "@gmo-onair/shared/src/client/ui/crud-form-dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";
import { useCrudPage } from "@/hooks/useCrudPage";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { EmptyState } from '@gmo-onair/shared/src/client/states';

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

const EMPTY_FORM: VendorForm = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  invoice_registration_number: "",
};

export default function VendorListPage() {
  const crud = useCrudPage<Vendor>({
    endpoint: "/vendors",
    queryKey: ["vendors"],
  });

  const form = useForm<VendorForm>({ defaultValues: EMPTY_FORM });

  // editingItem が変わったら form を同期
  useEffect(() => {
    if (crud.editingItem) {
      form.reset({
        name: crud.editingItem.name || "",
        contact_name: crud.editingItem.contact_name || "",
        email: crud.editingItem.email || "",
        phone: crud.editingItem.phone || "",
        invoice_registration_number: crud.editingItem.invoice_registration_number || "",
      });
    } else {
      form.reset(EMPTY_FORM);
    }
  }, [crud.editingItem, form]);

  const handleDelete = async (v: Vendor) => {
    if (!(await confirmAction({ title: `「${v.name}」を削除しますか？`, confirmLabel: '削除する', tone: 'danger' }))) return;
    crud.remove.mutate(v.id);
  };

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageTitle>仕入先マスター</PageTitle>
          <div className="flex flex-wrap gap-2">
            <ExcelToolbar resource="/vendors" name="仕入先" queryKey={["vendors"]} />
            <Button onClick={crud.openAdd}>
              <Plus className="mr-2 h-4 w-4" />新規追加
            </Button>
          </div>
        </div>

        <FilterBar
          search={crud.search}
          onSearchChange={crud.setSearch}
          searchPlaceholder="仕入先名で検索..."
          layout="inline"
        />

        {crud.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : crud.items.length === 0 ? (
          <EmptyState title="該当する仕入先がありません" description="検索条件を変えるか、新規追加してください。" />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {crud.items.map((v) => (
                <div key={v.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {v.contact_name && <span>{v.contact_name}</span>}
                        {v.phone && <span>{v.contact_name ? " / " : ""}{v.phone}</span>}
                        {!v.contact_name && !v.phone && "-"}
                      </div>
                      {v.email && <div className="text-sm text-muted-foreground truncate">{v.email}</div>}
                      {v.invoice_registration_number && (
                        <div className="text-xs text-muted-foreground mt-0.5">{v.invoice_registration_number}</div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => crud.openEdit(v)} aria-label="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(v)} aria-label="削除">
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
                data={crud.items}
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
                    className: " text-xs",
                    cell: (v) => v.invoice_registration_number || "-",
                  },
                ] as DataTableColumn<Vendor>[]}
                actionsWidth={96}
                actions={(v) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => crud.openEdit(v)} aria-label="編集">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(v)} aria-label="削除">
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
          title={{ create: "仕入先追加", edit: "仕入先編集" }}
          description={{ create: "新しい仕入先を追加します", edit: "仕入先情報を編集します" }}
          submitLabel="保存"
          onSubmit={form.handleSubmit((v) => crud.save.mutate(v))}
        >
          <div>
            <Label>仕入先名 *</Label>
            <Input {...form.register("name", { required: true })} />
          </div>
          <div>
            <Label>担当者名</Label>
            <Input {...form.register("contact_name")} />
          </div>
          <div>
            <Label>メール</Label>
            <Input type="email" {...form.register("email")} />
          </div>
          <div>
            <Label>電話</Label>
            <Input {...form.register("phone")} />
          </div>
          <div>
            <Label>適格請求書番号</Label>
            <Input {...form.register("invoice_registration_number")} placeholder="T1234567890123" />
          </div>
        </CrudFormDialog>
      </div>
    </PageTransition>
  );
}
