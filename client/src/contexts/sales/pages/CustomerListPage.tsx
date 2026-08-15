/**
 * CustomerListPage — Phase 2A 移行 (v2.6.4)
 * useCrudPage / FilterBar / Pagination の shared プリミティブを使用。
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { FilterBar } from "@gmo-onair/shared/src/client/ui/filter-bar";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { CrudFormDialog } from "@gmo-onair/shared/src/client/ui/crud-form-dialog";
import { looksLikeGmoGroup } from "@gmo-onair/shared/src/utils/gmoGroup";
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
  /** GMOインターネットグループのグループ会社か (migration 182) */
  is_gmo_group?: boolean;
  is_ai_created?: boolean;
  ai_requested_by?: string | null;
}

/** AI (MCP) が登録した顧客のバッジ (ActivityLogPage と同意匠) */
function AiCreatedBadge({ requestedBy }: { requestedBy?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 shrink-0"
      title={requestedBy ? `AI が登録しました（指示: ${requestedBy}）` : "AI が登録しました"}
    >
      <Sparkles className="h-3 w-3" />
      AI作成
    </span>
  );
}

interface CustomerForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  is_gmo_group: boolean;
}

const EMPTY_FORM: CustomerForm = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  is_gmo_group: false,
};

export default function CustomerListPage() {
  const navigate = useNavigate();
  const crud = useCrudPage<Customer>({
    endpoint: "/customers",
    queryKey: ["customers"],
  });

  const form = useForm<CustomerForm>({ defaultValues: EMPTY_FORM });
  const watchName = form.watch("name");

  /**
   * **グループの印を社名から自動で入れる**（ご指示・migration 192。取引先マスターと
   * 同じ関数・同じ決めごと）。新しく登録するときだけで、**人が触ったらもう触りません**。
   */
  const groupTouched = useRef(false);
  useEffect(() => {
    if (crud.editingItem || groupTouched.current) return;
    if (looksLikeGmoGroup(watchName) && !form.getValues("is_gmo_group")) {
      form.setValue("is_gmo_group", true);
    }
  }, [watchName, crud.editingItem, form]);

  useEffect(() => {
    if (crud.editingItem) {
      form.reset({
        name: crud.editingItem.name || "",
        contact_name: crud.editingItem.contact_name || "",
        email: crud.editingItem.email || "",
        phone: crud.editingItem.phone || "",
        address: crud.editingItem.address || "",
        // **既定を false にしない。** 編集で開くたびに印が外れ、
        // 保存すると黙ってグループ会社でなくなる
        is_gmo_group: crud.editingItem.is_gmo_group === true,
      });
    } else {
      form.reset(EMPTY_FORM);
    }
    // 開き直したら見立てを効かせ直す（前に開いたお客様で外した印を持ち越さない）
    groupTouched.current = false;
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
          {/*
            **グループ会社の印**（migration 182 → 192）。ここが
            **案件のグループ内 / グループ外を決めます**（見積の単価が定価か
            グループ内価格かも、これで決まります）。リード経路も「グループ案件」に固定されます。

            **社名に GMO が入っていると、新しく登録するときだけ自動で入ります**（ご指示）。
            外した印は保存し直しても戻りません — 戻ると「直しても直らない」ことになります。
            ここと取引先マスターは**保存のたびに双方向で同期**します。
          */}
          <div>
            <label className="flex min-h-tap items-center gap-2.5">
              <input
                type="checkbox"
                {...form.register("is_gmo_group", {
                  // 人が触ったら、以後この登録では社名から入れ直さない
                  onChange: () => { groupTouched.current = true; },
                })}
                className="v4-tap h-5 w-5 shrink-0 accent-primary"
              />
              <span>
                <span className="block">GMOインターネットグループのグループ会社</span>
                <span className="text-note block text-muted-foreground">
                  付けると、この会社の案件は<strong className="font-bold">グループ内</strong>になり、
                  見積の単価がグループ内価格になります（リード経路も「グループ案件」に固定）
                </span>
              </span>
            </label>
          </div>
        </CrudFormDialog>
      </div>
    </PageTransition>
  );
}
