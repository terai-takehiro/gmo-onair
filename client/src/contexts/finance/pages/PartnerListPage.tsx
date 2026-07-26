/**
 * PartnerListPage — Phase 2A 移行 (v2.6.4)
 * useCrudPage / FilterBar / Pagination の shared プリミティブを使用。
 */
import { useEffect } from "react";
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
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";
import { useCrudPage } from "@/hooks/useCrudPage";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface Partner {
  id: string;
  name: string;
  role_title?: string;
  email?: string;
  phone?: string;
  specialties?: string[];
}

interface PartnerForm {
  name: string;
  role_title: string;
  email: string;
  phone: string;
  specialties: string;
}

const EMPTY_FORM: PartnerForm = {
  name: "",
  role_title: "",
  email: "",
  phone: "",
  specialties: "",
};

export default function PartnerListPage() {
  const crud = useCrudPage<Partner>({
    endpoint: "/partners",
    queryKey: ["partners"],
  });

  const form = useForm<PartnerForm>({ defaultValues: EMPTY_FORM });

  // editingItem 同期
  useEffect(() => {
    if (crud.editingItem) {
      form.reset({
        name: crud.editingItem.name || "",
        role_title: crud.editingItem.role_title || "",
        email: crud.editingItem.email || "",
        phone: crud.editingItem.phone || "",
        specialties: Array.isArray(crud.editingItem.specialties)
          ? crud.editingItem.specialties.join(", ")
          : "",
      });
    } else {
      form.reset(EMPTY_FORM);
    }
  }, [crud.editingItem, form]);

  const onSubmit = (values: PartnerForm) => {
    crud.save.mutate({
      name: values.name,
      role_title: values.role_title,
      email: values.email,
      phone: values.phone,
      specialties: values.specialties
        ? values.specialties.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    });
  };

  const handleDelete = (p: Partner) => {
    if (!confirm(`「${p.name}」を削除しますか？`)) return;
    crud.remove.mutate(p.id);
  };

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PageTitle>パートナーマスター</PageTitle>
          <div className="flex flex-wrap gap-2">
            <ExcelToolbar resource="/partners" name="パートナー" queryKey={["partners"]} />
            <Button onClick={crud.openAdd}>
              <Plus className="mr-2 h-4 w-4" />新規追加
            </Button>
          </div>
        </div>

        <FilterBar
          search={crud.search}
          onSearchChange={crud.setSearch}
          searchPlaceholder="パートナー名で検索..."
          layout="inline"
        />

        {crud.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : crud.items.length === 0 ? (
          <EmptyState title="該当するパートナーがありません" description="検索条件を変えるか、新規追加してください。" />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {crud.items.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{p.name}</span>
                        {p.role_title && (
                          <span className="text-xs text-muted-foreground shrink-0">{p.role_title}</span>
                        )}
                      </div>
                      {Array.isArray(p.specialties) && p.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.specialties.map((s: string, i: number) => (
                            <span key={i} className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs">
                              {s.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground mt-1 truncate">
                        {p.email && <span>{p.email}</span>}
                        {p.phone && <span>{p.email ? " / " : ""}{p.phone}</span>}
                        {!p.email && !p.phone && "-"}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => crud.openEdit(p)} aria-label="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p)} aria-label="削除">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block">
              <DataTable<Partner>
                data={crud.items}
                rowKey={(p) => p.id}
                storageKey="partners"
                columns={[
                  { key: "name", header: "パートナー名", defaultWidth: 220, className: "font-medium", cell: (p) => p.name },
                  { key: "role_title", header: "役職", defaultWidth: 160, cell: (p) => p.role_title || "-" },
                  { key: "email", header: "メール", defaultWidth: 220, cell: (p) => p.email || "-" },
                  { key: "phone", header: "電話", defaultWidth: 140, cell: (p) => p.phone || "-" },
                  {
                    key: "specialties",
                    header: "専門分野",
                    defaultWidth: 240,
                    sortValue: (p) => (Array.isArray(p.specialties) ? p.specialties.join(", ") : ""),
                    cell: (p) => (
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(p.specialties) && p.specialties.length > 0
                          ? p.specialties.map((s: string, i: number) => (
                              <span key={i} className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs">
                                {s.trim()}
                              </span>
                            ))
                          : "-"}
                      </div>
                    ),
                  },
                ] as DataTableColumn<Partner>[]}
                actionsWidth={96}
                actions={(p) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => crud.openEdit(p)} aria-label="編集">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p)} aria-label="削除">
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
          title={{ create: "パートナー追加", edit: "パートナー編集" }}
          description={{ create: "新しいパートナーを追加します", edit: "パートナー情報を編集します" }}
          submitLabel="保存"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div><Label>パートナー名 *</Label><Input {...form.register("name", { required: true })} /></div>
          <div><Label>役職</Label><Input {...form.register("role_title")} /></div>
          <div><Label>メール</Label><Input type="email" {...form.register("email")} /></div>
          <div><Label>電話</Label><Input {...form.register("phone")} /></div>
          <div><Label>専門分野 (カンマ区切り)</Label><Input {...form.register("specialties")} placeholder="映像,音響,照明" /></div>
        </CrudFormDialog>
      </div>
    </PageTransition>
  );
}
